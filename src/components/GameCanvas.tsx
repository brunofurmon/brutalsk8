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

export interface SkaterMotionState {
  pose: Pose
  flipRotation: number
  grabT: number
  crouch: number // 0 = ereto/estendido, 1 = agachado em pumping/aterrissagem
  surfaceAngle: number // inclinação da rampa em radianos (-PI/2 .. +PI/2)
  balanceArm: number // oscilação dinâmica dos braços para equilíbrio (-1 .. 1)
  isAir: boolean
  isLanding: boolean
  facing: 1 | -1 // +1 = olhando/andando para a direita na tela (+Z), -1 = para a esquerda (-Z)
}

// Dimensões do canvas do sprite e posição do pivô de contato (skate no chão).
// PIVOT_Y em 220 deixa 100px de margem inferior para que rotações de até 90° e manobras
// nunca sejam cortadas pelas bordas do canvas offscreen.
const SPRITE_W = 320
const SPRITE_H = 320
const PIVOT_X = SPRITE_W / 2 // 160
const PIVOT_Y = 220

function drawSkater(ctx: CanvasRenderingContext2D, motion: SkaterMotionState) {
  const { pose, flipRotation, grabT, crouch, surfaceAngle, balanceArm, facing } = motion

  const w = ctx.canvas.width
  const h = ctx.canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.save()

  // Ponto de base do contato do skate com o chão.
  // As rodas são desenhadas centralizadas em y = 2 com raio 4, alcançando y = +6 no espaço local.
  // Transladamos para o pivô centralizado verticalmente (PIVOT_X, PIVOT_Y), deixando ampla margem
  // inferior para acomodar as pontas do shape e rodas inclinadas na rampa sem clipping.
  ctx.translate(PIVOT_X, PIVOT_Y)

  // Espelhamento horizontal conforme a direção que o skatista está olhando (facing)
  if (facing < 0) {
    ctx.scale(-1, 1)
  }

  // Rotação em torno do ponto de contato das rodas com a superfície (h - 4).
  // No espaço local pós-translação (0, 0), as rodas tocam em y = 0 se subirmos o skate 6px.
  // Note: quando ctx.scale(-1, 1) está ativo, rotações positivas giram anti-horário no espaço da tela.
  // Multiplicamos pelo facing para que a inclinação do mundo na tela (surfaceAngle)
  // permaneça sempre idêntica independentemente de estar olhando para a direita ou para a esquerda.
  const totalRotation = flipRotation + surfaceAngle * facing
  ctx.rotate(totalRotation)

  // Desloca o skatista para cima pelo raio inferior das rodas (6px),
  // garantindo que a base das rodas fique exatamente sobre o pivô de contato (0, 0)
  ctx.translate(0, -6)
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

  // --- Perna (calça) com articulação e sapato ---
  const leg = (
    hipX: number,
    kneeX: number,
    footX: number,
    hipY: number,
    kneeY: number,
    footY = -8,
  ) => {
    ctx.strokeStyle = pantsDark
    ctx.lineWidth = 11
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(hipX, hipY)
    ctx.lineTo(kneeX, kneeY)
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

  // Alturas dinâmicas do corpo de acordo com crouch (0 = estendido, 1 = muito agachado)
  // crouch = 0 => quadril em -60, ombros em -94, cabeça em -106
  // crouch = 1 => quadril em -40, ombros em -70, cabeça em -82
  const crouchOffset = crouch * 20
  const hipY = -60 + crouchOffset
  const kneeY = -28 + crouchOffset * 0.75
  const shoulderY = -94 + crouchOffset
  const headY = -106 + crouchOffset

  // Pernas + shape por pose / movimentação
  if (pose === 'grind') {
    leg(-10, -2, -22, -54, -28)
    leg(10, 14, 24, -54, -28)
    drawBoard(0)
  } else if (pose === 'lip') {
    leg(-8, -6, -16, -56, -30)
    leg(10, 8, 20, -56, -30)
    drawBoard(0)
  } else if (pose === 'grab') {
    leg(-9, -16, -16, -42, -24)
    leg(9, 18, 18, -42, -24)
    drawBoard(grabT * 8)
  } else {
    // Na rampa (pumping/flat/aterrissagem/idle):
    // Joelhos flexionam e abrem proporcionalmente ao crouch
    const kneeBend = crouch * 5
    leg(-10, -10 - kneeBend, -20, hipY, kneeY)
    leg(10, 10 + kneeBend, 22, hipY, kneeY)
    drawBoard(0)
  }

  // --- Tronco (camisa) ---
  ctx.fillStyle = shirt
  ctx.strokeStyle = shirtDark
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-12, hipY)
  ctx.lineTo(12, hipY)
  ctx.lineTo(15, shoulderY - 4)
  ctx.lineTo(-15, shoulderY - 4)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // --- Braços (equilíbrio reativo na rampa e poses) ---
  if (pose === 'grab') {
    arm(-11, shoulderY, -2, -14, -6, -50 + crouchOffset * 0.5) // mão ao shape
    arm(11, shoulderY, 10, -60 + crouchOffset, 12, -74 + crouchOffset) // braço livre
  } else if (pose === 'lip') {
    arm(-11, shoulderY, -18, -120 + crouchOffset, -16, -104 + crouchOffset)
    arm(11, shoulderY, 14, -76 + crouchOffset, 12, -82 + crouchOffset)
  } else if (pose === 'grind') {
    arm(11, shoulderY, 2, -16, 6, -50) // mão para baixo equilíbrio
    arm(-11, shoulderY, -24, -70, -20, -58)
  } else {
    // Equilíbrio dinâmico dos braços durante o trajeto na rampa:
    // Na subida e descida, os braços se abrem para contrabalançar;
    // Ao agachar, os braços se projetam para manter o centro de gravidade
    const armWave = balanceArm * 12
    const crouchArmOut = crouch * 10

    // Braço esquerdo (trás)
    const leftArmEndX = -24 - crouchArmOut - armWave * 0.5
    const leftArmEndY = shoulderY + 34 - armWave
    const leftArmMidX = -18 - crouchArmOut * 0.7
    const leftArmMidY = shoulderY + 18 - armWave * 0.4
    arm(-11, shoulderY, leftArmEndX, leftArmEndY, leftArmMidX, leftArmMidY)

    // Braço direito (frente)
    const rightArmEndX = 24 + crouchArmOut + armWave * 0.5
    const rightArmEndY = shoulderY + 32 + armWave
    const rightArmMidX = 18 + crouchArmOut * 0.7
    const rightArmMidY = shoulderY + 16 + armWave * 0.4
    arm(11, shoulderY, rightArmEndX, rightArmEndY, rightArmMidX, rightArmMidY)
  }

  // --- Cabeça ---
  ctx.fillStyle = skin
  ctx.strokeStyle = skinDark
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(1, headY, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  // boné
  ctx.fillStyle = cap
  ctx.beginPath()
  ctx.arc(1, headY - 2, 11, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(1, headY - 3, 14, 4) // aba do boné
  // cabelo na nuca
  ctx.fillStyle = hair
  ctx.fillRect(-10, headY, 5, 5)
  // olho
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.arc(8, headY + 1, 1.6, 0, Math.PI * 2)
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
      omitFrontSideWall: true,
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
     * Posição (y,z) e inclinação (slope angle) do skatista na rampa
     * dado coordenada longitudinal p em [-HALF_LEN, HALF_LEN].
     * slope: inclinação em radianos na rotação 2D do sprite (sentido horário na tela).
     *
     * Sistema de coordenadas da tela:
     * - Câmera olha ao longo de +X (dx = z_mundo - cam_z, screen_x = dx * focal/dist + w/2).
     *   Portanto, +Z no mundo projeta para a DIREITA na tela (screen_x aumenta com Z).
     *   -Z no mundo projeta para a ESQUERDA na tela.
     * - Eixo Y aponta para cima no mundo (screen_y diminui quando Y aumenta).
     * - No contexto 2D (canvas ctx.rotate):
     *   Ângulo positivo gira em sentido HORÁRIO (topo do corpo inclina para a DIREITA / +Z).
     *   Ângulo negativo gira em sentido ANTI-HORÁRIO (topo do corpo inclina para a ESQUERDA / -Z).
     *
     * Na transição da direita (+Z / screen_x > centro):
     * - A rampa sobe para a direita: conforme Z aumenta, Y aumenta.
     * - A normal da rampa aponta para a esquerda/cima (-Z, +Y).
     * - O skatista em cima da rampa (de pé na superfície) tem os pés apoiados na rampa
     *   e o corpo perpendicular à superfície, ou o shape tangente à rampa (subindo para a direita).
     * - Com o shape horizontal inicialmente: o lado direito (+X local do sprite) deve SUBIR e
     *   o topo do corpo (cabeça em -Y local) deve inclinar para a ESQUERDA em relação ao shape,
     *   OU seja, rotação ANTI-HORÁRIA (negativa) na tela:
     *   Ao girar anti-horário (-theta): o ponto (+30, 0) vai para y < 0 (sobe na tela),
     *   o ponto (-30, 0) vai para y > 0 (desce na tela), exatamente acompanhando a rampa!
     *   E a cabeça (0, -100) gira para x < 0 (esquerda na tela), perpendicular à superfície que sobe.
     *
     * Na transição da esquerda (-Z / screen_x < centro):
     * - A rampa sobe para a esquerda: conforme Z diminui, Y aumenta.
     * - Rotação HORÁRIA (+theta): o lado esquerdo (-30, 0) vai para y < 0 (sobe na tela),
     *   acompanhando a subida para a esquerda.
     *
     * Portanto, slope = -Math.sign(p) * theta.
     */
    const rampSurface = (
      p: number,
    ): { y: number; z: number; slope: number; isTransition: boolean } => {
      const ap = Math.abs(p)
      if (ap <= HALF_FLAT) {
        return { y: 0, z: p, slope: 0, isTransition: false }
      }
      const d = ap - HALF_FLAT
      const theta = (d / ARC_LEN) * (Math.PI / 2) // 0..PI/2
      const y = RAMP.radius * (1 - Math.cos(theta))
      const z = Math.sign(p) * (HALF_FLAT + RAMP.radius * Math.sin(theta))
      // Inclinação angular para o sprite 2D:
      // Em +Z (direita da tela), precisa girar no sentido anti-horário (-theta).
      // Em -Z (esquerda da tela), precisa girar no sentido horário (+theta).
      const slope = -Math.sign(p) * theta
      return { y, z, slope, isTransition: true }
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
    // Velocidade de oscilação automática na rampa aumentada em 25% (4.2 * 1.25 = 5.25)
    const AUTO_PUMP_SPEED = 5.25
    let vp = AUTO_PUMP_SPEED // velocidade longitudinal (unidades/frame)
    let pDir: 1 | -1 = 1
    let skaterFacing: 1 | -1 = 1

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

    // Coping state: 'stall' (Lip Trick parado no coping) ou 'grind' (deslizando pelo coping)
    type CopingMode = 'none' | 'stall' | 'grind'
    let copingMode: CopingMode = 'none'
    let copingTimer = 0
    let copingSide: 1 | -1 = 1
    let grindDir: 1 | -1 = 1 // direção do grind ao longo do coping (+1 = +X / direita na tela, -1 = -X / esquerda na tela)
    let grindSpeed = 6.0
    // Buffer temporário para bloquear pulo (ESPAÇO) logo após sair de lip/grind
    let copingExitCooldown = 0

    // Animação de aterrissagem (agachamento elástico ao tocar na rampa)
    let landingTimer = 0
    const LANDING_DURATION = 12 // frames de absorção de impacto

    // Pumping dinâmico
    let currentCrouch = 0.2
    let currentAngle = 0
    let balanceOscillation = 0

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
      // No ar ao sair pelo coping de um lado (ex: subindo para a direita side=+1),
      // mantém a orientação até aterrissar ou reorienta na aterrissagem.
      skaterFacing = side > 0 ? 1 : -1
    }

    const landAir = () => {
      // Aterrissa sempre (arcade): volta ao coping de onde saiu e continua
      // pumping na direção oposta (descendo a transição).
      air.active = false
      p = air.side > 0 ? HALF_LEN : -HALF_LEN
      pDir = (air.side > 0 ? -1 : 1) as 1 | -1
      vp = AUTO_PUMP_SPEED
      copingMode = 'none'
      copingTimer = 0
      landingTimer = LANDING_DURATION // inicia animação de agachamento de aterrissagem
      // Ao aterrissar e descer a rampa, o skatista se move no sentido de pDir
      skaterFacing = pDir
    }

    /**
     * Finaliza manobra de coping (stall ou grind) devolvendo o skatista
     * para a transição/queda da rampa sem saltar no ar.
     */
    const exitCopingToRamp = () => {
      copingMode = 'none'
      copingTimer = 0
      // Coloca o skatista logo abaixo do coping, descendo em direção ao flat
      p = copingSide > 0 ? HALF_LEN - 3 : -HALF_LEN + 3
      pDir = (copingSide > 0 ? -1 : 1) as 1 | -1
      vp = AUTO_PUMP_SPEED
      skaterFacing = pDir
      landingTimer = Math.floor(LANDING_DURATION * 0.75) // amortecimento elástico
      copingExitCooldown = 15 // bloqueia pulo (espaço) nos próximos frames
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

      // Decrementa cooldown de bloqueio de pulo após sair de manobras de coping
      if (copingExitCooldown > 0) copingExitCooldown--

      // --- Leitura de intenção de direção (W/S, ArrowUp/ArrowDown ou joystick vertical) ---
      // CIMA / W / joystick cima = +X (direita na tela vista lateral)
      // BAIXO / S / joystick baixo = -X (esquerda na tela vista lateral)
      const analogMag = Math.abs(inputState.analogY)
      const usingAnalog = analogMag > 0.08
      let lateral = 0
      if (usingAnalog) {
        lateral = inputState.analogY
      } else {
        if (inputState.down) lateral -= 1
        if (inputState.up) lateral += 1
      }
      const hasDirectionInput = Math.abs(lateral) > 0.15
      const dirSign: 1 | -1 = lateral >= 0 ? 1 : -1

      // Deslocamento na rampa (apenas se NÃO estiver em stall parado no coping nem grinding com controle próprio)
      const halfW = RAMP.width / 2 - 30
      if (copingMode === 'none') {
        // Velocidade de deslocamento na rampa aumentada em 25% (6 * 1.25 = 7.5)
        const LATERAL_SPEED = 7.5
        playerX += lateral * LATERAL_SPEED
        if (playerX < -halfW) playerX = -halfW
        if (playerX > halfW) playerX = halfW
      }

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
          if (copingExitCooldown === 0) {
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
        }
        if (consumeTrick('g') && !air.didGrab) {
          air.didGrab = true
          air.pose = 'grab'
          air.grabT = 0
          completeTrick('grab')
        }

        // Se o usuário apertar K ou L no ar perto do coping, pode prender em stall ou grind no coping!
        const nearCopingAir = air.y >= COPING_Y - 14 && air.y <= COPING_Y + 18
        const pressedTrickK = consumeTrick('k')
        const pressedTrickL = consumeTrick('l')
        if ((pressedTrickK || pressedTrickL) && nearCopingAir) {
          air.active = false
          copingSide = air.side
          p = copingSide > 0 ? HALF_LEN : -HALF_LEN
          if (pressedTrickK && hasDirectionInput) {
            copingMode = 'grind'
            copingTimer = 0
            grindDir = dirSign
            completeTrick('grind')
          } else {
            // Sem direção pressionada (ou pressionou L): Lip Trick parado no coping
            copingMode = 'stall'
            copingTimer = 0
            completeTrick('lip')
          }
        }

        // Pose temporária volta ao idle após algum tempo.
        air.poseT += 1
        if (air.pose === 'flip' && air.poseT > 26 && air.y < COPING_Y + 8) {
          air.pose = 'idle'
        }

        // Aterrissa quando desce de volta à altura do coping.
        if (air.vy < 0 && air.y <= COPING_Y) {
          landAir()
        }
      } else if (copingMode === 'stall') {
        // --- LIP TRICK (STALL NO COPING) ---
        // Skatista fica PARADO no topo do coping em equilíbrio.
        // Espaço não pula durante o stall.
        consumeTrick('space')
        consumeTrick('g')
        copingTimer += 1

        // Se o skatista pressionar K novamente, ou L, ou direção após um curto tempo de stall,
        // ou se o tempo máximo do stall expirar (90 frames = 3 segs):
        const pressKAgain = consumeTrick('k')
        const pressLAgain = consumeTrick('l')

        if (pressKAgain || pressLAgain) {
          if (hasDirectionInput) {
            // Transiciona de stall para grind!
            copingMode = 'grind'
            copingTimer = 0
            grindDir = dirSign
            completeTrick('grind')
          } else {
            // Sai do coping de volta à rampa
            exitCopingToRamp()
          }
        } else if (copingTimer > 15 && hasDirectionInput) {
          // Se inclinar direção durante o stall, inicia grind na direção inclinada
          copingMode = 'grind'
          copingTimer = 0
          grindDir = dirSign
          completeTrick('grind')
        } else if (copingTimer >= 90) {
          // Tempo limite de stall atingido, desce automaticamente para a rampa
          exitCopingToRamp()
        }
      } else if (copingMode === 'grind') {
        // --- GRIND (DESLIZANDO PELO COPING) ---
        // Skatista desliza ao longo do coping em playerX
        consumeTrick('space')
        consumeTrick('g')
        consumeTrick('l')
        copingTimer += 1

        // Desliza ao longo do coping
        playerX += grindDir * grindSpeed

        // Se soltar a direção após o grind engatado, ou se pressionar direção contrária,
        // ou se bater na extremidade do coping (halfW), encerra o grind
        const reachedEdge = Math.abs(playerX) >= halfW - 5
        const releasedDirection = copingTimer > 10 && !hasDirectionInput
        const oppositeDirection = copingTimer > 5 && hasDirectionInput && dirSign !== grindDir
        const pressKToExit = copingTimer > 10 && consumeTrick('k')

        if (
          reachedEdge ||
          releasedDirection ||
          oppositeDirection ||
          pressKToExit ||
          copingTimer > 120
        ) {
          if (reachedEdge) {
            playerX = Math.sign(playerX) * (halfW - 5)
          }
          exitCopingToRamp()
        }
      } else {
        // --- NA RAMPA (PUMPING) ---
        // Pumping: avança longitudinalmente.
        p += pDir * vp
        skaterFacing = pDir

        // Região próxima ao coping na subida
        const surf = rampSurface(p)
        const nearCoping = surf.y > COPING_Y - 24 && Math.abs(p) > HALF_LEN - 32
        const isAscending = (pDir > 0 && p > 0) || (pDir < 0 && p < 0)

        // Se pressionar K ou L na aproximação do coping:
        const pressedK = consumeTrick('k')
        const pressedL = consumeTrick('l')

        if ((pressedK || pressedL) && nearCoping && isAscending) {
          copingSide = p > 0 ? 1 : -1
          p = copingSide > 0 ? HALF_LEN : -HALF_LEN
          if (pressedK && hasDirectionInput) {
            // GRIND: desliza no coping na direção pressionada
            copingMode = 'grind'
            copingTimer = 0
            grindDir = dirSign
            completeTrick('grind')
          } else {
            // LIP TRICK: stall parado no coping
            copingMode = 'stall'
            copingTimer = 0
            completeTrick('lip')
          }
        } else {
          // Ao atingir o coping normalmente (sem manobra de coping engatada), sai da rampa (vôo normal).
          if (p >= HALF_LEN) {
            p = HALF_LEN
            startAir(1)
          } else if (p <= -HALF_LEN) {
            p = -HALF_LEN
            startAir(-1)
          }
        }
      }

      // --- Pose e cinemática do skatista na rampa ---
      let pose: Pose = 'idle'
      let flipRot = 0
      let grabT = 0
      let targetCrouch = 0.25
      let targetAngle = 0

      // Oscilação suave dos braços para equilíbrio
      balanceOscillation += 0.15
      const balanceArmVal = Math.sin(balanceOscillation) * 0.4

      if (air.active) {
        pose = air.pose
        flipRot = air.flipRotation
        grabT = air.grabT

        // No ar: se estiver fazendo manobra, o corpo responde.
        // No topo da parábola estende levemente o corpo (crouch menor)
        if (pose === 'grab') {
          targetCrouch = 0.8
        } else if (pose === 'flip') {
          targetCrouch = 0.5
        } else {
          // Vôo normal: pernas semi-flexionadas no ar, estendendo levemente no ápice
          targetCrouch = air.vy > 0 ? 0.35 : 0.2
        }
        targetAngle = 0
      } else if (copingMode === 'stall') {
        pose = 'lip'
        targetCrouch = 0.6
        // Stall equilibrado perpendicular/levemente apoiado no coping
        targetAngle = (copingSide > 0 ? -1 : 1) * 0.15
        skaterFacing = copingSide > 0 ? 1 : -1
      } else if (copingMode === 'grind') {
        pose = 'grind'
        targetCrouch = 0.55
        targetAngle = (copingSide > 0 ? -1 : 1) * 0.2
        // Na tela lateral, se o skatista desliza para a direita (+X), ele olha para a direita (+1)
        // se desliza para a esquerda (-X), olha para a esquerda (-1)
        skaterFacing = grindDir
      } else {
        // Skatista na rampa:
        // PUMPING real:
        // - Subindo a transição (indo em direção ao coping, velocidade apontando para cima):
        //   skatista agacha (comprime o corpo para bombear velocidade na transição).
        // - Descendo a transição (voltando para o flat):
        //   skatista estende o corpo (descomprime as pernas para gerar velocidade na gravidade).
        // - No flat central:
        //   pose atlética intermediária com leve flexão de prontidão.
        const surf = rampSurface(p)
        const isAscending = (pDir > 0 && p > 0) || (pDir < 0 && p < 0)
        const isDescending = (pDir > 0 && p < 0) || (pDir < 0 && p > 0)
        const transitionFraction = Math.max(0, (Math.abs(p) - HALF_FLAT) / ARC_LEN) // 0..1

        if (landingTimer > 0) {
          // Aterrissagem com amortecimento elástico
          const progress = 1 - landingTimer / LANDING_DURATION // 0..1
          // Agacha forte no início da aterrissagem (impacto) e sobe gradualmente
          targetCrouch = 0.9 * Math.sin((1 - progress) * Math.PI * 0.5) + 0.3
          landingTimer--
        } else if (surf.isTransition) {
          if (isAscending) {
            // Agachando ao subir a transição ("pump in" na subida)
            targetCrouch = 0.4 + transitionFraction * 0.55 // até ~0.95 próximo ao coping
          } else if (isDescending) {
            // Estendendo ao descer da transição ("pump out" descendo pro flat)
            targetCrouch = Math.max(0.05, 0.5 - transitionFraction * 0.4) // até ~0.10
          } else {
            targetCrouch = 0.3
          }
        } else {
          // Flat central: leve balanceamento atlético
          targetCrouch = 0.22 + Math.sin(p * 0.05) * 0.06
        }

        // Inclinação do corpo acompanhando a rampa:
        // A câmera lateral vê o perfil da rampa em Z.
        // A inclinação da rampa na posição p é `surf.slope`.
        // O skatista inclina os pés e corpo alinhado com a superfície!
        targetAngle = surf.slope
      }

      // Interpolação suave de pose/crouch e inclinação
      currentCrouch += (targetCrouch - currentCrouch) * 0.3
      currentAngle += (targetAngle - currentAngle) * 0.35

      drawSkater(spriteCtx, {
        pose,
        flipRotation: flipRot,
        grabT,
        crouch: currentCrouch,
        surfaceAngle: currentAngle,
        balanceArm: balanceArmVal,
        isAir: air.active,
        isLanding: landingTimer > 0,
        facing: skaterFacing,
      })

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

      // --- Posição atual do skatista ---
      let py: number, pz: number
      if (air.active) {
        py = air.y
        pz = air.z
      } else if (copingMode !== 'none') {
        py = COPING_Y
        pz = copingSide > 0 ? COPING_Z_POS : COPING_Z_NEG
      } else {
        const surf = rampSurface(p)
        py = surf.y
        pz = surf.z
      }

      // Normal à superfície da rampa para posicionamento sem clipping:
      let normY = 1
      let normZ = 0
      if (copingMode !== 'none') {
        // No coping (stall/grind), o skate apoia perfeitamente em cima do cano de ferro
        normY = 1
        normZ = 0
      } else if (!air.active && Math.abs(p) > HALF_FLAT) {
        const ap = Math.abs(p)
        const d = ap - HALF_FLAT
        const theta = (d / ARC_LEN) * (Math.PI / 2)
        normZ = -Math.sign(p) * Math.sin(theta)
        normY = Math.cos(theta)
      }

      // Deslocamento para garantir contato perfeito das rodas e nenhuma interseção de malha
      const renderContactPoint: Vec3 = [playerX, py + normY * 2.5, pz + normZ * 2.5]

      // Triângulos do mundo (chão + rampa).
      const tris: Triangle[] = []
      for (const t of groundTris) tris.push(t)
      for (const t of rampTris) tris.push(t)

      // Renderiza a geometria da rampa e chão
      renderTriangles(target, tris, width, height, FOCAL, transform, lightDir)

      // Sombra projetada (arcade): desenhada logo após a geometria da rampa e antes do skatista.
      // Em vôo alto na rampa, a sombra projeta no flat/transição abaixo.
      {
        const shadowY = Math.min(py, Math.max(0, rampSurface(p).y)) + 1
        const shadowCenter: Vec3 = [playerX, shadowY, pz]
        const tsh = transform(shadowCenter)
        if (tsh[2] > 10) {
          const ssx = tsh[0] * (FOCAL / tsh[2]) + width / 2
          const ssy = -tsh[1] * (FOCAL / tsh[2]) + height / 2
          const heightAboveRamp = Math.max(0, py - shadowY)
          const shrink = Math.max(0.35, 1 - Math.min(1, heightAboveRamp / (COPING_Y * 1.5)))
          const rw = ((55 * FOCAL) / tsh[2]) * shrink
          const rh = ((16 * FOCAL) / tsh[2]) * shrink
          target.save()
          target.globalAlpha = 0.28 * shrink
          target.fillStyle = '#000'
          target.beginPath()
          target.ellipse(ssx, ssy, rw, rh, 0, 0, Math.PI * 2)
          target.fill()
          target.restore()
        }
      }

      // --- Billboard do sprite do skatista ---
      // Renderizado garantidamente por cima de qualquer triângulo da rampa e da sombra.
      // O ponto de contato renderContactPoint projeta a base das rodas exatamente na superfície
      // visível da rampa de madeira, sem que o skatista fique afundado ou sobreposto.
      const tc = transform(renderContactPoint)
      if (tc[2] > 10) {
        const sx = tc[0] * (FOCAL / tc[2]) + width / 2
        const sy = -tc[1] * (FOCAL / tc[2]) + height / 2
        const scale = FOCAL / tc[2]
        const drawW = SPRITE_W * scale
        const drawH = SPRITE_H * scale
        const drawX = sx - PIVOT_X * scale
        const drawY = sy - PIVOT_Y * scale
        target.save()
        target.imageSmoothingEnabled = true
        target.imageSmoothingQuality = 'high'
        target.drawImage(sprite, drawX, drawY, drawW, drawH)
        target.restore()
      }
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
