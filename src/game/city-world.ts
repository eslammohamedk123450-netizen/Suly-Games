import * as THREE from 'three'
import { CONFIG } from './config'

export class CityWorld {
  readonly scene = new THREE.Scene()
  readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>
  readonly ambient: THREE.AmbientLight
  readonly sun: THREE.DirectionalLight
  readonly buildings: THREE.Group[] = []

  constructor() {
    this.scene.background = new THREE.Color('#d8d2c5')

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CONFIG.city.mapSize, CONFIG.city.mapSize),
        new THREE.MeshStandardMaterial({ color: '#c8c4b9', roughness: 0.94, metalness: 0 }),
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

}
