import * as THREE from 'three'
import { CONFIG } from './config'

export class CityWorld {
  readonly scene = new THREE.Scene()
  readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>
  readonly ambient: THREE.AmbientLight
  readonly sun: THREE.DirectionalLight
  readonly buildings: THREE.Group[] = []

  constructor() {
    this.scene.background = new THREE.Color('#b9d9ad')

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CONFIG.city.mapSize, CONFIG.city.mapSize),
      new THREE.MeshStandardMaterial({ color: '#71b965', roughness: 1, metalness: 0 }),
    )
    this.ground.name = 'city-ground'
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    this.scene.add(this.ground)

    const divisions = Math.max(1, Math.round(CONFIG.city.mapSize / CONFIG.city.cellSize))
    const grid = new THREE.GridHelper(CONFIG.city.mapSize, divisions, '#315f32', '#43803f')
    grid.name = 'city-grid'
    grid.position.y = 0.04
    grid.userData.divisions = divisions
    grid.userData.cellSize = CONFIG.city.cellSize
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
    for (const material of gridMaterials) {
      material.transparent = true
      material.opacity = 0.8
      material.depthWrite = false
      if (material instanceof THREE.LineBasicMaterial) {
        material.vertexColors = false
        material.color.set('#315f32')
      }
    }
    this.scene.add(grid)

    this.ambient = new THREE.AmbientLight('#ffffff', CONFIG.city.ambientIntensity)
    this.scene.add(this.ambient)

    this.sun = new THREE.DirectionalLight('#fff7e7', CONFIG.city.sunIntensity)
    this.sun.name = 'city-sun'
    this.sun.position.set(42, 58, 36)
    this.sun.target.position.set(0, 0, 0)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = -62
    this.sun.shadow.camera.right = 62
    this.sun.shadow.camera.top = 62
    this.sun.shadow.camera.bottom = -62
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 180
    this.sun.shadow.camera.updateProjectionMatrix()
    this.sun.shadow.bias = -0.00025
    this.sun.shadow.normalBias = 0.025
    this.sun.shadow.radius = 3
    this.scene.add(this.sun, this.sun.target)
  }

  /** Read current Preview Tweak values; the production scene remains simple and deterministic. */
  syncTuning(): void {
    this.ambient.intensity = CONFIG.city.ambientIntensity
    this.sun.intensity = CONFIG.city.sunIntensity
  }

  /** Build a primitive-only house whose group origin is its absolute bottom center. */
  createBuilding(): THREE.Group {
    const scale = 1
    const group = new THREE.Group()
    group.name = 'procedural-building'

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2 * scale, 2 * scale, 2 * scale),
      new THREE.MeshStandardMaterial({ color: '#e8d5ad', roughness: 0.88 }),
    )
    base.position.y = scale
    group.add(base)

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.48 * scale, 1.82 * scale, 4),
      new THREE.MeshStandardMaterial({ color: '#bd6448', roughness: 0.9 }),
    )
    roof.position.y = 2.91 * scale
    roof.rotation.y = Math.PI / 4
    group.add(roof)

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.48 * scale, 0.9 * scale, 0.08 * scale),
      new THREE.MeshStandardMaterial({ color: '#76513a', roughness: 1 }),
    )
    door.position.set(0, 0.45 * scale, 1.04 * scale)
    group.add(door)

    group.traverse(object => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    return group
  }

  addBuilding(x: number, z: number): THREE.Group {
    const building = this.createBuilding()
    building.position.set(x, 0, z)
    this.scene.add(building)
    this.buildings.push(building)
    return building
  }
}
