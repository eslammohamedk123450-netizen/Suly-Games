// End-to-end smoke test for the Suly City foundation. Run after `pnpm build`.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
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
  await page.waitForTimeout(500)
  return page
}

try {
  await waitForServer()
  const args = ['--ignore-gpu-blocklist']
  browser = await chromium.launch({ args }).catch(() => chromium.launch({ args, channel: 'chrome' }))
  const errors = []

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  const page = await openGame(desktop, errors)
  const initial = await page.evaluate(() => {
    const { world, camera, renderer } = window.__game
    const ground = world.ground
    const grid = world.scene.getObjectByName('city-grid')
    const sun = world.sun
    const ambient = world.ambient
    return {
      cameraType: camera.type,
      position: camera.position.toArray(),
      ground: { width: ground.geometry.parameters.width, height: ground.geometry.parameters.height, rotationX: ground.rotation.x, receiveShadow: ground.receiveShadow },
      grid: grid ? { divisions: grid.userData.divisions, cellSize: grid.userData.cellSize } : null,
      lighting: { ambient: ambient.intensity, sun: sun.intensity, shadow: sun.castShadow, mapSize: sun.shadow.mapSize.toArray(), shadowCamera: { left: sun.shadow.camera.left, right: sun.shadow.camera.right, top: sun.shadow.camera.top, bottom: sun.shadow.camera.bottom, near: sun.shadow.camera.near, far: sun.shadow.camera.far }, pixelRatio: renderer.gl.getPixelRatio(), antialias: renderer.gl.getContext().getContextAttributes().antialias, powerPreference: renderer.gl.getContext().getContextAttributes().powerPreference },
      buildingCount: world.buildings.length,
    }
  })
  if (initial.cameraType !== 'OrthographicCamera') throw new Error(`expected OrthographicCamera, got ${initial.cameraType}`)
  if (initial.ground.width !== 100 || initial.ground.height !== 100 || Math.abs(initial.ground.rotationX + Math.PI / 2) > 1e-6 || !initial.ground.receiveShadow) throw new Error('ground configuration mismatch')
  if (!initial.grid || initial.grid.divisions !== 50 || initial.grid.cellSize !== 2 || initial.lighting.ambient !== 0.6 || initial.lighting.sun !== 1.5 || !initial.lighting.shadow || initial.lighting.pixelRatio !== 1 || !initial.lighting.antialias) throw new Error(`renderer/light/grid configuration mismatch: ${JSON.stringify(initial)}`)
  if (JSON.stringify(initial.lighting.shadowCamera) !== JSON.stringify({ left: -62, right: 62, top: 62, bottom: -62, near: 1, far: 180 })) throw new Error(`shadow camera bounds mismatch: ${JSON.stringify(initial.lighting.shadowCamera)}`)
  await page.screenshot({ path: `${out}/01-city-desktop.png` })

  await page.mouse.click(640, 360)
  await page.waitForFunction(() => window.__game.world.buildings.length === 1)
  const placed = await page.evaluate(() => {
    const building = window.__game.world.buildings[0]
    const meshes = []
    building.traverse(node => { if (node.isMesh) meshes.push({ castShadow: node.castShadow, receiveShadow: node.receiveShadow }) })
    return { position: building.position.toArray(), meshCount: meshes.length, meshes }
  })
  const firstCellCenter = -initial.ground.width / 2 + initial.grid.cellSize / 2
  const isCenteredOnCell = value => Math.abs((value - firstCellCenter) / initial.grid.cellSize - Math.round((value - firstCellCenter) / initial.grid.cellSize)) < 1e-6
  if (placed.position[1] !== 0 || !isCenteredOnCell(placed.position[0]) || !isCenteredOnCell(placed.position[2]) || placed.meshCount < 2 || placed.meshes.some(mesh => !mesh.castShadow || !mesh.receiveShadow)) throw new Error(`building grounding/grid/shadows mismatch: ${JSON.stringify(placed)}`)

  const cameraBefore = await page.evaluate(() => window.__game.camera.position.toArray())
  await page.mouse.move(900, 360)
  await page.mouse.down()
  await page.mouse.move(980, 410, { steps: 6 })
  await page.mouse.up()
  const cameraAfter = await page.evaluate(() => ({ position: window.__game.camera.position.toArray(), count: window.__game.world.buildings.length }))
  if (Math.hypot(...cameraAfter.position.map((value, index) => value - cameraBefore[index])) < 0.1) throw new Error('drag did not pan the camera')
  if (cameraAfter.count !== 1) throw new Error('camera drag placed an unintended building')
  await page.screenshot({ path: `${out}/02-city-building.png` })
  console.log(`smoke: desktop camera=${initial.cameraType}, ground=${initial.ground.width}x${initial.ground.height}, building origin=(${placed.position.join(',')}), drag=panned`)
  await desktop.close()

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const phonePage = await openGame(phone, errors)
  const phoneRatio = await phonePage.evaluate(() => window.__game.renderer.gl.getPixelRatio())
  if (phoneRatio !== 2) throw new Error(`expected mobile pixel ratio 2, got ${phoneRatio}`)
  await phonePage.screenshot({ path: `${out}/03-city-mobile.png` })
  await phonePage.touchscreen.tap(195, 422)
  await phonePage.waitForFunction(() => window.__game.world.buildings.length === 1)
  const mobilePlacement = await phonePage.evaluate(() => window.__game.world.buildings[0].position.toArray())
  if (mobilePlacement[1] !== 0 || !isCenteredOnCell(mobilePlacement[0]) || !isCenteredOnCell(mobilePlacement[2])) throw new Error(`mobile placement did not ground on a cell: ${mobilePlacement}`)
  await phone.close()

  if (errors.length) throw new Error(`console/network errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — desktop and mobile captures in ${out}/`)
} catch (error) {
  await fail(error?.message ?? String(error))
}
