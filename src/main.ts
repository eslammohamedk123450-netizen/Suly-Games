import * as THREE from 'three'
import './styles/main.css'
import { Renderer } from './engine/renderer'
import { CONFIG } from './game/config'
import { IsometricCamera } from './game/city-camera'
import { CityWorld } from './game/city-world'
import { tuning } from './game/tuning'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')
  if (!canvas) throw new Error('Game canvas was not found')

  const renderer = new Renderer(canvas)
  const world = new CityWorld()
  const camera = new IsometricCamera(canvas)
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  if (import.meta.env.DEV) {
    const { registerGameTuning } = await import('../scripts/manus-tuning/adapter.js')
    await registerGameTuning(tuning)
  }

  type Drag = { id: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean }
  let drag: Drag | null = null

  const placeBuilding = (clientX: number, clientY: number): void => {
    const rect = canvas.getBoundingClientRect()
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera.camera)
    const hit = raycaster.intersectObject(world.ground, false)[0]
    if (!hit) return

    const halfMap = CONFIG.city.mapSize / 2
    const cellSize = CONFIG.city.cellSize
    const firstCenter = -halfMap + cellSize / 2
    const lastCenter = halfMap - cellSize / 2
    const snapToCellCenter = (value: number): number => THREE.MathUtils.clamp(
      firstCenter + Math.round((value - firstCenter) / cellSize) * cellSize,
      firstCenter,
      lastCenter,
    )
    const x = snapToCellCenter(hit.point.x)
    const z = snapToCellCenter(hit.point.z)
    world.addBuilding(x, z)
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false }
    canvas.setPointerCapture(event.pointerId)
  })

  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return
    const totalX = event.clientX - drag.startX
    const totalY = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(totalX, totalY) >= 4) drag.moved = true
    if (drag.moved) camera.panByPixels(event.clientX - drag.lastX, event.clientY - drag.lastY)
    drag.lastX = event.clientX
    drag.lastY = event.clientY
  })

  const finishPointer = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.id) return
    if (!drag.moved) placeBuilding(event.clientX, event.clientY)
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    drag = null
  }
  canvas.addEventListener('pointerup', finishPointer)
  canvas.addEventListener('pointercancel', event => {
    if (drag?.id === event.pointerId) drag = null
  })

  window.addEventListener('resize', () => camera.resize())

  const frame = (): void => {
    camera.resize()
    world.syncTuning()
    renderer.render(world.scene, camera.camera)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  // Read-only state hook used by the existing project smoke test and Preview diagnostics.
  ;(window as unknown as { __game: unknown }).__game = { world, camera: camera.camera, renderer }
}

boot().catch(error => {
  console.error('Suly City failed to start:', error)
})
