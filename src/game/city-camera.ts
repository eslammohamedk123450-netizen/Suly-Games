import * as THREE from 'three'
import { CONFIG } from './config'

const WORLD_UP = new THREE.Vector3(0, 1, 0)

/** Fixed 2.5D camera: orthographic, isometric, and pannable without changing its angle. */
export class IsometricCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300)
  private readonly target = new THREE.Vector3(0, 0, 0)
  private readonly direction = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly screenUp = new THREE.Vector3()
  private readonly horizontalUp = new THREE.Vector3()
  private lastWidth = 0
  private lastHeight = 0
  private lastViewHeight = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.camera.position.set(50, 50, 50)
    this.camera.lookAt(this.target)
    this.resize()
  }

  /** Update the orthographic view after a resize or a live Preview Tweak adjustment. */
  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    const viewHeight = CONFIG.city.cameraViewHeight
    if (width === this.lastWidth && height === this.lastHeight && viewHeight === this.lastViewHeight) return
    this.lastWidth = width
    this.lastHeight = height
    this.lastViewHeight = viewHeight
    const halfHeight = viewHeight / 2
    const halfWidth = halfHeight * (width / Math.max(height, 1))
    this.camera.left = -halfWidth
    this.camera.right = halfWidth
    this.camera.top = halfHeight
    this.camera.bottom = -halfHeight
    this.camera.updateProjectionMatrix()
  }

  /** Pan the camera parallel to the ground plane in response to pointer drag pixels. */
  panByPixels(deltaX: number, deltaY: number): void {
    const height = this.canvas.clientHeight || window.innerHeight
    const worldUnitsPerPixel = CONFIG.city.cameraViewHeight / Math.max(height, 1) * CONFIG.city.panSensitivity
    this.camera.getWorldDirection(this.direction)
    this.right.crossVectors(this.direction, WORLD_UP).normalize()
    this.screenUp.crossVectors(this.right, this.direction).normalize()
    this.horizontalUp.set(this.screenUp.x, 0, this.screenUp.z).normalize()

    const movement = this.right.multiplyScalar(-deltaX * worldUnitsPerPixel)
      .addScaledVector(this.horizontalUp, deltaY * worldUnitsPerPixel)
    this.target.add(movement)
    this.camera.position.add(movement)
    this.camera.lookAt(this.target)
  }
}
