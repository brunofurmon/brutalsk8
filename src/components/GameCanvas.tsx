import { useEffect, useRef } from 'react'
import { Vec3, sub, cross, dot, normalize } from '@/lib/math3d'
import { Triangle, createBox } from '@/lib/geometry'
import { inputState } from '@/lib/input'

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    let width = 0,
      height = 0
    const resize = () => {
      width = container.clientWidth
      height = container.clientHeight
      canvas.width = width
      canvas.height = height
    }
    window.addEventListener('resize', resize)
    resize()

    // Game State
    let worldX = 0,
      worldZ = 0
    let playerY = 0,
      playerVY = 0
    const propsState = Array.from({ length: 15 }).map(() => ({
      x: (Math.random() - 0.5) * 3000,
      z: (Math.random() - 0.5) * 3000,
      color: [Math.random() * 50 + 20, Math.random() * 50 + 100, Math.random() * 50 + 200] as Vec3,
    }))

    // Constants
    const SPEED = 12
    const JUMP_VEL = 14
    const GRAVITY = 0.5
    const CAM_Y = 180
    const CAM_Z = -400
    const TILT = 0.3 // radians down
    const FOCAL = 500
    const lightDir = normalize([1, 0.5, 1])

    const transform = (v: Vec3): Vec3 => {
      const dx = v[0],
        dy = v[1] - CAM_Y,
        dz = v[2] - CAM_Z
      const cy = Math.cos(TILT),
        sy = Math.sin(TILT)
      return [dx, dy * cy - dz * sy, dy * sy + dz * cy]
    }

    let animationId: number
    const loop = () => {
      // Physics & Input
      if (inputState.w) worldZ -= SPEED
      if (inputState.s) worldZ += SPEED
      if (inputState.a) worldX -= SPEED
      if (inputState.d) worldX += SPEED

      if (inputState.space && playerY === 0) playerVY = JUMP_VEL
      playerY += playerVY
      playerVY -= GRAVITY
      if (playerY < 0) {
        playerY = 0
        playerVY = 0
      }

      ctx.clearRect(0, 0, width, height)

      // Draw Skybox Background
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, '#1E3A8A')
      gradient.addColorStop(1, '#F97316')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      const triangles: Triangle[] = []
      const TILE_SIZE = 200
      const cols = 18,
        rows = 24
      const startCol = -Math.floor(cols / 2),
        startRow = -4

      // Floor Grid
      for (let c = startCol; c < startCol + cols; c++) {
        for (let r = startRow; r < startRow + rows; r++) {
          const x = c * TILE_SIZE - (worldX % TILE_SIZE)
          const z = r * TILE_SIZE - (worldZ % TILE_SIZE)
          const trueCol = c + Math.floor(worldX / TILE_SIZE)
          const trueRow = r + Math.floor(worldZ / TILE_SIZE)
          const color: Vec3 = (trueCol + trueRow) % 2 === 0 ? [115, 115, 115] : [95, 95, 95]

          triangles.push({
            vertices: [
              [x, 0, z],
              [x + TILE_SIZE, 0, z],
              [x + TILE_SIZE, 0, z + TILE_SIZE],
            ],
            color,
          })
          triangles.push({
            vertices: [
              [x, 0, z],
              [x + TILE_SIZE, 0, z + TILE_SIZE],
              [x, 0, z + TILE_SIZE],
            ],
            color,
          })
        }
      }

      // Decorative Props (Infinite Treadmill wrapping)
      propsState.forEach((p) => {
        let px = p.x - worldX,
          pz = p.z - worldZ
        if (px < -1500) p.x += 3000
        if (px > 1500) p.x -= 3000
        if (pz < -1000) p.z += 3000
        if (pz > 2000) p.z -= 3000
        triangles.push(...createBox([px, 30, pz], [60, 60, 60], p.color))
      })

      // Skater
      triangles.push(...createBox([0, playerY + 5, 0], [30, 5, 90], [250, 204, 21])) // Board
      triangles.push(...createBox([0, playerY + 40, 0], [40, 60, 25], [225, 29, 72])) // Body
      triangles.push(...createBox([0, playerY + 80, 0], [25, 25, 25], [225, 29, 72])) // Head

      // Projection & Shading
      const projected = triangles
        .map((t) => {
          const v0 = t.vertices[0],
            v1 = t.vertices[1],
            v2 = t.vertices[2]
          const normal = normalize(cross(sub(v1, v0), sub(v2, v0)))
          const tv0 = transform(v0),
            tv1 = transform(v1),
            tv2 = transform(v2)
          if (tv0[2] < 10 || tv1[2] < 10 || tv2[2] < 10) return null

          const p0x = tv0[0] * (FOCAL / tv0[2]) + width / 2,
            p0y = -tv0[1] * (FOCAL / tv0[2]) + height / 2
          const p1x = tv1[0] * (FOCAL / tv1[2]) + width / 2,
            p1y = -tv1[1] * (FOCAL / tv1[2]) + height / 2
          const p2x = tv2[0] * (FOCAL / tv2[2]) + width / 2,
            p2y = -tv2[1] * (FOCAL / tv2[2]) + height / 2
          return {
            pts: [
              [p0x, p0y],
              [p1x, p1y],
              [p2x, p2y],
            ],
            color: t.color,
            zAvg: (tv0[2] + tv1[2] + tv2[2]) / 3,
            normal,
          }
        })
        .filter(Boolean) as any[]

      projected.sort((a, b) => b.zAvg - a.zAvg)

      // Render
      ctx.lineJoin = 'miter'
      for (const p of projected) {
        const intensity = 0.35 + 0.65 * Math.max(0, dot(p.normal, lightDir))
        const r = Math.floor(p.color[0] * intensity),
          g = Math.floor(p.color[1] * intensity),
          b = Math.floor(p.color[2] * intensity)

        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.strokeStyle = `rgb(${Math.max(0, r - 15)},${Math.max(0, g - 15)},${Math.max(0, b - 15)})`
        ctx.lineWidth = 1.5

        ctx.beginPath()
        ctx.moveTo(p.pts[0][0], p.pts[0][1])
        ctx.lineTo(p.pts[1][0], p.pts[1][1])
        ctx.lineTo(p.pts[2][0], p.pts[2][1])
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      animationId = requestAnimationFrame(loop)
    }

    animationId = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-black touch-none">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  )
}
