import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  DirectionalLight,
  GridHelper,
  Group,
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
  CylinderGeometry,
} from 'three'
import './styles/main.css'
import { Renderer } from './engine/renderer'

const MAP_SIZE = 72
const CELL_SIZE = 2
const CAMERA_VIEW_HEIGHT = 56
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

const ambient = new AmbientLight('#d9e8ff', 0.38)
scene.add(ambient)

const sun = new DirectionalLight('#fff4d6', 2.8)
sun.name = 'city-sun'
sun.position.set(34, 68, 30)
sun.target.position.set(0, 0, 0)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -52
sun.shadow.camera.right = 52
sun.shadow.camera.top = 52
sun.shadow.camera.bottom = -52
sun.shadow.camera.near = 1
sun.shadow.camera.far = 180
sun.shadow.camera.updateProjectionMatrix()
sun.shadow.bias = -0.00025
sun.shadow.normalBias = 0.025
sun.shadow.radius = 5
scene.add(sun, sun.target)

const buildingTypes = {
  HOUSE: { asset: 'house.png', height: 6.2 },
  SHOP: { asset: 'shop.png', height: 6.2 },
  SKYSCRAPER: { asset: 'skyscraper.png', height: 8.8 },
}
const buildingTextures = Object.create(null)
const buildingMaterials = Object.create(null)
const spriteGeometries = Object.create(null)
let spritesReady = false
let cityGenerated = false
const textureLoader = new TextureLoader()

const spriteLoadPromise = Promise.all(Object.entries(buildingTypes).map(([type, definition]) => new Promise((resolve, reject) => {
  const url = `${import.meta.env.BASE_URL}assets/${definition.asset}`
  textureLoader.load(url, texture => {
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
      roughness: 1,
    })
    resolve(texture)
  }, undefined, reject)
}))).then(() => {
  spritesReady = true
  if (!cityGenerated) {
    cityGenerated = true
    populateCityBlocks()
  }
  updateToolbar()
}).catch(error => {
  console.error('Building sprite loading failed:', error)
  updateToolbar()
})

function createSpriteBuilding(type = 'HOUSE') {
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

const asphaltGeometry = new PlaneGeometry(CELL_SIZE, CELL_SIZE)
const asphaltMaterial = new MeshStandardMaterial({ color: '#42494b', roughness: 0.96, metalness: 0 })
const curbMaterial = new MeshStandardMaterial({ color: '#848c8b', roughness: 0.9, metalness: 0 })
const dashGeometry = new BoxGeometry(0.34, 0.012, 0.075)
const dashMaterial = new MeshStandardMaterial({ color: '#fff6d8', roughness: 0.8, metalness: 0 })
const longCurbGeometry = new BoxGeometry(CELL_SIZE, 0.045, 0.1)
const sideCurbGeometry = new BoxGeometry(0.1, 0.045, CELL_SIZE)

function createRoadTile() {
  const road = new Group()
  road.name = 'procedural-road-tile'

  const asphalt = new Mesh(asphaltGeometry, asphaltMaterial)
  asphalt.rotation.x = -Math.PI / 2
  asphalt.position.y = 0.01
  asphalt.receiveShadow = true
  asphalt.castShadow = false
  road.add(asphalt)

  for (const z of [-0.95, 0.95]) {
    const curb = new Mesh(longCurbGeometry, curbMaterial)
    curb.position.set(0, 0.033, z)
    curb.receiveShadow = true
    curb.castShadow = false
    road.add(curb)
  }
  for (const x of [-0.95, 0.95]) {
    const curb = new Mesh(sideCurbGeometry, curbMaterial)
    curb.position.set(x, 0.033, 0)
    curb.receiveShadow = true
    curb.castShadow = false
    road.add(curb)
  }

  for (const x of [-0.55, 0, 0.55]) {
    const dash = new Mesh(dashGeometry, dashMaterial)
    dash.position.set(x, 0.04, 0)
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
const trees = []
const cars = []
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
  createSpriteBuilding,
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
  addBuilding(x, z, type = 'HOUSE') {
    if (!this.canPlaceBuilding(x, z)) return null
    const building = createSpriteBuilding(type)
    if (!building) return null
    building.position.set(x, 0, z)
    building.userData.cell = { x, z }
    scene.add(building)
    buildings.push(building)
    return building
  },
}

const trunkMaterial = new MeshStandardMaterial({ color: '#714a31', roughness: 1 })
const leafMaterials = [
  new MeshStandardMaterial({ color: '#2d7b45', roughness: 1 }),
  new MeshStandardMaterial({ color: '#3f9450', roughness: 1 }),
  new MeshStandardMaterial({ color: '#1f6840', roughness: 1 }),
]

function createTree(x, z, scale = 1) {
  const tree = new Group()
  tree.name = 'procedural-sidewalk-tree'
  tree.position.set(x, 0, z)
  const trunk = new Mesh(new CylinderGeometry(0.11 * scale, 0.16 * scale, 0.7 * scale, 7), trunkMaterial)
  trunk.position.y = 0.35 * scale
  trunk.castShadow = true
  const crown = new Mesh(new ConeGeometry(0.65 * scale, 1.55 * scale, 8), leafMaterials[trees.length % leafMaterials.length])
  crown.position.y = 1.35 * scale
  crown.castShadow = true
  crown.receiveShadow = true
  tree.add(trunk, crown)
  scene.add(tree)
  trees.push(tree)
  return tree
}

function createCar(x, z, color, direction = 1) {
  const car = new Group()
  car.name = 'procedural-moving-car'
  car.position.set(x, 0.16, z)
  car.userData.direction = direction
  car.userData.origin = x
  const body = new Mesh(new BoxGeometry(0.72, 0.22, 0.38), new MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 }))
  body.castShadow = true
  const cabin = new Mesh(new BoxGeometry(0.32, 0.16, 0.3), new MeshStandardMaterial({ color: '#dce9e6', roughness: 0.35, metalness: 0.1 }))
  cabin.position.set(-0.04, 0.18, 0)
  cabin.castShadow = true
  car.add(body, cabin)
  scene.add(car)
  cars.push(car)
  return car
}

function populateCityBlocks() {
  const cellCount = Math.round(MAP_SIZE / CELL_SIZE)
  const roadBand = 1
  const blockSpan = 8
  for (let column = 0; column < cellCount; column += 1) {
    for (let row = 0; row < cellCount; row += 1) {
      const x = FIRST_CELL_CENTER + column * CELL_SIZE
      const z = FIRST_CELL_CENTER + row * CELL_SIZE
      if (column % blockSpan < roadBand || row % blockSpan < roadBand) world.addRoad(x, z)
    }
  }
  for (let blockX = 0; blockX < cellCount; blockX += blockSpan) {
    for (let blockZ = 0; blockZ < cellCount; blockZ += blockSpan) {
      if (blockX + blockSpan >= cellCount || blockZ + blockSpan >= cellCount) continue
      const lots = [[2, 2], [5, 2], [2, 5], [5, 5]]
      lots.forEach(([dx, dz], lotIndex) => {
        if (Math.random() >= 0.5) {
          createTree(FIRST_CELL_CENTER + (blockX + dx) * CELL_SIZE, FIRST_CELL_CENTER + (blockZ + dz) * CELL_SIZE, 0.9)
          return
        }
        const x = FIRST_CELL_CENTER + (blockX + dx) * CELL_SIZE
        const z = FIRST_CELL_CENTER + (blockZ + dz) * CELL_SIZE
        const type = lotIndex === 0 && (blockX + blockZ) % 3 === 0
          ? 'SKYSCRAPER'
          : lotIndex === 3 ? 'SHOP' : 'HOUSE'
        const building = createSpriteBuilding(type)
        if (!building) return
        building.position.set(x, 0, z)
        building.userData.cell = { x, z }
        scene.add(building)
        buildings.push(building)
      })
      createTree(FIRST_CELL_CENTER + (blockX + 1) * CELL_SIZE, FIRST_CELL_CENTER + (blockZ + 1) * CELL_SIZE, 0.9)
      createTree(FIRST_CELL_CENTER + (blockX + 6) * CELL_SIZE, FIRST_CELL_CENTER + (blockZ + 6) * CELL_SIZE, 1.05)
    }
  }
  createCar(-24, -1, '#d9544d', 1)
  createCar(18, 1, '#4b83bd', -1)
  createCar(-2, 24, '#e8a33b', 1)
}

const cameraTarget = new Vector3(0, 0, 0)
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 300)
camera.position.set(44, 44, 44)
camera.zoom = 1.18
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
let selectedBuildingType = 'HOUSE'
const toolButtons = [...document.querySelectorAll('[data-tool]')]

function updateToolbar() {
  for (const button of toolButtons) {
    const tool = button.dataset.tool
    const active = tool === 'ROAD'
      ? currentMode === 'ROAD'
      : currentMode === 'BUILDING' && tool === selectedBuildingType
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
    button.disabled = tool !== 'ROAD' && !spritesReady
  }
}

function setTool(tool) {
  if (tool === 'ROAD') currentMode = 'ROAD'
  else if (Object.hasOwn(buildingTypes, tool) && spritesReady) {
    currentMode = 'BUILDING'
    selectedBuildingType = tool
  } else return
  updateToolbar()
  updateHighlightFromScreen(lastPointerX, lastPointerY)
}

for (const button of toolButtons) button.addEventListener('click', () => setTool(button.dataset.tool))

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
  else world.addBuilding(cell.x, cell.z, selectedBuildingType)
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
  if (key === 'r') setTool('ROAD')
  else if (key === 'b' || key === 'h') setTool('HOUSE')
  else if (key === 's') setTool('SHOP')
  else if (key === 'k') setTool('SKYSCRAPER')
})

function projectCellToScreen(x, z) {
  const position = new Vector3(x, 0, z).project(camera)
  const rect = canvas.getBoundingClientRect()
  return {
    x: rect.left + (position.x + 1) * rect.width / 2,
    y: rect.top + (1 - position.y) * rect.height / 2,
  }
}

updateToolbar()
resizeCamera()
updateHighlightFromScreen(lastPointerX, lastPointerY)

function sortBuildingSprites() {
  camera.updateMatrixWorld(true)
  const screenPositions = buildings.map(building => {
    const projected = new Vector3(building.position.x, 0, building.position.z).project(camera)
    return { building, screenY: (1 - projected.y) * 0.5 }
  }).sort((a, b) => a.screenY - b.screenY)

  screenPositions.forEach(({ building }, index) => {
    building.renderOrder = 10 + index
  })
}

function animate() {
  resizeCamera()
  updateCameraInertia()
  const time = performance.now() * 0.00035
  cars.forEach((car, index) => {
    if (index === 2) {
      car.position.z = 24 + Math.sin(time * 0.7) * 10
    } else {
      car.position.x = car.userData.origin + Math.sin(time * 1.5 + index) * 13 * car.userData.direction
    }
  })
  sortBuildingSprites()
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)

window.__game = {
  world,
  camera,
  renderer,
  createSpriteBuilding,
  createRoadTile,
  get spritesReady() { return spritesReady },
  get selectedBuildingType() { return selectedBuildingType },
  get currentMode() { return currentMode },
  setTool,
  zoomCameraByFactor,
  projectCellToScreen,
  sortBuildingSprites,
  cameraBounds: { min: -LAST_CELL_CENTER, max: LAST_CELL_CENTER },
}
