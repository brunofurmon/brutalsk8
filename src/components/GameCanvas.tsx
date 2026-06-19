import { useEffect, useRef } from 'react'
import { Vec3, sub, cross, dot, normalize } from '@/lib/math3d'
import { Triangle, createBox, createSphere, createPyramid } from '@/lib/geometry'
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
      worldZ = 0,
      worldAngle = 0
    let playerY = 0,
      playerVY = 0,
      boardAngle = 0
    const propsState = Array.from({ length: 40 }).map(() => ({
      x: (Math.random() - 0.5) * 5000,
      z: (Math.random() - 0.5) * 5000,
      color: [Math.random() * 50 + 20, Math.random() * 50 + 100, Math.random() * 50 + 200] as Vec3,
    }))

    // Constants
    const SPEED = 18
    const JUMP_VEL = 55
    const GRAVITY = 3.5
    const CAM_Y = 160
    const CAM_Z = -350
    const PLAYER_Z = 150
    const TILT = 0.2
    const FOCAL = 500
    const HORIZON_RADIUS = 2500
    const ROT_SPEED = 0.06
    const lightDir = normalize([0.5, 0.8, 0.5])

    const transform = (v: Vec3, isWorld: boolean = true): Vec3 => {
      let [dx, dy, dz] = v
      if (isWorld) {
        const cA = Math.cos(-worldAngle)
        const sA = Math.sin(-worldAngle)
        const nx = dx * cA - dz * sA
        const nz = dx * sA + dz * cA
        dx = nx
        dz = nz
      }
      dy = dy - CAM_Y
      dz = dz - CAM_Z
      const cy = Math.cos(TILT),
        sy = Math.sin(TILT)
      return [dx, dy * cy - dz * sy, dy * sy + dz * cy]
    }

    const createSkateboard = (y: number, z: number, rollAngle: number): Triangle[] => {
      const t: Triangle[] = []
      t.push(...createBox([0, 0, 0], [30, 5, 90], [250, 204, 21])) // Deck

      const wheelC: Vec3 = [40, 40, 40]
      t.push(...createPyramid([-15, -4, 25], [8, 8, 8], wheelC))
      t.push(...createPyramid([15, -4, 25], [8, 8, 8], wheelC))
      t.push(...createPyramid([-15, -4, -25], [8, 8, 8], wheelC))
      t.push(...createPyramid([15, -4, -25], [8, 8, 8], wheelC))

      const c = Math.cos(rollAngle)
      const s = Math.sin(rollAngle)

      return t.map((tri) => ({
        ...tri,
        vertices: tri.vertices.map((v) => {
          const rx = v[0] * c - v[1] * s
          const ry = v[0] * s + v[1] * c
          return [rx, ry + y + 8, v[2] + z] as Vec3
        }) as [Vec3, Vec3, Vec3],
      }))
    }

    let animationId: number
    const loop = () => {
      // Rotation
      if (inputState.a) worldAngle += ROT_SPEED
      if (inputState.d) worldAngle -= ROT_SPEED

      // Movement (Inverted vertical movement)
      const moveX = Math.sin(-worldAngle) * SPEED
      const moveZ = Math.cos(-worldAngle) * SPEED
      if (inputState.w) {
        worldX += moveX
        worldZ += moveZ
      }
      if (inputState.s) {
        worldX -= moveX
        worldZ -= moveZ
      }

      // Jump & Kickflip
      if (inputState.space && playerY === 0) playerVY = JUMP_VEL

      if (playerY > 0 || playerVY !== 0) {
        playerY += playerVY
        playerVY -= GRAVITY

        // Complete 1 full rotation smoothly over the jump duration
        boardAngle += (Math.PI * 2) / ((2 * JUMP_VEL) / GRAVITY)

        if (playerY <= 0) {
          playerY = 0
          playerVY = 0
          boardAngle = 0
        }
      }

      ctx.clearRect(0, 0, width, height)

      // Skybox Background
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, '#1E3A8A')
      gradient.addColorStop(1, '#F97316')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      // World-Fixed Sun
      const sunWorldPos: Vec3 = [0, 3000, 15000]
      const pxSun = sunWorldPos[0] - worldX
      const pzSun = sunWorldPos[2] - worldZ
      const pySun = sunWorldPos[1]
      const tSun = transform([pxSun, pySun, pzSun], true)

      if (tSun[2] > 10) {
        const sx = tSun[0] * (FOCAL / tSun[2]) + width / 2
        const sy = -tSun[1] * (FOCAL / tSun[2]) + height / 2
        const sunRadius = 2700000 / tSun[2]

        ctx.fillStyle = '#FDE047'
        ctx.beginPath()
        ctx.arc(sx, sy, sunRadius, 0, Math.PI * 2)
        ctx.fill()
      }

      const triangles: Triangle[] = []
      const TILE_SIZE = 1000

      // Floor Grid (Circular boundary)
      for (let c = -4; c <= 4; c++) {
        for (let r = -4; r <= 4; r++) {
          const x = c * TILE_SIZE - (worldX % TILE_SIZE)
          const z = r * TILE_SIZE - (worldZ % TILE_SIZE)

          if (Math.hypot(x + TILE_SIZE / 2, z + TILE_SIZE / 2) > HORIZON_RADIUS) continue

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
            isWorld: true,
          })
          triangles.push({
            vertices: [
              [x, 0, z],
              [x + TILE_SIZE, 0, z + TILE_SIZE],
              [x, 0, z + TILE_SIZE],
            ],
            color,
            isWorld: true,
          })
        }
      }

      // Props (Infinite Treadmill wrapping)
      propsState.forEach((p) => {
        let px = p.x - worldX,
          pz = p.z - worldZ
        if (px < -2500) p.x += 5000
        if (px > 2500) p.x -= 5000
        if (pz < -2500) p.z += 5000
        if (pz > 2500) p.z -= 5000

        if (Math.hypot(px, pz) < HORIZON_RADIUS) {
          createBox([px, 30, pz], [60, 60, 60], p.color).forEach((t) => {
            triangles.push({ ...t, isWorld: true })
          })
        }
      })

      // Skater
      createSkateboard(playerY, PLAYER_Z, boardAngle).forEach((t) => {
        triangles.push({ ...t, isWorld: false })
      })
      createPyramid([0, playerY + 45, PLAYER_Z], [40, 60, 25], [225, 29, 72]).forEach((t) => {
        triangles.push({ ...t, isWorld: false })
      })
      // Character head as a low-poly sphere
      createSphere([0, playerY + 85, PLAYER_Z], 18, [225, 29, 72], false).forEach((t) => {
        triangles.push({ ...t, isWorld: false })
      })

      // Projection & Shading
      const projected = triangles
        .map((t) => {
          const v0 = t.vertices[0],
            v1 = t.vertices[1],
            v2 = t.vertices[2]

          let normal = normalize(cross(sub(v1, v0), sub(v2, v0)))
          if (t.isWorld) {
            const cA = Math.cos(-worldAngle),
              sA = Math.sin(-worldAngle)
            normal = [normal[0] * cA - normal[2] * sA, normal[1], normal[0] * sA + normal[2] * cA]
          }

          const tv0 = transform(v0, t.isWorld ?? true)
          const tv1 = transform(v1, t.isWorld ?? true)
          const tv2 = transform(v2, t.isWorld ?? true)

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
        const r = Math.floor(p.color[0] * intensity)
        const g = Math.floor(p.color[1] * intensity)
        const b = Math.floor(p.color[2] * intensity)

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
