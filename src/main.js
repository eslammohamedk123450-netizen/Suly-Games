import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  GridHelper,
  Group,
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
  Vector2,
  Vector3,
} from 'three'
import './styles/main.css'
import { Renderer } from './engine/renderer'

const MAP_SIZE = 100
const CELL_SIZE = 2
const CAMERA_VIEW_HEIGHT = 72
const PAN_SENSITIVITY = 1
const MIN_ZOOM = 0.6
const MAX_ZOOM = 2.5
const FIRST_CELL_CENTER = -MAP_SIZE / 2 + CELL_SIZE / 2
const LAST_CELL_CENTER = MAP_SIZE / 2 - CELL_SIZE / 2
const HALF_MAP = MAP_SIZE / 2

const canvas = document.querySelector('#game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Game canvas was not found')

const renderer = new Renderer(canvas)
renderer.gl.shadowMap.type = PCFSoftShadowMap
renderer.gl.outputColorSpace = SRGBColorSpace

const scene = new Scene()
scene.background = new Color('#b9d9ad')

const ground = new Mesh(
  new PlaneGeometry(MAP_SIZE, MAP_SIZE),
  new MeshStandardMaterial({ color: '#71b965', roughness: 1, metalness: 0 }),
)
ground.name = 'city-ground'
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const divisions = Math.max(1, Math.round(MAP_SIZE / CELL_SIZE))
const grid = new GridHelper(MAP_SIZE, divisions, '#315f32', '#43803f')
grid.name = 'city-grid'
grid.position.y = 0.04
grid.userData.divisions = divisions
grid.userData.cellSize = CELL_SIZE
const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
for (const material of gridMaterials) {
  material.transparent = true
  material.opacity = 0.8
  material.depthWrite = false
  material.color.set('#315f32')
}
scene.add(grid)

const ambient = new AmbientLight('#ffffff', 0.6)
scene.add(ambient)

const sun = new DirectionalLight('#fff7e7', 1.5)
sun.name = 'city-sun'
sun.position.set(42, 58, 36)
sun.target.position.set(0, 0, 0)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -62
sun.shadow.camera.right = 62
sun.shadow.camera.top = 62
sun.shadow.camera.bottom = -62
sun.shadow.camera.near = 1
sun.shadow.camera.far = 180
sun.shadow.camera.updateProjectionMatrix()
sun.shadow.bias = -0.00025
sun.shadow.normalBias = 0.025
sun.shadow.radius = 3
scene.add(sun, sun.target)

const buildingMaterials = {
  base: new MeshStandardMaterial({ color: '#e8d5ad', roughness: 0.88 }),
  roof: new MeshStandardMaterial({ color: '#bd6448', roughness: 0.9 }),
  door: new MeshStandardMaterial({ color: '#76513a', roughness: 1 }),
}

function createBuilding() {
  const group = new Group()
  group.name = 'procedural-building'

  const base = new Mesh(new BoxGeometry(CELL_SIZE, 2, CELL_SIZE), buildingMaterials.base)
  base.position.y = 1
  group.add(base)

  const roof = new Mesh(new ConeGeometry(1.48, 1.82, 4), buildingMaterials.roof)
  roof.position.y = 2.91
  roof.rotation.y = Math.PI / 4
  group.add(roof)

  const door = new Mesh(new BoxGeometry(0.48, 0.9, 0.08), buildingMaterials.door)
  door.position.set(0, 0.45, 1.04)
  group.add(door)

  group.traverse(object => {
    if (object instanceof Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return group
}

const asphaltGeometry = new PlaneGeometry(CELL_SIZE, CELL_SIZE)
const asphaltMaterial = new MeshStandardMaterial({ color: '#777d7d', roughness: 0.95, metalness: 0 })
const dashGeometry = new PlaneGeometry(0.42, 0.12)
const dashMaterial = new MeshStandardMaterial({ color: '#f6f0d5', roughness: 0.8, metalness: 0 })

function createRoadTile() {
  const road = new Group()
  road.name = 'procedural-road-tile'

  const asphalt = new Mesh(asphaltGeometry, asphaltMaterial)
  asphalt.rotation.x = -Math.PI / 2
  asphalt.position.y = 0.01
  asphalt.receiveShadow = true
  asphalt.castShadow = false
  road.add(asphalt)

  for (const x of [-0.55, 0, 0.55]) {
    const dash = new Mesh(dashGeometry, dashMaterial)
    dash.rotation.x = -Math.PI / 2
    dash.position.set(x, 0.021, 0)
    dash.receiveShadow = true
    dash.castShadow = false
    road.add(dash)
  }

  road.traverse(object => {
    if (object instanceof Mesh) object.updateMatrix()
  })
  return road
}

const roadTiles = new Map()
const roads = []
const buildings = []
const cellKey = (x, z) => {
  const column = Math.round((x - FIRST_CELL_CENTER) / CELL_SIZE)
  const row = Math.round((z - FIRST_CELL_CENTER) / CELL_SIZE)
  return `${column}:${row}`
}

const world = {
  scene,
  ground,
  ambient,
  sun,
  buildings,
  roads,
  roadTiles,
  createBuilding,
  createRoadTile,
  hasRoadAt(x, z) {
    return roadTiles.has(cellKey(x, z))
  },
  hasBuildingAt(x, z) {
    return buildings.some(building => Math.abs(building.position.x - x) < 0.001 && Math.abs(building.position.z - z) < 0.001)
  },
  isCellOccupied(x, z) {
    return this.hasRoadAt(x, z) || this.hasBuildingAt(x, z)
  },
  hasAdjacentRoad(x, z) {
    return this.hasRoadAt(x - CELL_SIZE, z)
      || this.hasRoadAt(x + CELL_SIZE, z)
      || this.hasRoadAt(x, z - CELL_SIZE)
      || this.hasRoadAt(x, z + CELL_SIZE)
  },
  canPlaceBuilding(x, z) {
    return !this.isCellOccupied(x, z) && this.hasAdjacentRoad(x, z)
  },
  addRoad(x, z) {
    if (this.isCellOccupied(x, z)) return null
    const tile = createRoadTile()
    tile.position.set(x, 0, z)
    tile.userData.cell = { x, z }
    scene.add(tile)
    roadTiles.set(cellKey(x, z), tile)
    roads.push(tile)
    return tile
  },
  addBuilding(x, z) {
    if (!this.canPlaceBuilding(x, z)) return null
    const building = createBuilding()
    building.position.set(x, 0, z)
    building.userData.cell = { x, z }
    scene.add(building)
    buildings.push(building)
    return building
  },
}

const cameraTarget = new Vector3(0, 0, 0)
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 300)
camera.position.set(50, 50, 50)
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
  cameraTarget.set(
    MathUtils.clamp(target.x, -LAST_CELL_CENTER, LAST_CELL_CENTER),
    0,
    MathUtils.clamp(target.z, -LAST_CELL_CENTER, LAST_CELL_CENTER),
  )
  const appliedMovement = cameraTarget.clone().sub(previous)
  camera.position.add(appliedMovement)
  camera.lookAt(cameraTarget)
  return appliedMovement
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

function beginCameraPan() {
  stopCameraInertia()
}

function panCameraByPixels(deltaX, deltaY) {
  const height = canvas.clientHeight || window.innerHeight
  const worldUnitsPerPixel = CAMERA_VIEW_HEIGHT / camera.zoom / Math.max(height, 1) * PAN_SENSITIVITY
  camera.getWorldDirection(cameraDirection)
  cameraRight.crossVectors(cameraDirection, worldUp).normalize()
  screenUp.crossVectors(cameraRight, cameraDirection).normalize()
  horizontalUp.set(screenUp.x, 0, screenUp.z).normalize()

  const movement = cameraRight.multiplyScalar(-deltaX * worldUnitsPerPixel)
    .addScaledVector(horizontalUp, deltaY * worldUnitsPerPixel)
  lastPanMovement.copy(clampTarget(cameraTarget.clone().add(movement)))
}

function endCameraPan() {
  panVelocity.copy(lastPanMovement).multiplyScalar(0.88)
}

function updateCameraInertia() {
  if (panVelocity.lengthSq() < 0.000004) {
    panVelocity.set(0, 0, 0)
    return
  }
  const intendedMovement = panVelocity.clone()
  const appliedMovement = clampTarget(cameraTarget.clone().add(intendedMovement))
  if (appliedMovement.lengthSq() + 0.000001 < intendedMovement.lengthSq()) {
    panVelocity.set(0, 0, 0)
    return
  }
  panVelocity.multiplyScalar(0.9)
}

function zoomCameraByFactor(factor) {
  camera.zoom = MathUtils.clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  camera.updateProjectionMatrix()
}

const raycaster = new Raycaster()
const pointer = new Vector2()
const highlight = new Mesh(
  new PlaneGeometry(CELL_SIZE, CELL_SIZE),
  new MeshBasicMaterial({ color: '#39ce66', transparent: true, opacity: 0.4, depthWrite: false }),
)
highlight.name = 'placement-highlight'
highlight.rotation.x = -Math.PI / 2
highlight.position.y = 0.025
highlight.renderOrder = 2
highlight.visible = false
highlight.castShadow = false
highlight.receiveShadow = false
scene.add(highlight)

let currentMode = 'ROAD'
const modeButton = document.querySelector('#mode-toggle')

function updateModeButton() {
  if (!(modeButton instanceof HTMLButtonElement)) return
  modeButton.textContent = currentMode === 'ROAD' ? 'وضع الطريق · R' : 'وضع المباني · B'
  modeButton.setAttribute('aria-label', currentMode === 'ROAD' ? 'التبديل إلى وضع المباني' : 'التبديل إلى وضع الطريق')
  modeButton.setAttribute('aria-pressed', String(currentMode === 'BUILDING'))
  modeButton.dataset.mode = currentMode.toLowerCase()
}

function setMode(mode) {
  currentMode = mode
  updateModeButton()
  updateHighlightFromScreen(lastPointerX, lastPointerY)
}

function toggleMode() {
  setMode(currentMode === 'ROAD' ? 'BUILDING' : 'ROAD')
}

if (modeButton instanceof HTMLButtonElement) modeButton.addEventListener('click', toggleMode)

function cellCenter(value) {
  return MathUtils.clamp(
    FIRST_CELL_CENTER + Math.round((value - FIRST_CELL_CENTER) / CELL_SIZE) * CELL_SIZE,
    FIRST_CELL_CENTER,
    LAST_CELL_CENTER,
  )
}

function cellFromScreen(clientX, clientY) {
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObject(ground, false)[0]
  if (!hit) return null
  return { x: cellCenter(hit.point.x), z: cellCenter(hit.point.z) }
}

let lastPointerX = window.innerWidth / 2
let lastPointerY = window.innerHeight / 2

function cellIsPlaceable(cell) {
  if (!cell || world.isCellOccupied(cell.x, cell.z)) return false
  return currentMode === 'ROAD' || world.hasAdjacentRoad(cell.x, cell.z)
}

function updateHighlightFromScreen(clientX, clientY) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return
  lastPointerX = clientX
  lastPointerY = clientY
  const cell = cellFromScreen(clientX, clientY)
  if (!cell) {
    highlight.visible = false
    return
  }
  highlight.visible = true
  highlight.position.set(cell.x, 0.025, cell.z)
  highlight.material.color.set(cellIsPlaceable(cell) ? '#39ce66' : '#e54848')
}

function placeAtScreen(clientX, clientY) {
  const cell = cellFromScreen(clientX, clientY)
  if (!cell || !cellIsPlaceable(cell)) {
    updateHighlightFromScreen(clientX, clientY)
    return
  }
  if (currentMode === 'ROAD') world.addRoad(cell.x, cell.z)
  else world.addBuilding(cell.x, cell.z)
  updateHighlightFromScreen(clientX, clientY)
}

const activePointers = new Map()
let drag = null
let pinchDistance = 0
let multiTouchGesture = false

function distanceBetweenPointers() {
  const points = [...activePointers.values()]
  if (points.length < 2) return 0
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
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
    beginCameraPan()
    updateHighlightFromScreen(event.clientX, event.clientY)
  } else if (activePointers.size >= 2) {
    multiTouchGesture = true
    drag = null
    stopCameraInertia()
    pinchDistance = distanceBetweenPointers()
    const midpoint = midpointOfPointers()
    if (midpoint) updateHighlightFromScreen(midpoint.x, midpoint.y)
  }
})

canvas.addEventListener('pointermove', event => {
  if (activePointers.has(event.pointerId)) {
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
  } else {
    updateHighlightFromScreen(event.clientX, event.clientY)
  }
})

function finishPointer(event, cancelled = false) {
  const pointerWasActive = activePointers.has(event.pointerId)
  if (!pointerWasActive) return
  const wasSingleTap = activePointers.size === 1 && !multiTouchGesture && drag?.id === event.pointerId && !drag.moved
  activePointers.delete(event.pointerId)
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)

  if (activePointers.size === 1) {
    const [remainingId, remainingPoint] = [...activePointers.entries()][0]
    drag = { id: remainingId, startX: remainingPoint.x, startY: remainingPoint.y, lastX: remainingPoint.x, lastY: remainingPoint.y, moved: true }
    pinchDistance = 0
    beginCameraPan()
  } else if (activePointers.size === 0) {
    if (!cancelled && wasSingleTap) placeAtScreen(event.clientX, event.clientY)
    drag = null
    pinchDistance = 0
    if (cancelled) stopCameraInertia()
    else endCameraPan()
    multiTouchGesture = false
  }
}

canvas.addEventListener('pointerup', event => finishPointer(event))
canvas.addEventListener('pointercancel', event => finishPointer(event, true))
canvas.addEventListener('lostpointercapture', event => finishPointer(event, true))
canvas.addEventListener('wheel', event => {
  event.preventDefault()
  zoomCameraByFactor(Math.exp(-event.deltaY * 0.001))
}, { passive: false })

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase()
  if (key === 'r') setMode('ROAD')
  else if (key === 'b') setMode('BUILDING')
})

function projectCellToScreen(x, z) {
  const position = new Vector3(x, 0, z).project(camera)
  const rect = canvas.getBoundingClientRect()
  return {
    x: rect.left + (position.x + 1) * rect.width / 2,
    y: rect.top + (1 - position.y) * rect.height / 2,
  }
}

updateModeButton()
resizeCamera()
updateHighlightFromScreen(lastPointerX, lastPointerY)

function frame() {
  resizeCamera()
  updateCameraInertia()
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

window.__game = {
  world,
  camera,
  renderer,
  createBuilding,
  createRoadTile,
  get currentMode() { return currentMode },
  setMode,
  projectCellToScreen,
  cameraBounds: { min: -LAST_CELL_CENTER, max: LAST_CELL_CENTER },
}
