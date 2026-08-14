import { useEffect, useRef } from 'react'
import { Vec3, sub, cross, dot, normalize } from '@/lib/math3d'
import { Triangle, createBox, createSphere, createPyramid, createRamp } from '@/lib/geometry'
import { inputState } from '@/lib/input'

type Vertex = { pos: Vec3 }

/**
 * Clipping de polígonos contra o plano z = minZ (near plane).
 */
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
      result.push({ pos })
    }
  }
  return result
}

type ProjectedPoly = {
  pts: number[][]
  color: Vec3
  zAvg: number
  normal: Vec3
  isGround?: boolean
  layer?: number
}

/**
 * Projeta, aplica sombreamento (lambert), ordena por profundidade e renderiza
 * a lista de triângulos no contexto fornecido. Função pura — não depende do
 * estado mutável do loop, apenas dos argumentos.
 */
const renderTriangles = (
  ctx: CanvasRenderingContext2D,
  triangles: Triangle[],
  width: number,
  height: number,
  worldAngle: number,
  FOCAL: number,
  transform: (v: Vec3, isWorld?: boolean) => Vec3,
  lightDir: Vec3,
) => {
  const projected: ProjectedPoly[] = []
  for (const t of triangles) {
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

    const clipped = clipPolygon([{ pos: tv0 }, { pos: tv1 }, { pos: tv2 }], 10)
    if (clipped.length < 3) continue

    const pts = clipped.map((v) => [
      v.pos[0] * (FOCAL / v.pos[2]) + width / 2,
      -v.pos[1] * (FOCAL / v.pos[2]) + height / 2,
    ])
    const zAvg = clipped.reduce((sum, v) => sum + v.pos[2], 0) / clipped.length

    projected.push({ pts, color: t.color, zAvg, normal, isGround: t.isGround, layer: t.layer })
  }

  projected.sort((a, b) => {
    if (a.isGround && !b.isGround) return -1
    if (!a.isGround && b.isGround) return 1

    let za = a.zAvg
    let zb = b.zAvg
    if (a.layer !== undefined) za += (3 - a.layer) * 25
    if (b.layer !== undefined) zb += (3 - b.layer) * 25
    return zb - za
  })

  ctx.lineJoin = 'miter'
  for (const p of projected) {
    const intensity = 0.35 + 0.65 * Math.max(0, dot(p.normal, lightDir))

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

export function GameCanvas({
  onJump,
  antialiasing = true,
}: {
  onJump?: () => void
  antialiasing?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const antialiasingRef = useRef(antialiasing)
  antialiasingRef.current = antialiasing

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    // Canvas offscreen para supersampling 2x (antialiasing barato).
    const offscreen = document.createElement('canvas')
    const offCtx = offscreen.getContext('2d', { alpha: false })
    if (!offCtx) return

    let width = 0,
      height = 0
    const resize = () => {
      width = container.clientWidth
      height = container.clientHeight
      canvas.width = width
      canvas.height = height
      offscreen.width = width * 2
      offscreen.height = height * 2
    }
    window.addEventListener('resize', resize)
    resize()

    // Game State
    let worldX = 0,
      worldZ = 0,
      worldAngle = 0
    // Velocidade angular da câmera (inércia de rotação). Incrementada pelo
    // input (teclado/joystick) e decai com fricção quando a tecla é solta,
    // produzindo um "drift" suave de ~0.5-1s após o release.
    let angularVelocity = 0
    let playerY = 0,
      playerVY = 0,
      boardAngle = 0
    const propsState = Array.from({ length: 150 }).map(() => {
      const isBox = Math.random() > 0.3
      const isWood = Math.random() > 0.5
      return {
        type: isBox ? 'box' : 'ramp',
        x: (Math.random() - 0.5) * 13000,
        z: (Math.random() - 0.5) * 13000,
        // Cores sólidas: madeira marrom ou concreto cinza
        color: (isWood
          ? [139, 90, 43] // madeira marrom
          : [160, 160, 160]) as Vec3, // concreto cinza
      }
    })

    // Constants
    const SPEED = 18
    // Jump physics: mesma altura de pico, mas arco ~1.75x mais longo.
    // Mantem H = v²/2g constante e multiplica o tempo de ar (2v/g) por 1.75:
    //   g_new = g / 1.75² ,  v_new = v / 1.75
    const JUMP_VEL = 24
    const GRAVITY = 0.735
    const CAM_Y = 160
    const CAM_Z = -350
    const PLAYER_Z = 150
    const TILT = 0.2
    const FOCAL = 500
    const HORIZON_RADIUS = 6000
    const ROT_SPEED = 0.045
    // Inércia de rotação: ACCEL = quão rápido atinge a velocidade alvo ao
    // pressionar; FRICTION = decaimento por frame ao soltar (drift suave).
    // FRICTION 0.94 ⇒ cai a ~6% em ~45 frames (~0.75s a 60fps).
    const ANGULAR_ACCEL = 0.2
    const ANGULAR_FRICTION = 0.94
    const ANGULAR_DEADZONE = 0.0005
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

    const transformTriangles = (
      tris: Triangle[],
      translate: Vec3,
      scale: Vec3 = [1, 1, 1],
      rotateY: number = 0,
      rotateZ: number = 0,
      rotateX: number = 0,
    ): Triangle[] => {
      const cy = Math.cos(rotateY),
        sy = Math.sin(rotateY)
      const cz = Math.cos(rotateZ),
        sz = Math.sin(rotateZ)
      const cx = Math.cos(rotateX),
        sx = Math.sin(rotateX)

      return tris.map((t) => ({
        ...t,
        vertices: t.vertices.map((v) => {
          let x = v[0] * scale[0]
          let y = v[1] * scale[1]
          let z = v[2] * scale[2]

          let y1 = y * cx - z * sx
          let z1 = y * sx + z * cx
          y = y1
          z = z1

          let x1 = x * cz - y * sz
          let y2 = x * sz + y * cz
          x = x1
          y = y2

          let x2 = x * cy - z * sy
          let z2 = x * sy + z * cy
          x = x2
          z = z2

          return [x + translate[0], y + translate[1], z + translate[2]] as Vec3
        }) as [Vec3, Vec3, Vec3],
      }))
    }

    const createCharacter = (y: number, zCenter: number): (Triangle & { layer: number })[] => {
      const charTriangles: (Triangle & { layer: number })[] = []
      const charColor: Vec3 = [225, 29, 72]
      const skinColor: Vec3 = [252, 211, 161]
      const pantsColor: Vec3 = [30, 64, 175]
      const shoeColor: Vec3 = [255, 255, 255]

      const unitSphere = createSphere([0, 0, 0], 1, charColor, false, 8, 12)
      const unitSkin = createSphere([0, 0, 0], 1, skinColor, false, 8, 12)
      const unitPants = createSphere([0, 0, 0], 1, pantsColor, false, 8, 12)
      const unitShoe = createSphere([0, 0, 0], 1, shoeColor, false, 6, 8)

      const bY = y + 10.5
      const s = 1.6

      charTriangles.push(
        ...transformTriangles(
          unitShoe,
          [0, bY + 3 * s, zCenter + 18],
          [6 * s, 3 * s, 11 * s],
          0,
          0,
          0,
        ).map((t) => ({ ...t, layer: 2 })),
      )
      charTriangles.push(
        ...transformTriangles(
          unitShoe,
          [0, bY + 3 * s, zCenter - 18],
          [6 * s, 3 * s, 11 * s],
          0,
          0,
          0,
        ).map((t) => ({ ...t, layer: 2 })),
      )
      charTriangles.push(
        ...transformTriangles(
          unitPants,
          [0, bY + 20 * s, zCenter + 18],
          [5 * s, 16 * s, 5 * s],
          0,
          0,
          0.05,
        ).map((t) => ({ ...t, layer: 2 })),
      )
      charTriangles.push(
        ...transformTriangles(
          unitPants,
          [0, bY + 20 * s, zCenter - 18],
          [5 * s, 16 * s, 5 * s],
          0,
          0,
          -0.05,
        ).map((t) => ({ ...t, layer: 2 })),
      )
      charTriangles.push(
        ...transformTriangles(
          unitSphere,
          [0, bY + 46 * s, zCenter],
          [10 * s, 16 * s, 8 * s],
          0,
          0.2,
          0,
        ).map((t) => ({ ...t, layer: 2 })),
      )
      charTriangles.push(
        ...transformTriangles(
          unitSkin,
          [2 * s, bY + 68 * s, zCenter],
          [6 * s, 7 * s, 6 * s],
          0,
          0.2,
          0,
        ).map((t) => ({ ...t, layer: 3 })),
      )
      charTriangles.push(
        ...transformTriangles(
          unitSphere,
          [0, bY + 48 * s, zCenter + 12 * s],
          [3.5 * s, 14 * s, 3.5 * s],
          0,
          0.2,
          0.3,
        ).map((t) => ({ ...t, layer: 2 })),
      )
      charTriangles.push(
        ...transformTriangles(
          unitSphere,
          [0, bY + 48 * s, zCenter - 12 * s],
          [3.5 * s, 14 * s, 3.5 * s],
          0,
          0.2,
          -0.3,
        ).map((t) => ({ ...t, layer: 2 })),
      )

      return charTriangles
    }

    const createSkateboard = (
      y: number,
      z: number,
      rollAngle: number,
    ): (Triangle & { layer: number })[] => {
      const deckC: Vec3 = [250, 204, 21]
      const deckTriangles: Triangle[] = []

      deckTriangles.push(...createBox([0, 0, 0], [30, 5, 60], deckC))

      const segments = 12
      for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI
        const a2 = ((i + 1) / segments) * Math.PI
        const x1 = Math.cos(a1) * 15
        const z1 = 30 + Math.sin(a1) * 15
        const x2 = Math.cos(a2) * 15
        const z2 = 30 + Math.sin(a2) * 15

        deckTriangles.push({
          vertices: [
            [0, 2.5, 30],
            [x2, 2.5, z2],
            [x1, 2.5, z1],
          ],
          color: deckC,
        })
        deckTriangles.push({
          vertices: [
            [0, -2.5, 30],
            [x1, -2.5, z1],
            [x2, -2.5, z2],
          ],
          color: deckC,
        })
        deckTriangles.push({
          vertices: [
            [x1, -2.5, z1],
            [x2, 2.5, z2],
            [x2, -2.5, z2],
          ],
          color: deckC,
        })
        deckTriangles.push({
          vertices: [
            [x1, -2.5, z1],
            [x1, 2.5, z1],
            [x2, 2.5, z2],
          ],
          color: deckC,
        })

        const a1b = Math.PI + a1
        const a2b = Math.PI + a2
        const x1b = Math.cos(a1b) * 15
        const z1b = -30 + Math.sin(a1b) * 15
        const x2b = Math.cos(a2b) * 15
        const z2b = -30 + Math.sin(a2b) * 15

        deckTriangles.push({
          vertices: [
            [0, 2.5, -30],
            [x2b, 2.5, z2b],
            [x1b, 2.5, z1b],
          ],
          color: deckC,
        })
        deckTriangles.push({
          vertices: [
            [0, -2.5, -30],
            [x1b, -2.5, z1b],
            [x2b, -2.5, z2b],
          ],
          color: deckC,
        })
        deckTriangles.push({
          vertices: [
            [x1b, -2.5, z1b],
            [x2b, 2.5, z2b],
            [x2b, -2.5, z2b],
          ],
          color: deckC,
        })
        deckTriangles.push({
          vertices: [
            [x1b, -2.5, z1b],
            [x1b, 2.5, z1b],
            [x2b, 2.5, z2b],
          ],
          color: deckC,
        })
      }

      const deck = deckTriangles.map((t) => ({ ...t, layer: 1 }))

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
      // Analog magnitude: 0 no teclado/joystick parado, 0..1 no joystick.
      // Usa os valores analógicos quando presentes; caso contrário (teclado),
      // velocidade total com ligar/desligar instantâneo.
      const analogMag = Math.hypot(inputState.analogX, inputState.analogY)
      const usingAnalog = analogMag > 0

      // Rotation com inércia: o input define uma velocidade angular alvo.
      // Ao pressionar, a velocidade acelera gradualmente até o alvo; ao
      // soltar (alvo = 0), decai com fricção — drift suave ~0.5-1s.
      let targetAngularVel = 0
      if (usingAnalog) {
        if (Math.abs(inputState.analogX) > 0.1) {
          targetAngularVel = -Math.sign(inputState.analogX) * ROT_SPEED
        }
      } else {
        if (inputState.a) targetAngularVel += ROT_SPEED
        if (inputState.d) targetAngularVel -= ROT_SPEED
      }

      if (targetAngularVel !== 0) {
        // Acelera em direção à velocidade alvo (resposta gradual ao girar).
        angularVelocity += (targetAngularVel - angularVelocity) * ANGULAR_ACCEL
      } else {
        // Sem input: fricção/damping — desacelera suavemente até parar.
        angularVelocity *= ANGULAR_FRICTION
        if (Math.abs(angularVelocity) < ANGULAR_DEADZONE) angularVelocity = 0
      }

      worldAngle += angularVelocity

      // Movement (Inverted vertical movement)
      // No joystick, a velocidade é proporcional à magnitude do vetor analógico;
      // analogY negativo = frente (w), positivo = trás (s).
      const speedScale = usingAnalog ? Math.min(analogMag, 1) : 1
      const moveX = Math.sin(-worldAngle) * SPEED * speedScale
      const moveZ = Math.cos(-worldAngle) * SPEED * speedScale

      if (usingAnalog) {
        // Frente/trás controlados pelo analogY (negativo = frente)
        worldX += moveX * Math.sign(-inputState.analogY)
        worldZ += moveZ * Math.sign(-inputState.analogY)
      } else {
        if (inputState.w) {
          worldX += moveX
          worldZ += moveZ
        }
        if (inputState.s) {
          worldX -= moveX
          worldZ -= moveZ
        }
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

      // Escolhe o contexto de render: offscreen 2x (AA ligado) ou display (AA desligado).
      // A resolução lógica (projeção, FOCAL) continua usando width/height reais.
      const useAA = antialiasingRef.current
      const target = useAA ? offCtx! : ctx
      const scale = useAA ? 2 : 1

      target.setTransform(scale, 0, 0, scale, 0, 0)
      target.clearRect(0, 0, width, height)

      // Skybox Background
      const gradient = target.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, '#1E3A8A')
      gradient.addColorStop(1, '#F97316')
      target.fillStyle = gradient
      target.fillRect(0, 0, width, height)

      // World-Fixed Sun (Infinite Distance)
      const pxSun = 0
      const pzSun = 15000
      const pySun = 0
      const tSun = transform([pxSun, pySun, pzSun], true)

      if (tSun[2] > 10) {
        const sx = tSun[0] * (FOCAL / tSun[2]) + width / 2
        const sy = -tSun[1] * (FOCAL / tSun[2]) + height / 2
        const sunRadius = 180

        target.fillStyle = '#FDE047'
        target.beginPath()
        target.arc(sx, sy, sunRadius, Math.PI, 0)
        target.fill()
      }

      const triangles: Triangle[] = []
      const TILE_SIZE = 1000

      // Floor Grid (Circular boundary) — dois triângulos por tile, em loop único.
      const groundColor: Vec3 = [105, 105, 105]
      for (let c = -8; c <= 8; c++) {
        for (let r = -8; r <= 8; r++) {
          const x = c * TILE_SIZE - (worldX % TILE_SIZE)
          const z = r * TILE_SIZE - (worldZ % TILE_SIZE)
          if (Math.hypot(x + TILE_SIZE / 2, z + TILE_SIZE / 2) > HORIZON_RADIUS) continue

          triangles.push(
            {
              vertices: [
                [x, 0, z],
                [x + TILE_SIZE, 0, z],
                [x + TILE_SIZE, 0, z + TILE_SIZE],
              ],
              color: groundColor,
              isWorld: true,
              isGround: true,
            },
            {
              vertices: [
                [x, 0, z],
                [x + TILE_SIZE, 0, z + TILE_SIZE],
                [x, 0, z + TILE_SIZE],
              ],
              color: groundColor,
              isWorld: true,
              isGround: true,
            },
          )
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
            createBox([px, 30, pz], [60, 60, 60], p.color).forEach((t) => {
              triangles.push({ ...t, isWorld: true })
            })
          } else {
            createRamp([px, 40, pz], [120, 80, 160], p.color).forEach((t) => {
              triangles.push({ ...t, isWorld: true })
            })
          }
        }
      })

      // Skater
      createSkateboard(playerY, PLAYER_Z, boardAngle).forEach((t) => {
        triangles.push({ ...t, isWorld: false } as any)
      })
      createCharacter(playerY, PLAYER_Z).forEach((t) => {
        triangles.push({ ...t, isWorld: false } as any)
      })

      // Projection, shading, sort & render — delegado ao helper puro.
      renderTriangles(target, triangles, width, height, worldAngle, FOCAL, transform, lightDir)

      // Supersampling: desenha o offscreen (2x) no canvas de display (1x) com suavização.
      if (useAA) {
        target.setTransform(1, 0, 0, 1, 0, 0)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(offscreen, 0, 0, width, height)
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
