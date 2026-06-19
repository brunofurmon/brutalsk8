import { useEffect, useRef } from 'react'
import { Vec3, sub, cross, dot, normalize } from '@/lib/math3d'
import { Triangle, createBox, createSphere, createPyramid, createRamp } from '@/lib/geometry'
import { inputState } from '@/lib/input'

export function GameCanvas({ onJump }: { onJump?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const texturesRef = useRef<Record<string, HTMLImageElement | null>>({
    ground: null,
    wood: null,
    concrete: null,
  })

  useEffect(() => {
    const loadImg = (key: string, url: string) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = url
      img.onload = () => {
        texturesRef.current[key] = img
      }
    }
    loadImg(
      'ground',
      'https://images.unsplash.com/photo-1620286811904-89ce86e680a6?q=80&w=512&auto=format&fit=crop',
    )
    loadImg(
      'wood',
      'https://images.unsplash.com/photo-1533035353720-f1c6a75cd8ab?q=80&w=512&auto=format&fit=crop',
    )
    loadImg(
      'concrete',
      'https://images.unsplash.com/photo-1518099074172-2e47ee6cb394?q=80&w=512&auto=format&fit=crop',
    )

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
    const propsState = Array.from({ length: 150 }).map(() => {
      const isBox = Math.random() > 0.3
      const material = Math.random() > 0.5 ? 'wood' : 'concrete'
      return {
        type: isBox ? 'box' : 'ramp',
        material: material,
        x: (Math.random() - 0.5) * 13000,
        z: (Math.random() - 0.5) * 13000,
        color: [
          Math.random() * 50 + 20,
          Math.random() * 50 + 100,
          Math.random() * 50 + 200,
        ] as Vec3,
      }
    })

    // Constants
    const SPEED = 18
    const JUMP_VEL = 42
    const GRAVITY = 2.25
    const CAM_Y = 160
    const CAM_Z = -350
    const PLAYER_Z = 150
    const TILT = 0.2
    const FOCAL = 500
    const HORIZON_RADIUS = 6000
    const ROT_SPEED = 0.045
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

    const createSkateboard = (
      y: number,
      z: number,
      rollAngle: number,
    ): (Triangle & { layer: number })[] => {
      const deck = createBox([0, 0, 0], [30, 5, 90], [250, 204, 21]).map((t) => ({
        ...t,
        layer: 1,
      }))

      const wheelC: Vec3 = [40, 40, 40]
      const wheels = [
        ...createPyramid([-15, -4, 25], [8, 8, 8], wheelC),
        ...createPyramid([15, -4, 25], [8, 8, 8], wheelC),
        ...createPyramid([-15, -4, -25], [8, 8, 8], wheelC),
        ...createPyramid([15, -4, -25], [8, 8, 8], wheelC),
      ].map((t) => ({ ...t, layer: 0 }))

      const c = Math.cos(rollAngle)
      const s = Math.sin(rollAngle)

      return [...wheels, ...deck].map((tri) => ({
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
      if (inputState.space && playerY === 0) {
        playerVY = JUMP_VEL
        if (onJump) onJump()
      }

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

      // World-Fixed Sun (Infinite Distance)
      const pxSun = 0
      const pzSun = 15000
      const pySun = 0
      const tSun = transform([pxSun, pySun, pzSun], true)

      if (tSun[2] > 10) {
        const sx = tSun[0] * (FOCAL / tSun[2]) + width / 2
        const sy = -tSun[1] * (FOCAL / tSun[2]) + height / 2
        const sunRadius = 180

        ctx.fillStyle = '#FDE047'
        ctx.beginPath()
        ctx.arc(sx, sy, sunRadius, Math.PI, 0)
        ctx.fill()
      }

      const triangles: Triangle[] = []
      const TILE_SIZE = 1000

      // Floor Grid (Circular boundary)
      for (let c = -8; c <= 8; c++) {
        for (let r = -8; r <= 8; r++) {
          const x = c * TILE_SIZE - (worldX % TILE_SIZE)
          const z = r * TILE_SIZE - (worldZ % TILE_SIZE)

          if (Math.hypot(x + TILE_SIZE / 2, z + TILE_SIZE / 2) > HORIZON_RADIUS) continue

          const color: Vec3 = [105, 105, 105]

          triangles.push({
            vertices: [
              [x, 0, z],
              [x + TILE_SIZE, 0, z],
              [x + TILE_SIZE, 0, z + TILE_SIZE],
            ],
            color,
            uvs: [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
            material: 'ground',
            isWorld: true,
            isGround: true,
          } as any)
          triangles.push({
            vertices: [
              [x, 0, z],
              [x + TILE_SIZE, 0, z + TILE_SIZE],
              [x, 0, z + TILE_SIZE],
            ],
            color,
            uvs: [
              [0, 0],
              [1, 1],
              [0, 1],
            ],
            material: 'ground',
            isWorld: true,
            isGround: true,
          } as any)
        }
      }

      // Props (Infinite Treadmill wrapping)
      propsState.forEach((p) => {
        let px = p.x - worldX,
          pz = p.z - worldZ
        if (px < -6500) p.x += 13000
        if (px > 6500) p.x -= 13000
        if (pz < -6500) p.z += 13000
        if (pz > 6500) p.z -= 13000

        if (Math.hypot(px, pz) < HORIZON_RADIUS) {
          if (p.type === 'box') {
            createBox([px, 30, pz], [60, 60, 60], p.color, p.material).forEach((t) => {
              triangles.push({ ...t, isWorld: true })
            })
          } else {
            createRamp([px, 40, pz], [120, 80, 160], p.color, p.material).forEach((t) => {
              triangles.push({ ...t, isWorld: true })
            })
          }
        }
      })

      // Skater
      createSkateboard(playerY, PLAYER_Z, boardAngle).forEach((t) => {
        triangles.push({ ...t, isWorld: false } as any)
      })
      createPyramid([0, playerY + 45, PLAYER_Z], [40, 60, 25], [225, 29, 72]).forEach((t) => {
        triangles.push({ ...t, isWorld: false, layer: 2 } as any)
      })
      // Character head as a low-poly sphere
      createSphere([0, playerY + 85, PLAYER_Z], 18, [225, 29, 72], false).forEach((t) => {
        triangles.push({ ...t, isWorld: false, layer: 3 } as any)
      })

      // Projection & Shading
      type Vertex = { pos: Vec3; uv?: [number, number] }
      const clipPolygon = (vertices: Vertex[], minZ: number): Vertex[] => {
        const result: Vertex[] = []
        for (let i = 0; i < vertices.length; i++) {
          const v1 = vertices[i]
          const v2 = vertices[(i + 1) % vertices.length]
          const d1 = v1.pos[2] - minZ
          const d2 = v2.pos[2] - minZ

          if (d1 >= 0) {
            result.push(v1)
          }
          if (d1 * d2 < 0) {
            const t = d1 / (d1 - d2)
            const pos: Vec3 = [
              v1.pos[0] + (v2.pos[0] - v1.pos[0]) * t,
              v1.pos[1] + (v2.pos[1] - v1.pos[1]) * t,
              minZ,
            ]
            let uv: [number, number] | undefined = undefined
            if (v1.uv && v2.uv) {
              uv = [v1.uv[0] + (v2.uv[0] - v1.uv[0]) * t, v1.uv[1] + (v2.uv[1] - v1.uv[1]) * t]
            }
            result.push({ pos, uv })
          }
        }
        return result
      }

      const projected = triangles
        .map((t: any) => {
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

          const poly: Vertex[] = [
            { pos: tv0, uv: t.uvs?.[0] },
            { pos: tv1, uv: t.uvs?.[1] },
            { pos: tv2, uv: t.uvs?.[2] },
          ]

          const clipped = clipPolygon(poly, 10)
          if (clipped.length < 3) return null

          const pts2d = clipped.map((v) => [
            v.pos[0] * (FOCAL / v.pos[2]) + width / 2,
            -v.pos[1] * (FOCAL / v.pos[2]) + height / 2,
          ])

          const uvs = clipped.map((v) => v.uv)

          const zAvg = clipped.reduce((sum, v) => sum + v.pos[2], 0) / clipped.length

          return {
            pts: pts2d,
            uvs,
            color: t.color,
            material: t.material,
            zAvg,
            normal,
            isGround: t.isGround,
            layer: t.layer,
          }
        })
        .filter(Boolean) as any[]

      projected.sort((a, b) => {
        if (a.isGround && !b.isGround) return -1
        if (!a.isGround && b.isGround) return 1

        let za = a.zAvg
        let zb = b.zAvg

        // Visual Depth Correction for Character Parts
        // Layers: 0 (Wheels), 1 (Deck), 2 (Body), 3 (Head)
        // By adding an offset based on the layer, we ensure that smaller layers
        // have larger zSort values, meaning they are drawn earlier (further back).
        if (a.layer !== undefined) za += (3 - a.layer) * 25
        if (b.layer !== undefined) zb += (3 - b.layer) * 25

        return zb - za
      })

      // Render
      const drawTexturedTriangle = (img: HTMLImageElement, pts: number[][], uvs: number[][]) => {
        const [x0, y0] = pts[0]
        const [x1, y1] = pts[1]
        const [x2, y2] = pts[2]

        const w = img.naturalWidth
        const h = img.naturalHeight

        const u0 = uvs[0][0] * w,
          v0 = uvs[0][1] * h
        const u1 = uvs[1][0] * w,
          v1 = uvs[1][1] * h
        const u2 = uvs[2][0] * w,
          v2 = uvs[2][1] * h

        ctx.save()
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.closePath()
        ctx.clip()

        const det = (u0 - u2) * (v1 - v2) - (u1 - u2) * (v0 - v2)
        if (Math.abs(det) > 0.0001) {
          const a = ((x0 - x2) * (v1 - v2) - (x1 - x2) * (v0 - v2)) / det
          const b = ((y0 - y2) * (v1 - v2) - (y1 - y2) * (v0 - v2)) / det
          const c = ((u0 - u2) * (x1 - x2) - (u1 - u2) * (x0 - x2)) / det
          const d = ((u0 - u2) * (y1 - y2) - (u1 - u2) * (y0 - y2)) / det
          const e = x0 - a * u0 - c * v0
          const f = y0 - b * u0 - d * v0

          ctx.transform(a, b, c, d, e, f)
          ctx.drawImage(img, 0, 0)
        }
        ctx.restore()
      }

      ctx.lineJoin = 'miter'
      for (const p of projected) {
        const intensity = 0.35 + 0.65 * Math.max(0, dot(p.normal, lightDir))

        let textured = false
        if (p.material && p.uvs && !p.uvs.includes(undefined)) {
          const img = texturesRef.current[p.material]
          if (img && img.complete && img.naturalWidth > 0) {
            for (let i = 1; i < p.pts.length - 1; i++) {
              drawTexturedTriangle(
                img,
                [p.pts[0], p.pts[i], p.pts[i + 1]],
                [p.uvs[0], p.uvs[i], p.uvs[i + 1]],
              )
            }
            // Shadow overlay over texture
            ctx.fillStyle = `rgba(0,0,0,${1 - intensity})`
            ctx.beginPath()
            ctx.moveTo(p.pts[0][0], p.pts[0][1])
            for (let i = 1; i < p.pts.length; i++) {
              ctx.lineTo(p.pts[i][0], p.pts[i][1])
            }
            ctx.closePath()
            ctx.fill()
            textured = true
          }
        }

        if (!textured) {
          const r = Math.floor(p.color[0] * intensity)
          const g = Math.floor(p.color[1] * intensity)
          const b = Math.floor(p.color[2] * intensity)

          ctx.fillStyle = `rgb(${r},${g},${b})`
          if (p.isGround) {
            ctx.strokeStyle = `rgb(${r},${g},${b})`
            ctx.lineWidth = 1
          } else {
            ctx.strokeStyle = `rgb(${Math.max(0, r - 15)},${Math.max(0, g - 15)},${Math.max(0, b - 15)})`
            ctx.lineWidth = 1.5
          }

          ctx.beginPath()
          ctx.moveTo(p.pts[0][0], p.pts[0][1])
          for (let i = 1; i < p.pts.length; i++) {
            ctx.lineTo(p.pts[i][0], p.pts[i][1])
          }
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
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
