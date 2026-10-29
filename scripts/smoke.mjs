// End-to-end smoke test for the Suly City foundation and road-placement loop. Run after a source build.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: false })
let browser
const guard = setTimeout(() => fail('timed out'), 120_000)

function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}
async function fail(message) {
  console.error(`smoke: FAIL — ${message}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('preview server did not start')
}
async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => response.status() >= 400 && errors.push(`HTTP ${response.status()} ${response.url()}`))
  await page.goto(url)
  await page.waitForFunction(() => Boolean(window.__game), { timeout: 30_000 })
  await page.waitForFunction(() => window.__game.spritesReady, { timeout: 30_000 })
  await page.waitForTimeout(500)
  return page
}
async function clickCell(page, x, z) {
  const point = await page.evaluate(([cellX, cellZ]) => window.__game.projectCellToScreen(cellX, cellZ), [x, z])
  await page.mouse.click(point.x, point.y)
}

try {
  await waitForServer()
  const args = ['--ignore-gpu-blocklist']
  const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
  browser = await chromium.launch({ args, ...(executablePath ? { executablePath } : {}) })
  const errors = []

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  const page = await openGame(desktop, errors)
  const initial = await page.evaluate(() => {
    const { world, camera, renderer, currentMode } = window.__game
    const ground = world.ground
    const grid = world.scene.getObjectByName('city-grid')
    const sun = world.sun
    const ambient = world.ambient
    return {
      cameraType: camera.type,
      position: camera.position.toArray(),
      zoom: camera.zoom,
      mode: currentMode,
      ground: { width: ground.geometry.parameters.width, height: ground.geometry.parameters.height, rotationX: ground.rotation.x, receiveShadow: ground.receiveShadow },
      grid: grid ? { divisions: grid.userData.divisions, cellSize: grid.userData.cellSize } : null,
      lighting: { ambient: ambient.intensity, sun: sun.intensity, shadow: sun.castShadow, shadowType: renderer.gl.shadowMap.type, mapSize: sun.shadow.mapSize.toArray(), shadowCamera: { left: sun.shadow.camera.left, right: sun.shadow.camera.right, top: sun.shadow.camera.top, bottom: sun.shadow.camera.bottom, near: sun.shadow.camera.near, far: sun.shadow.camera.far }, pixelRatio: renderer.gl.getPixelRatio(), antialias: renderer.gl.getContext().getContextAttributes().antialias, powerPreference: renderer.gl.getContext().getContextAttributes().powerPreference },
      buildingCount: world.buildings.length,
      roadCount: world.roads.length,
    }
  })
  if (initial.cameraType !== 'OrthographicCamera') throw new Error(`expected OrthographicCamera, got ${initial.cameraType}`)
  if (initial.ground.width !== 100 || initial.ground.height !== 100 || Math.abs(initial.ground.rotationX + Math.PI / 2) > 1e-6 || !initial.ground.receiveShadow) throw new Error('ground configuration mismatch')
  if (!initial.grid || initial.grid.divisions !== 50 || initial.grid.cellSize !== 2 || initial.lighting.ambient !== 0.6 || initial.lighting.sun !== 1.5 || !initial.lighting.shadow || initial.lighting.shadowType !== 1 || initial.lighting.pixelRatio !== 1 || !initial.lighting.antialias) throw new Error(`renderer/light/grid configuration mismatch: ${JSON.stringify(initial)}`)
  if (JSON.stringify(initial.lighting.shadowCamera) !== JSON.stringify({ left: -62, right: 62, top: 62, bottom: -62, near: 1, far: 180 })) throw new Error(`shadow camera bounds mismatch: ${JSON.stringify(initial.lighting.shadowCamera)}`)
  if (initial.mode !== 'ROAD' || initial.buildingCount !== 0 || initial.roadCount !== 0) throw new Error(`game should start in empty road mode: ${JSON.stringify(initial)}`)
  await page.screenshot({ path: `${out}/01-city-desktop.png` })

  await clickCell(page, 1, 1)
  await page.waitForFunction(() => window.__game.world.roads.length === 1)
  await page.locator('#tool-house').click()
  await clickCell(page, -15, -15)
  await page.waitForTimeout(100)
  const rejected = await page.evaluate(() => ({ count: window.__game.world.buildings.length, color: window.__game.world.scene.getObjectByName('placement-highlight').material.color.getHexString() }))
  if (rejected.count !== 0 || rejected.color !== 'e54848') throw new Error(`building without adjacent road was not rejected/red: ${JSON.stringify(rejected)}`)

  await clickCell(page, 3, 1)
  await page.waitForFunction(() => window.__game.world.buildings.length === 1)
  const placed = await page.evaluate(() => {
    const { world } = window.__game
    const building = world.buildings[0]
    const road = world.roads[0]
    const roadMeshes = []
    road.traverse(node => { if (node.isMesh) roadMeshes.push({ castShadow: node.castShadow, receiveShadow: node.receiveShadow, y: node.position.y }) })
    return {
      position: building.position.toArray(),
      type: building.userData.type,
      mesh: { isMesh: building.isMesh, castShadow: building.castShadow, receiveShadow: building.receiveShadow, renderOrder: building.renderOrder },
      geometry: { width: building.geometry.parameters.width, height: building.geometry.parameters.height, minY: building.geometry.boundingBox?.min.y },
      material: { transparent: building.material.transparent, alphaTest: building.material.alphaTest, side: building.material.side, hasMap: Boolean(building.material.map) },
      roadPosition: road.position.toArray(),
      roadMeshes,
    }
  })
  const firstCellCenter = -initial.ground.width / 2 + initial.grid.cellSize / 2
  const isCenteredOnCell = value => Math.abs((value - firstCellCenter) / initial.grid.cellSize - Math.round((value - firstCellCenter) / initial.grid.cellSize)) < 1e-6
  if (placed.position[1] !== 0 || !isCenteredOnCell(placed.position[0]) || !isCenteredOnCell(placed.position[2]) || placed.type !== 'HOUSE' || !placed.mesh.isMesh || placed.mesh.castShadow || placed.mesh.receiveShadow || Math.abs(placed.geometry.minY) > 1e-6 || placed.geometry.height < 4 || !placed.material.transparent || placed.material.alphaTest !== 0.5 || !placed.material.hasMap) throw new Error(`sprite pivot/material/shadow mismatch: ${JSON.stringify(placed)}`)
  if (placed.roadPosition[1] !== 0 || placed.roadMeshes.length < 8 || placed.roadMeshes[0].y !== 0.01 || !placed.roadMeshes[0].receiveShadow) throw new Error(`road tile geometry/height/shadow mismatch: ${JSON.stringify(placed.roadMeshes)}`)

  await page.locator('#tool-road').click()
  await clickCell(page, 1, 3)
  await page.waitForFunction(() => window.__game.world.roads.length === 2)
  await page.locator('#tool-shop').click()
  await clickCell(page, 1, 5)
  await page.waitForFunction(() => window.__game.world.buildings.length === 2)
  await page.locator('#tool-road').click()
  await clickCell(page, 3, 3)
  await page.waitForFunction(() => window.__game.world.roads.length === 3)
  await page.locator('#tool-skyscraper').click()
  await clickCell(page, 3, 5)
  await page.waitForFunction(() => window.__game.world.buildings.length === 3)
  const sortedSprites = await page.evaluate(() => window.__game.world.buildings.map(building => ({ type: building.userData.type, renderOrder: building.renderOrder })))
  const orderByType = Object.fromEntries(sortedSprites.map(building => [building.type, building.renderOrder]))
  if (sortedSprites.length !== 3 || orderByType.HOUSE >= orderByType.SHOP || orderByType.SHOP >= orderByType.SKYSCRAPER) throw new Error(`sprite depth sort mismatch: ${JSON.stringify(sortedSprites)}`)

  await page.evaluate(() => window.__game.zoomCameraByFactor(2.3))
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${out}/02-city-sprites.png` })
  await page.evaluate(() => window.__game.zoomCameraByFactor(1 / 2.3))

  const cameraBefore = await page.evaluate(() => window.__game.camera.position.toArray())
  await page.mouse.move(900, 360)
  await page.mouse.down()
  await page.mouse.move(980, 410, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(350)
  const cameraAfter = await page.evaluate(() => ({ position: window.__game.camera.position.toArray(), count: window.__game.world.buildings.length }))
  if (Math.hypot(...cameraAfter.position.map((value, index) => value - cameraBefore[index])) < 0.1) throw new Error('drag did not pan the camera')
  if (cameraAfter.count !== 3) throw new Error('camera drag placed an unintended building')
  const zoomBefore = await page.evaluate(() => window.__game.camera.zoom)
  await page.mouse.wheel(0, -250)
  await page.waitForTimeout(100)
  const zoomAfter = await page.evaluate(() => window.__game.camera.zoom)
  if (zoomAfter <= zoomBefore) throw new Error('wheel zoom did not increase OrthographicCamera.zoom')
  console.log(`smoke: desktop camera=${initial.cameraType}, sprite types=${sortedSprites.map(item => item.type).join(',')}, drag=inertial, zoom=${zoomAfter.toFixed(2)}`)
  await desktop.close()

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const phonePage = await openGame(phone, errors)
  const phoneRatio = await phonePage.evaluate(() => window.__game.renderer.gl.getPixelRatio())
  if (phoneRatio !== 2) throw new Error(`expected mobile pixel ratio 2, got ${phoneRatio}`)
  await phonePage.screenshot({ path: `${out}/03-city-mobile.png` })
  await clickCell(phonePage, 1, 1)
  await phonePage.waitForFunction(() => window.__game.world.roads.length === 1)
  await phonePage.locator('#tool-house').click()
  await clickCell(phonePage, 3, 1)
  await phonePage.waitForFunction(() => window.__game.world.buildings.length === 1)
  const mobilePlacement = await phonePage.evaluate(() => window.__game.world.buildings[0].position.toArray())
  if (mobilePlacement[1] !== 0 || !isCenteredOnCell(mobilePlacement[0]) || !isCenteredOnCell(mobilePlacement[2])) throw new Error(`mobile placement did not ground on an adjacent cell: ${mobilePlacement}`)

  const cdp = await phone.newCDPSession(phonePage)
  const mobileZoomBefore = await phonePage.evaluate(() => window.__game.camera.zoom)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 135, y: 430, id: 11 }, { x: 255, y: 430, id: 12 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 105, y: 430, id: 11 }, { x: 285, y: 430, id: 12 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await phonePage.waitForTimeout(150)
  const mobileZoomAfter = await phonePage.evaluate(() => window.__game.camera.zoom)
  if (mobileZoomAfter <= mobileZoomBefore) throw new Error(`pinch did not zoom the orthographic camera: ${mobileZoomBefore} -> ${mobileZoomAfter}`)
  await phone.close()

  if (errors.length) throw new Error(`console/network errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — desktop and mobile captures in ${out}/`)
} catch (error) {
  await fail(error?.message ?? String(error))
}
