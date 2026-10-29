import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DirectionalLight,
  GridHelper,
  Group,
  IcosahedronGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three'
import './styles/main.css'
import { Renderer } from './engine/renderer'

const CITY_MATRIX = [
  [2, 0, 2, 0, 0, 3, 0, 0, 4, 0],
  [0, 5, 0, 0, 1, 1, 1, 0, 0, 2],
  [2, 0, 0, 0, 1, 4, 1, 0, 0, 0],
  [0, 0, 2, 0, 1, 1, 1, 0, 3, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 0, 3, 0, 1, 1, 1, 0, 0, 2],
  [2, 0, 0, 0, 1, 4, 1, 0, 5, 0],
  [0, 5, 0, 0, 1, 1, 1, 0, 0, 0],
  [3, 0, 0, 0, 0, 2, 0, 0, 2, 0],
  [0, 0, 2, 0, 0, 0, 0, 3, 0, 0],
]
const MATRIX_ROWS = CITY_MATRIX.length
const MATRIX_COLS = CITY_MATRIX[0].length
const CELL_SIZE = 4
const MAP_SIZE = MATRIX_COLS * CELL_SIZE
const FIRST_CELL_CENTER = -MAP_SIZE / 2 + CELL_SIZE / 2
const LAST_CELL_CENTER = MAP_SIZE / 2 - CELL_SIZE / 2
const CAMERA_VIEW_HEIGHT = 54
const MIN_ZOOM = 0.65
const MAX_ZOOM = 2.2
const PAN_SENSITIVITY = 1

const canvas = document.querySelector('#game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Game canvas was not found')

const renderer = new Renderer(canvas)
renderer.gl.shadowMap.enabled = true
renderer.gl.shadowMap.type = PCFSoftShadowMap
renderer.gl.outputColorSpace = SRGBColorSpace

const scene = new Scene()
scene.background = new Color('#d8d2c5')

const concreteMaterial = new MeshStandardMaterial({ color: '#c7c3b9', roughness: 0.95, metalness: 0 })
const concreteTileGeometry = new PlaneGeometry(CELL_SIZE, CELL_SIZE)
const ground = new Mesh(new PlaneGeometry(MAP_SIZE, MAP_SIZE), concreteMaterial)
ground.name = 'city-concrete-ground'
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const grid = new GridHelper(MAP_SIZE, MATRIX_COLS, '#aaa69c', '#b8b3a9')
grid.name = 'subtle-sidewalk-grid'
grid.position.y = 0.025
const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
for (const material of gridMaterials) {
  material.transparent = true
  material.opacity = 0.25
  material.depthWrite = false
  material.color.set('#aaa69c')
}
scene.add(grid)

const ambient = new AmbientLight('#e1ded5', 0.52)
scene.add(ambient)
const sun = new DirectionalLight('#fff1d5', 3.5)
sun.name = 'city-sun'
sun.position.set(34, 62, 30)
sun.target.position.set(0, 0, 0)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -42
sun.shadow.camera.right = 42
sun.shadow.camera.top = 42
sun.shadow.camera.bottom = -42
sun.shadow.camera.near = 1
sun.shadow.camera.far = 160
sun.shadow.bias = -0.0002
sun.shadow.normalBias = 0.018
sun.shadow.radius = 2.2
sun.shadow.camera.updateProjectionMatrix()
scene.add(sun, sun.target)

const buildingTypes = {
  HOUSE: { asset: 'house.png', height: 4.7 },
  SHOP: { asset: 'shop.png', height: 4.8 },
  SKYSCRAPER: { asset: 'skyscraper.png', height: 6.9 },
}
const buildingTextures = Object.create(null)
const buildingMaterials = Object.create(null)
const spriteGeometries = Object.create(null)
const buildings = []
const roads = []
const parks = []
const cars = []
let spritesReady = false
let matrixGenerated = false

const textureLoader = new TextureLoader()
const spriteLoadPromise = Promise.all(Object.entries(buildingTypes).map(([type, definition]) => new Promise((resolve, reject) => {
  textureLoader.load(`${import.meta.env.BASE_URL}assets/${definition.asset}`, texture => {
    texture.colorSpace = SRGBColorSpace
    texture.minFilter = LinearMipmapLinearFilter
    texture.magFilter = LinearFilter
    texture.needsUpdate = true
    buildingTextures[type] = texture
    buildingMaterials[type] = new MeshStandardMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.5,
      side: DoubleSide,
      roughness: 0.9,
      depthWrite: false,
    })
    resolve(texture)
  }, undefined, reject)
}))).then(() => {
  spritesReady = true
  if (!matrixGenerated) {
    matrixGenerated = true
    generateMatrixCity()
  }
  updateToolbar()
}).catch(error => {
  console.error('Building sprite loading failed:', error)
  updateToolbar()
})

const asphaltMaterial = new MeshStandardMaterial({ color: '#3e4244', roughness: 0.92, metalness: 0 })
const sidewalkMaterial = new MeshStandardMaterial({ color: '#aaa79f', roughness: 0.94, metalness: 0 })
const laneMaterial = new MeshStandardMaterial({ color: '#f3e7bf', roughness: 0.8 })
const crosswalkMaterial = new MeshStandardMaterial({ color: '#fff8df', roughness: 0.78 })
const asphaltGeometry = new PlaneGeometry(CELL_SIZE, CELL_SIZE)
const curbHorizontalGeometry = new BoxGeometry(CELL_SIZE, 0.18, 0.24)
const curbVerticalGeometry = new BoxGeometry(0.24, 0.18, CELL_SIZE)
const laneDashGeometry = new BoxGeometry(0.5, 0.025, 0.09)
const crosswalkStripeGeometry = new BoxGeometry(0.18, 0.028, 0.72)
const matrixCellKey = (row, col) => `${row}:${col}`
const roadTiles = new Map()

function matrixValue(row, col) {
  return CITY_MATRIX[row]?.[col] ?? 0
}
function isMatrixRoad(row, col) {
  return matrixValue(row, col) === 1
}
function worldPosition(row, col) {
  return {
    x: FIRST_CELL_CENTER + col * CELL_SIZE,
    z: FIRST_CELL_CENTER + row * CELL_SIZE,
  }
}
function addConcreteTile(row, col) {
  const { x, z } = worldPosition(row, col)
  const tile = new Mesh(concreteTileGeometry, concreteMaterial)
  tile.name = `concrete-cell-${row}-${col}`
  tile.rotation.x = -Math.PI / 2
  tile.position.set(x, 0.012, z)
  tile.receiveShadow = true
  scene.add(tile)
}
function createRoadTile(row, col) {
  const road = new Group()
  road.name = `road-cell-${row}-${col}`
  const { x, z } = worldPosition(row, col)
  road.position.set(x, 0, z)

  const asphalt = new Mesh(asphaltGeometry, asphaltMaterial)
  asphalt.rotation.x = -Math.PI / 2
  asphalt.position.y = 0.035
  asphalt.receiveShadow = true
  road.add(asphalt)

  const neighbors = {
    north: isMatrixRoad(row - 1, col),
    south: isMatrixRoad(row + 1, col),
    west: isMatrixRoad(row, col - 1),
    east: isMatrixRoad(row, col + 1),
  }
  if (!neighbors.north) {
    const curb = new Mesh(curbHorizontalGeometry, sidewalkMaterial)
    curb.position.set(0, 0.105, -CELL_SIZE / 2 + 0.12)
    curb.receiveShadow = true
    road.add(curb)
  }
  if (!neighbors.south) {
    const curb = new Mesh(curbHorizontalGeometry, sidewalkMaterial)
    curb.position.set(0, 0.105, CELL_SIZE / 2 - 0.12)
    curb.receiveShadow = true
    road.add(curb)
  }
  if (!neighbors.west) {
    const curb = new Mesh(curbVerticalGeometry, sidewalkMaterial)
    curb.position.set(-CELL_SIZE / 2 + 0.12, 0.105, 0)
    curb.receiveShadow = true
    road.add(curb)
  }
  if (!neighbors.east) {
    const curb = new Mesh(curbVerticalGeometry, sidewalkMaterial)
    curb.position.set(CELL_SIZE / 2 - 0.12, 0.105, 0)
    curb.receiveShadow = true
    road.add(curb)
  }

  const horizontal = neighbors.west || neighbors.east
  const vertical = neighbors.north || neighbors.south
  if (horizontal && !vertical) {
    const dash = new Mesh(laneDashGeometry, laneMaterial)
    dash.position.set(0, 0.07, 0)
    road.add(dash)
  } else if (vertical && !horizontal) {
    const dash = new Mesh(laneDashGeometry, laneMaterial)
    dash.rotation.y = Math.PI / 2
    dash.position.set(0, 0.07, 0)
    road.add(dash)
  }

  const roadNeighborCount = Object.values(neighbors).filter(Boolean).length
  if (roadNeighborCount >= 3) {
    for (const offset of [-0.9, -0.54, -0.18, 0.18, 0.54, 0.9]) {
      const stripe = new Mesh(crosswalkStripeGeometry, crosswalkMaterial)
      stripe.position.set(offset, 0.075, 0)
      stripe.receiveShadow = true
      road.add(stripe)
    }
  }
  scene.add(road)
  roads.push(road)
  roadTiles.set(matrixCellKey(row, col), road)
  return road
}

function createSpriteBuilding(type) {
  const definition = buildingTypes[type]
  const texture = buildingTextures[type]
  if (!definition || !texture) return null
  let geometry = spriteGeometries[type]
  if (!geometry) {
    const height = definition.height
    const width = height * texture.image.width / texture.image.height
    geometry = new PlaneGeometry(width, height)
    geometry.translate(0, height / 2, 0)
    geometry.computeBoundingBox()
    spriteGeometries[type] = geometry
  }
  const building = new Mesh(geometry, buildingMaterials[type])
  building.name = `sprite-building-${type.toLowerCase()}`
  building.rotation.y = Math.PI / 4
  building.castShadow = true
  building.receiveShadow = true
  building.userData.type = type
  return building
}

const parkMaterial = new MeshStandardMaterial({ color: '#789b70', roughness: 1, metalness: 0 })
const parkTileGeometry = new PlaneGeometry(CELL_SIZE * 0.86, CELL_SIZE * 0.86)
const treeTrunkMaterial = new MeshStandardMaterial({ color: '#704a30', roughness: 1 })
const treeLeafMaterials = [
  new MeshStandardMaterial({ color: '#2f7c45', roughness: 1 }),
  new MeshStandardMaterial({ color: '#438e4d', roughness: 1 }),
]
function createPark(row, col) {
  const { x, z } = worldPosition(row, col)
  const park = new Group()
  park.name = `park-cell-${row}-${col}`
  park.position.set(x, 0, z)
  const grass = new Mesh(parkTileGeometry, parkMaterial)
  grass.rotation.x = -Math.PI / 2
  grass.position.y = 0.035
  grass.receiveShadow = true
  park.add(grass)
  const trunk = new Mesh(new CylinderGeometry(0.15, 0.2, 0.85, 8), treeTrunkMaterial)
  trunk.position.y = 0.43
  trunk.castShadow = true
  const leaves = new Mesh(new IcosahedronGeometry(0.68, 1), treeLeafMaterials[parks.length % treeLeafMaterials.length])
  leaves.position.y = 1.25
  leaves.castShadow = true
  leaves.receiveShadow = true
  park.add(trunk, leaves)
  scene.add(park)
  parks.push(park)
}

function createCar(color, startColumn, direction) {
  const car = new Group()
  car.name = 'matrix-road-car'
  car.position.set(worldPosition(4, startColumn).x, 0.16, worldPosition(4, startColumn).z)
  car.userData.startColumn = startColumn
  car.userData.direction = direction
  const body = new Mesh(new BoxGeometry(1.15, 0.28, 0.62), new MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.05 }))
  body.castShadow = true
  const cabin = new Mesh(new BoxGeometry(0.48, 0.2, 0.48), new MeshStandardMaterial({ color: '#d9e6e5', roughness: 0.35, metalness: 0.1 }))
  cabin.position.set(-0.05, 0.23, 0)
  cabin.castShadow = true
  car.add(body, cabin)
  scene.add(car)
  cars.push(car)
}

function generateMatrixCity() {
  for (let row = 0; row < MATRIX_ROWS; row += 1) {
    for (let col = 0; col < MATRIX_COLS; col += 1) {
      const value = CITY_MATRIX[row][col]
      if (value === 0) addConcreteTile(row, col)
      else if (value === 1) createRoadTile(row, col)
      else if (value === 5) createPark(row, col)
      else {
        const type = value === 2 ? 'HOUSE' : value === 3 ? 'SHOP' : 'SKYSCRAPER'
        const building = createSpriteBuilding(type)
        if (!building) continue
        const { x, z } = worldPosition(row, col)
        building.position.set(x, 0, z)
        building.userData.matrixCell = { row, col, value }
        scene.add(building)
        buildings.push(building)
      }
    }
  }
  createCar('#d9544d', 1, 1)
  createCar('#4b83bd', 8, -1)
}

const cameraTarget = new Vector3(0, 0, 0)
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 300)
camera.position.set(43, 43, 43)
camera.zoom = 0.92
camera.lookAt(cameraTarget)
const cameraDirection = new Vector3()
const cameraRight = new Vector3()
const screenUp = new Vector3()
const horizontalUp = new Vector3()
const worldUp = new Vector3(0, 1, 0)
const panVelocity = new Vector3()
const lastPanMovement = new Vector3()
let lastCameraWidth = 0
let lastCameraHeight = 0

function clampTarget(target) {
  const previous = cameraTarget.clone()
  cameraTarget.set(MathUtils.clamp(target.x, -LAST_CELL_CENTER, LAST_CELL_CENTER), 0, MathUtils.clamp(target.z, -LAST_CELL_CENTER, LAST_CELL_CENTER))
  const movement = cameraTarget.clone().sub(previous)
  camera.position.add(movement)
  camera.lookAt(cameraTarget)
  return movement
}
function resizeCamera() {
  const width = canvas.clientWidth || window.innerWidth
  const height = canvas.clientHeight || window.innerHeight
  if (width === lastCameraWidth && height === lastCameraHeight) return
  lastCameraWidth = width
  lastCameraHeight = height
  const halfHeight = CAMERA_VIEW_HEIGHT / 2
  const halfWidth = halfHeight * (width / Math.max(height, 1))
  camera.left = -halfWidth
  camera.right = halfWidth
  camera.top = halfHeight
  camera.bottom = -halfHeight
  camera.updateProjectionMatrix()
  clampTarget(cameraTarget)
}
function stopCameraInertia() {
  panVelocity.set(0, 0, 0)
  lastPanMovement.set(0, 0, 0)
}
function panCameraByPixels(deltaX, deltaY) {
  const height = canvas.clientHeight || window.innerHeight
  const worldUnitsPerPixel = CAMERA_VIEW_HEIGHT / camera.zoom / Math.max(height, 1) * PAN_SENSITIVITY
  camera.getWorldDirection(cameraDirection)
  cameraRight.crossVectors(cameraDirection, worldUp).normalize()
  screenUp.crossVectors(cameraRight, cameraDirection).normalize()
  horizontalUp.set(screenUp.x, 0, screenUp.z).normalize()
  const movement = cameraRight.multiplyScalar(-deltaX * worldUnitsPerPixel).addScaledVector(horizontalUp, deltaY * worldUnitsPerPixel)
  lastPanMovement.copy(clampTarget(cameraTarget.clone().add(movement)))
}
function endCameraPan() { panVelocity.copy(lastPanMovement).multiplyScalar(0.88) }
function updateCameraInertia() {
  if (panVelocity.lengthSq() < 0.000004) { panVelocity.set(0, 0, 0); return }
  const intended = panVelocity.clone()
  const applied = clampTarget(cameraTarget.clone().add(intended))
  if (applied.lengthSq() + 0.000001 < intended.lengthSq()) { panVelocity.set(0, 0, 0); return }
  panVelocity.multiplyScalar(0.9)
}
function zoomCameraByFactor(factor) {
  camera.zoom = MathUtils.clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  camera.updateProjectionMatrix()
}

const raycaster = new Raycaster()
const pointer = new Vector2()
const highlight = new Mesh(new PlaneGeometry(CELL_SIZE, CELL_SIZE), new MeshBasicMaterial({ color: '#39ce66', transparent: true, opacity: 0.35, depthWrite: false }))
highlight.name = 'placement-highlight'
highlight.rotation.x = -Math.PI / 2
highlight.position.y = 0.06
highlight.visible = false
scene.add(highlight)
let currentMode = 'ROAD'
let selectedBuildingType = 'HOUSE'
const toolButtons = [...document.querySelectorAll('[data-tool]')]
function updateToolbar() {
  for (const button of toolButtons) {
    const tool = button.dataset.tool
    const active = tool === 'ROAD' ? currentMode === 'ROAD' : currentMode === 'BUILDING' && tool === selectedBuildingType
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
    button.disabled = tool !== 'ROAD' && !spritesReady
  }
}
function setTool(tool) {
  if (tool === 'ROAD') currentMode = 'ROAD'
  else if (Object.hasOwn(buildingTypes, tool) && spritesReady) { currentMode = 'BUILDING'; selectedBuildingType = tool }
  else return
  updateToolbar()
  updateHighlightFromScreen(lastPointerX, lastPointerY)
}
for (const button of toolButtons) button.addEventListener('click', () => setTool(button.dataset.tool))
function cellFromScreen(clientX, clientY) {
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObject(ground, false)[0]
  if (!hit) return null
  const col = MathUtils.clamp(Math.round((hit.point.x - FIRST_CELL_CENTER) / CELL_SIZE), 0, MATRIX_COLS - 1)
  const row = MathUtils.clamp(Math.round((hit.point.z - FIRST_CELL_CENTER) / CELL_SIZE), 0, MATRIX_ROWS - 1)
  return { row, col, ...worldPosition(row, col) }
}
let lastPointerX = window.innerWidth / 2
let lastPointerY = window.innerHeight / 2
function updateHighlightFromScreen(clientX, clientY) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return
  lastPointerX = clientX
  lastPointerY = clientY
  const cell = cellFromScreen(clientX, clientY)
  if (!cell) { highlight.visible = false; return }
  highlight.visible = true
  highlight.position.set(cell.x, 0.06, cell.z)
  highlight.material.color.set(CITY_MATRIX[cell.row][cell.col] === 0 ? '#39ce66' : '#e54848')
}
function placeAtScreen(clientX, clientY) {
  const cell = cellFromScreen(clientX, clientY)
  if (!cell || CITY_MATRIX[cell.row][cell.col] !== 0) { updateHighlightFromScreen(clientX, clientY); return }
  if (currentMode === 'ROAD') createRoadTile(cell.row, cell.col)
  else {
    const building = createSpriteBuilding(selectedBuildingType)
    if (building) {
      building.position.set(cell.x, 0, cell.z)
      scene.add(building)
      buildings.push(building)
    }
  }
  updateHighlightFromScreen(clientX, clientY)
}

const activePointers = new Map()
let drag = null
let pinchDistance = 0
let multiTouchGesture = false
function distanceBetweenPointers() {
  const points = [...activePointers.values()]
  return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
}
function midpointOfPointers() {
  const points = [...activePointers.values()]
  if (points.length < 2) return points[0] ?? null
  return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
}
canvas.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  event.preventDefault()
  canvas.setPointerCapture(event.pointerId)
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (activePointers.size === 1) {
    multiTouchGesture = false
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false }
    stopCameraInertia()
    updateHighlightFromScreen(event.clientX, event.clientY)
  } else {
    multiTouchGesture = true
    drag = null
    stopCameraInertia()
    pinchDistance = distanceBetweenPointers()
  }
})
canvas.addEventListener('pointermove', event => {
  if (!activePointers.has(event.pointerId)) { updateHighlightFromScreen(event.clientX, event.clientY); return }
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (activePointers.size >= 2) {
    const nextDistance = distanceBetweenPointers()
    if (pinchDistance > 0 && nextDistance > 0) zoomCameraByFactor(nextDistance / pinchDistance)
    pinchDistance = nextDistance
    const midpoint = midpointOfPointers()
    if (midpoint) updateHighlightFromScreen(midpoint.x, midpoint.y)
    return
  }
  if (drag && event.pointerId === drag.id) {
    const totalX = event.clientX - drag.startX
    const totalY = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(totalX, totalY) >= 4) drag.moved = true
    if (drag.moved) panCameraByPixels(event.clientX - drag.lastX, event.clientY - drag.lastY)
    drag.lastX = event.clientX
    drag.lastY = event.clientY
  }
  updateHighlightFromScreen(event.clientX, event.clientY)
})
function finishPointer(event, cancelled = false) {
  if (!activePointers.has(event.pointerId)) return
  const wasTap = activePointers.size === 1 && !multiTouchGesture && drag?.id === event.pointerId && !drag.moved
  activePointers.delete(event.pointerId)
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  if (activePointers.size === 0) {
    if (!cancelled && wasTap) placeAtScreen(event.clientX, event.clientY)
    drag = null
    pinchDistance = 0
    if (cancelled) stopCameraInertia(); else endCameraPan()
    multiTouchGesture = false
  }
}
canvas.addEventListener('pointerup', event => finishPointer(event))
canvas.addEventListener('pointercancel', event => finishPointer(event, true))
canvas.addEventListener('lostpointercapture', event => finishPointer(event, true))
canvas.addEventListener('wheel', event => { event.preventDefault(); zoomCameraByFactor(Math.exp(-event.deltaY * 0.001)) }, { passive: false })
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase()
  if (key === 'r') setTool('ROAD')
  else if (key === 'b' || key === 'h') setTool('HOUSE')
  else if (key === 's') setTool('SHOP')
  else if (key === 'k') setTool('SKYSCRAPER')
})

function sortBuildingSprites() {
  camera.updateMatrixWorld(true)
  buildings.map(building => {
    const projected = new Vector3(building.position.x, building.position.y, building.position.z).project(camera)
    return { building, screenY: (1 - projected.y) * 0.5, depth: building.position.z + building.position.x }
  }).sort((a, b) => a.screenY - b.screenY || a.depth - b.depth).forEach(({ building }, index) => {
    building.renderOrder = 20 + index
  })
}
function animate() {
  resizeCamera()
  updateCameraInertia()
  const time = performance.now() * 0.00045
  const roadZ = worldPosition(4, 0).z
  cars.forEach((car, index) => {
    const baseX = worldPosition(4, index === 0 ? 1 : 8).x
    car.position.x = baseX + Math.sin(time * 1.15 + index * Math.PI) * CELL_SIZE * 3.2 * car.userData.direction
    car.position.z = roadZ
  })
  sortBuildingSprites()
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
updateToolbar()
resizeCamera()
requestAnimationFrame(animate)

window.__game = {
  matrix: CITY_MATRIX,
  world: { scene, ground, ambient, sun, buildings, roads, parks, cars, createRoadTile, createSpriteBuilding },
  camera,
  renderer,
  createRoadTile,
  createSpriteBuilding,
  get spritesReady() { return spritesReady },
  get selectedBuildingType() { return selectedBuildingType },
  get currentMode() { return currentMode },
  setTool,
  zoomCameraByFactor,
  sortBuildingSprites,
}
