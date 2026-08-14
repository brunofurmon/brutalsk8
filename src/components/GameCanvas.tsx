import { useEffect, useRef } from 'react'
import { Vec3, sub, cross, dot, normalize } from '@/lib/math3d'
import { Triangle, createMiniRamp } from '@/lib/geometry'
import { inputState, consumeTrick } from '@/lib/input'

export type TrickId = 'flip' | 'grab' | 'grind' | 'lip' | '360flip' | 'fsflip'

export interface TrickDef {
  id: TrickId
  label: string
  points: number
}

export const TRICK_DEFS: TrickDef[] = [
  { id: 'flip', label: 'Kickflip', points: 100 },
  { id: 'grab', label: 'Grab', points: 120 },
  { id: 'grind', label: 'Grind', points: 150 },
  { id: 'lip', label: 'Lip Trick', points: 180 },
  { id: '360flip', label: '360 Flip', points: 220 },
  { id: 'fsflip', label: 'FS Flip', points: 200 },
]

export type GameState = {
  score: number
  /** Manobras já concluídas pelo menos uma vez (id -> true). */
  completed: Record<string, boolean>
  /** Mensagem flutuante da última manobra (para o HUD). */
  lastTrick: { id: TrickId; label: string; points: number } | null
  /** Quantas vezes cada manobra foi feita. */
  counts: Record<string, number>
}

type Vertex = { pos: Vec3 }

const clipPolygon = (vertices: Vertex[], minZ: number): Vertex[] => {
  const result: Vertex[] = []
  for (let i = 0; i < vertices.length; i++) {
    const v1 = vertices[i]
    const v2 = vertices[(i + 1) % vertices.length]
    const d1 = v1.pos[2] - minZ
    const d2 = v2.pos[2] - minZ
    if (d1 >= 0) result.push(v1)
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
}

const renderTriangles = (
  ctx: CanvasRenderingContext2D,
  triangles: Triangle[],
  width: number,
  height: number,
  FOCAL: number,
  transform: (v: Vec3) => Vec3,
  lightDir: Vec3,
) => {
  const projected: ProjectedPoly[] = []
  for (const t of triangles) {
    const v0 = t.vertices[0],
      v1 = t.vertices[1],
      v2 = t.vertices[2]
    const normal = normalize(cross(sub(v1, v0), sub(v2, v0)))

    const tv0 = transform(v0)
    const tv1 = transform(v1)
    const tv2 = transform(v2)

    const clipped = clipPolygon([{ pos: tv0 }, { pos: tv1 }, { pos: tv2 }], 10)
    if (clipped.length < 3) continue

    const pts = clipped.map((v) => [
      v.pos[0] * (FOCAL / v.pos[2]) + width / 2,
      -v.pos[1] * (FOCAL / v.pos[2]) + height / 2,
    ])
    const zAvg = clipped.reduce((sum, v) => sum + v.pos[2], 0) / clipped.length
    projected.push({ pts, color: t.color, zAvg, normal })
  }

  projected.sort((a, b) => b.zAvg - a.zAvg)

  ctx.lineJoin = 'miter'
  for (const p of projected) {
    const intensity = 0.4 + 0.6 * Math.max(0, dot(p.normal, lightDir))
    const r = Math.floor(p.color[0] * intensity)
    const g = Math.floor(p.color[1] * intensity)
    const b = Math.floor(p.color[2] * intensity)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.strokeStyle = `rgb(${Math.max(0, r - 12)},${Math.max(0, g - 12)},${Math.max(0, b - 12)})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(p.pts[0][0], p.pts[0][1])
    for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0], p.pts[i][1])
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}

// ---------------------------------------------------------------------------
// Sprite do skatista (canvas 2D, perfil). Fica sempre de frente para a câmera
// por billboarding (drawn as a screen-space image at the projected position).
// ---------------------------------------------------------------------------

type Pose = 'idle' | 'flip' | 'grab' | 'grind' | 'lip'

function drawSkater(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  flipRotation: number,
  grabT: number,
) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.translate(w / 2, h * 0.86)
  ctx.rotate(flipRotation)

  const shirt = '#c0312b'
  const shirtDark = '#7f1d1d'
  const pantsDark = '#1e293b'
  const shoe = '#111827'
  const skin = '#e8b88f'
  const skinDark = '#b5825a'
  const hair = '#1c1917'
  const cap = '#0ea5e9'
  const board = '#f5c518'
  const boardDark = '#a16207'
  const grip = '#1f2937'
  const wheel = '#e5e7eb'
  const truck = '#9ca3af'

  // --- Shape (skate) com grip, trucks e rodas ---
  const drawBoard = (lift = 0) => {
    ctx.save()
    ctx.translate(0, -lift)
    ctx.fillStyle = board
    ctx.strokeStyle = boardDark
    ctx.lineWidth = 2
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(-34, -6, 68, 8, 4)
    else ctx.rect(-34, -6, 68, 8)
    ctx.fill()
    ctx.stroke()
    // grip tape (faixa escura no topo do shape)
    ctx.fillStyle = grip
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(-34, -6, 68, 3, 2)
    else ctx.rect(-34, -6, 68, 3)
    ctx.fill()
    // trucks + rodas
    ctx.fillStyle = truck
    ctx.fillRect(-22, -1, 8, 3)
    ctx.fillRect(14, -1, 8, 3)
    ctx.fillStyle = wheel
    for (const wx of [-22, 22]) {
      ctx.beginPath()
      ctx.arc(wx, 2, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // --- Perna (calça) com joelho flexionado ---
  const leg = (hipX: number, kneeX: number, footX: number, hipY = -58, footY = -8) => {
    ctx.strokeStyle = pantsDark
    ctx.lineWidth = 11
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(hipX, hipY)
    ctx.lineTo(kneeX, (hipY + footY) / 2)
    ctx.lineTo(footX, footY)
    ctx.stroke()
    // sapato
    ctx.fillStyle = shoe
    ctx.beginPath()
    ctx.ellipse(footX + 5, footY, 10, 5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Braço (camisa) em dois segmentos + mão ---
  const arm = (sx: number, sy: number, ex: number, ey: number, mx: number, my: number) => {
    ctx.strokeStyle = shirtDark
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(mx, my)
    ctx.lineTo(ex, ey)
    ctx.stroke()
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.arc(ex, ey, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Pernas + shape por pose
  if (pose === 'grind') {
    leg(-10, -2, -22)
    leg(10, 14, 24)
    drawBoard(0)
  } else if (pose === 'lip') {
    leg(-8, -6, -16)
    leg(10, 8, 20)
    drawBoard(0)
  } else if (pose === 'grab') {
    leg(-9, -16, -16)
    leg(9, 18, 18)
    drawBoard(grabT * 8)
  } else {
    leg(-10, -6, -18)
    leg(10, 8, 22)
    drawBoard(0)
  }

  // --- Tronco (camisa) — leve cônico dos ombros ao quadril ---
  ctx.fillStyle = shirt
  ctx.strokeStyle = shirtDark
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-12, -58)
  ctx.lineTo(12, -58)
  ctx.lineTo(15, -92)
  ctx.lineTo(-15, -92)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // --- Braços por pose ---
  const shoulderY = -88
  if (pose === 'grab') {
    arm(-11, shoulderY, -2, -14, -6, -50) // mão ao shape
    arm(11, shoulderY, 10, -60, 12, -74) // braço livre estendido
  } else if (pose === 'lip') {
    arm(-11, shoulderY, -18, -120, -16, -104)
    arm(11, shoulderY, 14, -76, 12, -82)
  } else if (pose === 'grind') {
    arm(11, shoulderY, 2, -16, 6, -50) // mão ao shape (equilíbrio)
    arm(-11, shoulderY, -24, -70, -20, -58)
  } else {
    arm(-11, shoulderY, -22, -52, -18, -68)
    arm(11, shoulderY, 22, -54, 18, -70)
  }

  // --- Cabeça ---
  ctx.fillStyle = skin
  ctx.strokeStyle = skinDark
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(1, -104, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // boné
  ctx.fillStyle = cap
  ctx.beginPath()
  ctx.arc(1, -106, 11, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(1, -107, 14, 4) // aba do boné
  // cabelo na nuca
  ctx.fillStyle = hair
  ctx.fillRect(-10, -104, 5, 5)
  // olho
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.arc(8, -103, 1.6, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function GameCanvas({
  antialiasing = true,
  onState,
  onFps,
}: {
  antialiasing?: boolean
  onState?: (s: GameState) => void
  onFps?: (fps: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const antialiasingRef = useRef(antialiasing)
  antialiasingRef.current = antialiasing
  const onStateRef = useRef(onState)
  onStateRef.current = onState
  const onFpsRef = useRef(onFps)
  onFpsRef.current = onFps

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

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

    // --- Sprite offscreen (skatista 2D, billboard) ---
    const SPRITE_W = 220
    const SPRITE_H = 260
    const sprite = document.createElement('canvas')
    sprite.width = SPRITE_W
    sprite.height = SPRITE_H
    const spriteCtx = sprite.getContext('2d')!

    // --- Geometria estática do mundo ---
    const RAMP = {
      width: 700,
      depth: 520,
      transitionDepth: 180,
      height: 120,
      radius: 120,
      segments: 16,
    }
    const FLAT_DEPTH = RAMP.depth - 2 * RAMP.transitionDepth // 160
    const HALF_FLAT = FLAT_DEPTH / 2 // 80
    const ARC_LEN = RAMP.radius * (Math.PI / 2) // comprimento de arco da transição
    const HALF_LEN = HALF_FLAT + ARC_LEN // distância do centro ao coping
    const COPING_Y = RAMP.height
    const COPING_Z_POS = HALF_FLAT + RAMP.radius // +Z coping (z no topo)
    const COPING_Z_NEG = -COPING_Z_POS

    const rampTris = createMiniRamp(RAMP)

    // Chão de concreto ao redor da rampa.
    const GROUND = 4000
    const groundColor: Vec3 = [140, 140, 140]
    const groundTris: Triangle[] = [
      {
        vertices: [
          [-GROUND, 0, GROUND],
          [GROUND, 0, GROUND],
          [GROUND, 0, -GROUND],
        ],
        color: groundColor,
      },
      {
        vertices: [
          [-GROUND, 0, GROUND],
          [GROUND, 0, -GROUND],
          [-GROUND, 0, -GROUND],
        ],
        color: groundColor,
      },
    ]

    // --- Câmera fixa LATERAL (olha ao longo de +X) ---
    // A mini-ramp tem suas transições em ±Z; ao olhar ao longo de X vemos o
    // perfil em "U" de lado, com o skatista oscilando horizontalmente na tela.
    const FOCAL = 520
    const CAM: Vec3 = [-460, 170, 0]
    const CAM_PITCH = 0.16
    const lightDir = normalize([0.45, 0.85, 0.35])

    const transform = (v: Vec3): Vec3 => {
      // Tela horizontal = Z (mundo), profundidade = X (mundo), vertical = Y.
      const dx = v[2] - CAM[2]
      const dy = v[1] - CAM[1]
      const dz = v[0] - CAM[0]
      const cy = Math.cos(CAM_PITCH),
        sy = Math.sin(CAM_PITCH)
      return [dx, dy * cy - dz * sy, dy * sy + dz * cy]
    }

    /**
     * Posição (y,z) do skatista na superfície da rampa dado um coordenada
     * longitudinal p em [-HALF_LEN, HALF_LEN] (0 = centro do flat, ±HALF_LEN =
     * copings). y = altura, z = profundidade.
     */
    const rampSurface = (p: number): { y: number; z: number } => {
      const ap = Math.abs(p)
      if (ap <= HALF_FLAT) {
        return { y: 0, z: p }
      }
      const d = ap - HALF_FLAT // distância ao longo do arco desde a borda do flat
      const theta = (d / ARC_LEN) * (Math.PI / 2) // 0..PI/2
      const y = RAMP.radius * (1 - Math.cos(theta))
      const z = Math.sign(p) * (HALF_FLAT + RAMP.radius * Math.sin(theta))
      return { y, z }
    }

    // --- Estado do jogo ---
    const state: GameState = {
      score: 0,
      completed: {},
      lastTrick: null,
      counts: {},
    }
    const pushState = () => {
      onStateRef.current?.({
        score: state.score,
        completed: { ...state.completed },
        lastTrick: state.lastTrick,
        counts: { ...state.counts },
      })
    }

    const completeTrick = (id: TrickId) => {
      const def = TRICK_DEFS.find((t) => t.id === id)!
      const firstTime = !state.completed[id]
      state.completed[id] = true
      state.counts[id] = (state.counts[id] ?? 0) + 1
      let pts = def.points
      if (!firstTime) pts = Math.round(pts * 0.5)
      state.score += pts
      state.lastTrick = { id, label: def.label, points: pts }
      // Bônus por completar todas as manobras da lista.
      if (TRICK_DEFS.every((t) => state.completed[t.id])) {
        const bonus = 1000
        state.score += bonus
        state.lastTrick = {
          id,
          label: `${def.label} + SET COMPLETO!`,
          points: pts + bonus,
        }
        // reset para permitir repetir o set (arcade).
        state.completed = {}
      }
      pushState()
    }

    // --- Física do personagem (auto pumping na rampa) ---
    let playerX = 0
    // Coordenada longitudinal p; o skatista oscila entre -HALF_LEN e +HALF_LEN.
    let p = 0
    let vp = 4.2 // velocidade longitudinal (unidades/frame)
    let pDir: 1 | -1 = 1

    // Estado de vôo (ao sair da rampa pelo coping).
    type AirState = {
      active: boolean
      x: number
      y: number
      z: number
      vy: number
      gravity: number
      // lado de onde saiu (+1 = +Z, -1 = -Z)
      side: 1 | -1
      pose: Pose
      poseT: number
      flipRotation: number
      flipTarget: number
      grabT: number
      flipCount: number
      didGrab: boolean
      didLip: boolean
    }
    const air: AirState = {
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vy: 0,
      gravity: 1.0,
      side: 1,
      pose: 'idle',
      poseT: 0,
      flipRotation: 0,
      flipTarget: 0,
      grabT: 0,
      flipCount: 0,
      didGrab: false,
      didLip: false,
    }

    // Grind/lip no coping.
    let grinding = false
    let grindT = 0

    const startAir = (side: 1 | -1) => {
      air.active = true
      air.x = playerX
      air.y = COPING_Y
      air.z = side > 0 ? COPING_Z_POS : COPING_Z_NEG
      air.vy = 24
      air.gravity = 1.0
      air.side = side
      air.pose = 'idle'
      air.poseT = 0
      air.flipRotation = 0
      air.flipTarget = 0
      air.grabT = 0
      air.flipCount = 0
      air.didGrab = false
      air.didLip = false
    }

    const landAir = () => {
      // Aterrissa sempre (arcade): volta ao coping de onde saiu e continua
      // pumping na direção oposta (descendo a transição).
      air.active = false
      p = air.side > 0 ? HALF_LEN : -HALF_LEN
      pDir = (air.side > 0 ? -1 : 1) as 1 | -1
      vp = 4.2
      grinding = false
      grindT = 0
    }

    // --- Loop de jogo limitado a 30 FPS (metade da velocidade original) ---
    const TARGET_FPS = 30
    const FRAME_MS = 1000 / TARGET_FPS
    let lastFrame = performance.now()
    let fpsFrames = 0
    let fpsLastReport = performance.now()

    let animationId: number
    const loop = (now: number) => {
      animationId = requestAnimationFrame(loop)
      const elapsed = now - lastFrame
      if (elapsed < FRAME_MS) return
      // mantém o restante para não acumular drift
      lastFrame = now - (elapsed % FRAME_MS)

      // --- Input lateral (A/D ou joystick analógico) ---
      const analogMag = Math.abs(inputState.analogX)
      const usingAnalog = analogMag > 0.08
      let lateral = 0
      if (usingAnalog) {
        lateral = inputState.analogX
      } else {
        if (inputState.a) lateral -= 1
        if (inputState.d) lateral += 1
      }
      const LATERAL_SPEED = 6
      const halfW = RAMP.width / 2 - 30
      playerX += lateral * LATERAL_SPEED
      if (playerX < -halfW) playerX = -halfW
      if (playerX > halfW) playerX = halfW

      // --- Atualização física ---
      if (air.active) {
        air.vy -= air.gravity
        air.y += air.vy

        // Flip rotation anima em direção ao alvo.
        if (air.flipTarget !== 0) {
          const remaining = air.flipTarget - air.flipRotation
          if (Math.abs(remaining) > 0.04) {
            air.flipRotation += remaining * 0.18
          } else {
            air.flipRotation = air.flipTarget
          }
        }
        if (air.pose === 'grab') air.grabT = Math.min(1, air.grabT + 0.1)

        // Manobras aéreas (edge-triggered).
        if (consumeTrick('space')) {
          air.flipCount += 1
          air.flipTarget += Math.PI * 2
          if (air.flipCount === 1) {
            air.pose = 'flip'
            air.poseT = 0
            completeTrick('flip')
          } else if (air.flipCount === 2) {
            completeTrick('360flip')
          } else {
            completeTrick('fsflip')
          }
        }
        if (consumeTrick('g') && !air.didGrab) {
          air.didGrab = true
          air.pose = 'grab'
          air.grabT = 0
          completeTrick('grab')
        }
        if (consumeTrick('l') && !air.didLip) {
          // Lip trick só vale se estiver alto (próximo ao ápice/copING).
          if (air.y > COPING_Y - 10) {
            air.didLip = true
            air.pose = 'lip'
            air.poseT = 0
            completeTrick('lip')
          }
        }

        // Pose temporária volta ao idle após algum tempo.
        air.poseT += 1
        if ((air.pose === 'flip' || air.pose === 'lip') && air.poseT > 26 && air.y < COPING_Y + 8) {
          air.pose = 'idle'
        }

        // Aterrissa quando desce de volta à altura do coping.
        if (air.vy < 0 && air.y <= COPING_Y) {
          landAir()
        }
      } else {
        // Pumping: avança longitudinalmente.
        if (!grinding) {
          p += pDir * vp
          // Ao atingir o coping, sai da rampa (vôo).
          if (p >= HALF_LEN) {
            p = HALF_LEN
            startAir(1)
          } else if (p <= -HALF_LEN) {
            p = -HALF_LEN
            startAir(-1)
          }
        }

        // Grind: K ao passar perto do coping.
        const surf = rampSurface(p)
        const nearCoping = surf.y > COPING_Y - 25 && Math.abs(p) > HALF_LEN - 30
        if (consumeTrick('k') && nearCoping && !grinding) {
          grinding = true
          grindT = 0
          completeTrick('grind')
        }
        if (grinding) {
          grindT += 1
          // Grind trava no topo por alguns frames; depois solta em vôo.
          if (grindT > 50) {
            grinding = false
            startAir(p > 0 ? 1 : -1)
          }
        }
      }

      // --- Pose atual para o sprite ---
      let pose: Pose = 'idle'
      let flipRot = 0
      let grabT = 0
      if (air.active) {
        pose = air.pose
        flipRot = air.flipRotation
        grabT = air.grabT
      } else if (grinding) {
        pose = 'grind'
      }
      drawSkater(spriteCtx, pose, flipRot, grabT)

      // --- Render ---
      const useAA = antialiasingRef.current
      const target = useAA ? offCtx! : ctx
      const scale = useAA ? 2 : 1
      target.setTransform(scale, 0, 0, scale, 0, 0)
      target.clearRect(0, 0, width, height)

      // Céu (gradiente pôr do sol) — mantido.
      const gradient = target.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, '#1E3A8A')
      gradient.addColorStop(1, '#F97316')
      target.fillStyle = gradient
      target.fillRect(0, 0, width, height)

      // Sol 3D fixo no horizonte (à frente da câmera lateral, +X) — mantido.
      const sunPos: Vec3 = [15000, 0, 0]
      const tSun = transform(sunPos)
      if (tSun[2] > 10) {
        const sx = tSun[0] * (FOCAL / tSun[2]) + width / 2
        const sy = -tSun[1] * (FOCAL / tSun[2]) + height / 2
        const sunRadius = 180
        target.fillStyle = '#FDE047'
        target.beginPath()
        target.arc(sx, sy, sunRadius, Math.PI, 0)
        target.fill()
      }

      // Triângulos do mundo (chão + rampa).
      const tris: Triangle[] = []
      for (const t of groundTris) tris.push(t)
      for (const t of rampTris) tris.push(t)
      renderTriangles(target, tris, width, height, FOCAL, transform, lightDir)

      // --- Posição atual do skatista ---
      let py: number, pz: number
      if (air.active) {
        py = air.y
        pz = air.z
      } else {
        const surf = rampSurface(p)
        py = surf.y
        pz = surf.z
      }

      // Sombra projetada no chão (arcade).
      {
        const shadowCenter: Vec3 = [playerX, 1, pz]
        const tsh = transform(shadowCenter)
        if (tsh[2] > 10) {
          const ssx = tsh[0] * (FOCAL / tsh[2]) + width / 2
          const ssy = -tsh[1] * (FOCAL / tsh[2]) + height / 2
          const shrink = Math.max(0.4, 1 - Math.min(1, py / (COPING_Y * 1.6)))
          const rw = ((60 * FOCAL) / tsh[2]) * shrink
          const rh = ((18 * FOCAL) / tsh[2]) * shrink
          target.save()
          target.globalAlpha = 0.3 * shrink
          target.fillStyle = '#000'
          target.beginPath()
          target.ellipse(ssx, ssy, rw, rh, 0, 0, Math.PI * 2)
          target.fill()
          target.restore()
        }
      }

      // --- Billboard do sprite ---
      const center: Vec3 = [playerX, py + 48, pz]
      const tc = transform(center)
      if (tc[2] > 10) {
        const sx = tc[0] * (FOCAL / tc[2]) + width / 2
        const sy = -tc[1] * (FOCAL / tc[2]) + height / 2
        const drawW = (SPRITE_W * FOCAL) / tc[2]
        const drawH = (SPRITE_H * FOCAL) / tc[2]
        target.save()
        target.imageSmoothingEnabled = true
        target.imageSmoothingQuality = 'high'
        target.drawImage(sprite, sx - drawW / 2, sy - drawH, drawW, drawH)
        target.restore()
      }

      // Supersampling: desenha offscreen 2x no display 1x.
      if (useAA) {
        target.setTransform(1, 0, 0, 1, 0, 0)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(offscreen, 0, 0, width, height)
      }

      // --- Contador de FPS ---
      fpsFrames++
      if (now - fpsLastReport >= 500) {
        const fps = Math.round((fpsFrames * 1000) / (now - fpsLastReport))
        onFpsRef.current?.(fps)
        fpsFrames = 0
        fpsLastReport = now
      }
    }

    pushState()
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
