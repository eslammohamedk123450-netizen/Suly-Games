import * as THREE from 'three'
import type { Quality } from './save'

/** Lightweight WebGL renderer shared by the game's city scene. */
export class Renderer {
  readonly gl: THREE.WebGLRenderer

  constructor(readonly canvas: HTMLCanvasElement, _quality: Quality = 'medium') {
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.shadowMap.enabled = true
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap
    this.resize()
    window.addEventListener('resize', this.resize)
  }

  get shadowMapSize(): number {
    return 2048
  }

  applyQuality(_quality: Quality): void {
    this.gl.shadowMap.enabled = true
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.resize()
  }

  private resize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.gl.setSize(width, height, false)
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.gl.render(scene, camera)
  }
}
