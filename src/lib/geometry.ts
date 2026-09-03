import { Vec3 } from '@/lib/math3d'

export type Vec2 = [number, number]

export type Triangle = {
  vertices: [Vec3, Vec3, Vec3]
  color: Vec3
  isWorld?: boolean
  isGround?: boolean
  layer?: number
}

export const createPyramid = (center: Vec3, size: Vec3, color: Vec3): Triangle[] => {
  const [cx, cy, cz] = center
  const [w, h, d] = size
  const hw = w / 2,
    hd = d / 2

  const top: Vec3 = [cx, cy + h / 2, cz]
  const p0: Vec3 = [cx - hw, cy - h / 2, cz + hd]
  const p1: Vec3 = [cx + hw, cy - h / 2, cz + hd]
  const p2: Vec3 = [cx + hw, cy - h / 2, cz - hd]
  const p3: Vec3 = [cx - hw, cy - h / 2, cz - hd]

  return [
    { vertices: [p0, p1, top], color },
    { vertices: [p1, p2, top], color },
    { vertices: [p2, p3, top], color },
    { vertices: [p3, p0, top], color },
    { vertices: [p1, p0, p2], color },
    { vertices: [p2, p0, p3], color },
  ]
}

export const createRamp = (
  center: Vec3,
  size: Vec3,
  color: Vec3,
  omitBottom = true,
): Triangle[] => {
  const [cx, cy, cz] = center
  const [w, h, d] = size
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2

  const p: Vec3[] = [
    [cx - hw, cy - hh, cz + hd], // 0: front-bottom-left
    [cx + hw, cy - hh, cz + hd], // 1: front-bottom-right
    [cx + hw, cy - hh, cz - hd], // 2: back-bottom-right
    [cx - hw, cy - hh, cz - hd], // 3: back-bottom-left
    [cx + hw, cy + hh, cz - hd], // 4: back-top-right
    [cx - hw, cy + hh, cz - hd], // 5: back-top-left
  ]

  const tris: Triangle[] = [
    { vertices: [p[3], p[5], p[4]], color },
    { vertices: [p[3], p[4], p[2]], color }, // Back
    { vertices: [p[0], p[1], p[4]], color },
    { vertices: [p[0], p[4], p[5]], color }, // Slope
    { vertices: [p[0], p[5], p[3]], color }, // Left
    { vertices: [p[1], p[2], p[4]], color }, // Right
  ]

  if (!omitBottom) {
    tris.push({ vertices: [p[0], p[2], p[1]], color }, { vertices: [p[0], p[3], p[2]], color })
  }

  return tris
}

export const createBox = (
  center: Vec3,
  size: Vec3,
  color: Vec3,
  omitBottom = false,
): Triangle[] => {
  const [cx, cy, cz] = center
  const [w, h, d] = size
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2

  const p: Vec3[] = [
    [cx - hw, cy - hh, cz + hd], // 0
    [cx + hw, cy - hh, cz + hd], // 1
    [cx + hw, cy + hh, cz + hd], // 2
    [cx - hw, cy + hh, cz + hd], // 3
    [cx - hw, cy - hh, cz - hd], // 4
    [cx + hw, cy - hh, cz - hd], // 5
    [cx + hw, cy + hh, cz - hd], // 6
    [cx - hw, cy + hh, cz - hd], // 7
  ]

  const tris: Triangle[] = [
    { vertices: [p[0], p[1], p[2]], color },
    { vertices: [p[0], p[2], p[3]], color }, // Front
    { vertices: [p[5], p[4], p[7]], color },
    { vertices: [p[5], p[7], p[6]], color }, // Back
    { vertices: [p[3], p[2], p[6]], color },
    { vertices: [p[3], p[6], p[7]], color }, // Top
    { vertices: [p[1], p[5], p[6]], color },
    { vertices: [p[1], p[6], p[2]], color }, // Right
    { vertices: [p[4], p[0], p[3]], color },
    { vertices: [p[4], p[3], p[7]], color }, // Left
  ]

  if (!omitBottom) {
    tris.push({ vertices: [p[4], p[5], p[1]], color }, { vertices: [p[4], p[1], p[0]], color })
  }

  return tris
}

export interface MiniRampParams {
  /** Largura total da rampa (eixo X). */
  width: number
  /** Profundidade total (eixo Z): flat + 2 * transição. */
  depth: number
  /** Profundidade de cada transição curva (eixo Z). */
  transitionDepth: number
  /** Altura do topo da transição (coping). */
  height: number
  /** Raio da transição (quarter circle). Deve ser ≈ height para transição perfeita. */
  radius: number
  /** Segmentos de cada transição. */
  segments: number
}

/**
 * Coping metálico no topo da transição.
 */
const COPING: Vec3 = [210, 215, 225]

/**
 * Função hash determinística pseudo-aleatória por posição/índice (0..1).
 * Não muda entre frames, evitando que as cores pisquem.
 */
const pseudoRandom = (seedA: number, seedB: number, seedC: number = 0): number => {
  const n = Math.sin(seedA * 12.9898 + seedB * 78.233 + seedC * 37.719) * 43758.5453
  return n - Math.floor(n)
}

/**
 * Gera um tom de madeira natural (compensado/tábuas de skate park) com base
 * na posição espacial do triângulo / tábua.
 * Cria contraste sutil entre ripas e veios de madeira.
 */
const getWoodSurfaceColor = (x: number, y: number, z: number, plankIndex: number): Vec3 => {
  // Hash primário da tábua/placa
  const hPlank = pseudoRandom(plankIndex * 17.13, 42.5)
  // Variação micro por posição (simulando nó ou veio de madeira)
  const hGrain = pseudoRandom(x * 0.05, z * 0.05, y * 0.08)

  // Cor base de madeira de rampa (skatelite / compensado naval):
  // R ~ 180..220, G ~ 125..160, B ~ 70..105 (marrom dourado acolhedor)
  const plankVariation = (hPlank - 0.5) * 36
  const grainVariation = (hGrain - 0.5) * 16

  const baseR = 196 + plankVariation + grainVariation
  const baseG = 138 + plankVariation * 0.8 + grainVariation * 0.7
  const baseB = 84 + plankVariation * 0.55 + grainVariation * 0.45

  return [
    Math.max(120, Math.min(235, Math.round(baseR))),
    Math.max(80, Math.min(180, Math.round(baseG))),
    Math.max(45, Math.min(125, Math.round(baseB))),
  ]
}

/**
 * Cor de madeira para as laterais estruturais (madeira compensada / vigas mais escuras).
 */
const getWoodSideColor = (x: number, y: number, z: number, index: number): Vec3 => {
  const h = pseudoRandom(index * 23.41, x * 0.02, z * 0.02)
  const varN = (h - 0.5) * 24
  return [
    Math.max(90, Math.min(170, Math.round(135 + varN))),
    Math.max(60, Math.min(130, Math.round(92 + varN * 0.8))),
    Math.max(35, Math.min(90, Math.round(58 + varN * 0.6))),
  ]
}

/**
 * Cor de madeira para o deck da plataforma (tábuas de deck tratadas).
 */
const getWoodDeckColor = (x: number, z: number, plankIndex: number): Vec3 => {
  const h = pseudoRandom(plankIndex * 31.7, x * 0.01, z * 0.03)
  const varN = (h - 0.5) * 28
  return [
    Math.max(110, Math.min(190, Math.round(155 + varN))),
    Math.max(75, Math.min(145, Math.round(108 + varN * 0.8))),
    Math.max(45, Math.min(100, Math.round(68 + varN * 0.6))),
  ]
}

/**
 * Cria a geometria de uma mini-ramp: duas transições (quarter-pipes nas
 * laterais) ligadas por um flat central, com coping metálico no topo de cada
 * transição e decks (plataformas) atrás.
 *
 * Superfície e decks possuem textura visual de tábuas de madeira com
 * variação determinística de tons por ripa/face no estilo low-poly/bruto.
 * O chão de concreto ao redor permanece inalterado.
 */
export const createMiniRamp = (p: MiniRampParams): Triangle[] => {
  const { width, depth, transitionDepth, height, radius, segments } = p
  const halfW = width / 2
  const flatDepth = depth - 2 * transitionDepth

  const tris: Triangle[] = []

  // Subdivisão em ripas no eixo X para dar aspecto de tábuas de madeira longitudinais
  const xPlanks = 14
  const dx = width / xPlanks

  // ---- Plataforma central (flat) em tábuas de madeira ----
  const flatZSegments = 4
  const dzFlat = flatDepth / flatZSegments
  for (let xi = 0; xi < xPlanks; xi++) {
    const x0 = -halfW + xi * dx
    const x1 = x0 + dx
    for (let zi = 0; zi < flatZSegments; zi++) {
      const z0 = -flatDepth / 2 + zi * dzFlat
      const z1 = z0 + dzFlat
      const plankId = xi * 10 + zi + 1
      const col1 = getWoodSurfaceColor(x0, 0, z0, plankId)
      const col2 = getWoodSurfaceColor(x1, 0, z1, plankId + 0.5)
      tris.push({
        vertices: [
          [x0, 0, z0],
          [x1, 0, z0],
          [x1, 0, z1],
        ],
        color: col1,
      })
      tris.push({
        vertices: [
          [x0, 0, z0],
          [x1, 0, z1],
          [x0, 0, z1],
        ],
        color: col2,
      })
    }
  }

  // ---- Transições (quarter-pipes) nas laterais +Z e -Z ----
  const addTransition = (side: 1 | -1) => {
    const flatZ = side * (flatDepth / 2)
    const centerZ = flatZ
    const centerY = height

    const segs = Math.max(2, segments)
    // Coordenadas (y, z) dos anéis da curva
    const curve: { y: number; z: number }[] = []
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * (Math.PI / 2)
      const y = centerY - radius * Math.cos(ang)
      const z = centerZ + side * radius * Math.sin(ang)
      curve.push({ y, z })
    }

    // Superfície curva em tábuas (dividida em X e Z):
    // Cada tábua tem sutil variação de tom, criando veios e juntas típicas de rampa de skate
    for (let xi = 0; xi < xPlanks; xi++) {
      const x0 = -halfW + xi * dx
      const x1 = x0 + dx
      for (let i = 0; i < curve.length - 1; i++) {
        const cA = curve[i]
        const cB = curve[i + 1]
        const p0: Vec3 = [x0, cA.y, cA.z]
        const p1: Vec3 = [x1, cA.y, cA.z]
        const p2: Vec3 = [x1, cB.y, cB.z]
        const p3: Vec3 = [x0, cB.y, cB.z]

        const plankId = (side > 0 ? 100 : 200) + xi * 20 + i
        const col1 = getWoodSurfaceColor(x0, cA.y, cA.z, plankId)
        const col2 = getWoodSurfaceColor(x1, cB.y, cB.z, plankId + 0.5)

        tris.push({ vertices: [p0, p1, p2], color: col1 })
        tris.push({ vertices: [p0, p2, p3], color: col2 })
      }
    }

    // Verticais nas extremidades em X (laterais estruturais de madeira compensada).
    for (let i = 0; i < curve.length - 1; i++) {
      const cA = curve[i]
      const cB = curve[i + 1]
      const colSide1 = getWoodSideColor(-halfW, cA.y, cA.z, (side > 0 ? 500 : 600) + i)
      const colSide2 = getWoodSideColor(halfW, cA.y, cA.z, (side > 0 ? 700 : 800) + i)

      // Lateral -X
      tris.push({
        vertices: [
          [-halfW, 0, cA.z],
          [-halfW, cA.y, cA.z],
          [-halfW, cB.y, cB.z],
        ],
        color: colSide1,
      })
      tris.push({
        vertices: [
          [-halfW, 0, cA.z],
          [-halfW, cB.y, cB.z],
          [-halfW, 0, cB.z],
        ],
        color: colSide1,
      })

      // Lateral +X
      tris.push({
        vertices: [
          [halfW, 0, cA.z],
          [halfW, cB.y, cB.z],
          [halfW, cA.y, cA.z],
        ],
        color: colSide2,
      })
      tris.push({
        vertices: [
          [halfW, 0, cA.z],
          [halfW, 0, cB.z],
          [halfW, cB.y, cB.z],
        ],
        color: colSide2,
      })
    }

    // ---- Deck (plataforma de madeira atrás da transição) ----
    const deckZ = flatZ + side * transitionDepth
    const deckBackZ = flatZ + side * (transitionDepth + 40)
    const deckSegs = 3
    const dzDeck = (deckBackZ - deckZ) / deckSegs
    for (let xi = 0; xi < xPlanks; xi++) {
      const x0 = -halfW + xi * dx
      const x1 = x0 + dx
      for (let di = 0; di < deckSegs; di++) {
        const z0 = deckZ + di * dzDeck
        const z1 = z0 + dzDeck
        const pId = (side > 0 ? 300 : 400) + xi * 10 + di
        const colDeck = getWoodDeckColor((x0 + x1) / 2, (z0 + z1) / 2, pId)
        tris.push({
          vertices: [
            [x0, height, z0],
            [x1, height, z0],
            [x1, height, z1],
          ],
          color: colDeck,
        })
        tris.push({
          vertices: [
            [x0, height, z0],
            [x1, height, z1],
            [x0, height, z1],
          ],
          color: colDeck,
        })
      }
    }

    // ---- Coping (cilindro metálico no topo da transição) ----
    const copingY = height
    const copingZ = deckZ
    const copingR = 2.5
    const copingSegs = 8
    for (let i = 0; i < copingSegs; i++) {
      const a1 = (i / copingSegs) * Math.PI * 2
      const a2 = ((i + 1) / copingSegs) * Math.PI * 2
      const y1 = copingY + Math.sin(a1) * copingR
      const z1 = copingZ + Math.cos(a1) * copingR
      const y2 = copingY + Math.sin(a2) * copingR
      const z2 = copingZ + Math.cos(a2) * copingR
      tris.push({
        vertices: [
          [-halfW, y1, z1],
          [halfW, y1, z1],
          [halfW, y2, z2],
        ],
        color: COPING,
      })
      tris.push({
        vertices: [
          [-halfW, y1, z1],
          [halfW, y2, z2],
          [-halfW, y2, z2],
        ],
        color: COPING,
      })
    }
  }

  addTransition(1)
  addTransition(-1)

  return tris
}

export const createSphere = (
  center: Vec3,
  radius: number,
  color: Vec3,
  hemisphere = false,
  rings = 8,
  sectors = 12,
): Triangle[] => {
  const t: Triangle[] = []
  if (hemisphere) rings = Math.max(2, Math.floor(rings / 2))
  const R = hemisphere ? (1 / (rings - 1)) * 0.5 : 1 / (rings - 1)
  const S = 1 / (sectors - 1)

  const vertices: Vec3[] = []
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const angle = hemisphere ? (Math.PI / 2) * (r / (rings - 1)) : -Math.PI / 2 + Math.PI * r * R
      const y = Math.sin(angle)
      const rad = Math.cos(angle)
      const x = Math.cos(2 * Math.PI * s * S) * rad
      const z = Math.sin(2 * Math.PI * s * S) * rad
      vertices.push([center[0] + x * radius, center[1] + y * radius, center[2] + z * radius])
    }
  }

  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < sectors - 1; s++) {
      const i0 = r * sectors + s
      const i1 = r * sectors + (s + 1)
      const i2 = (r + 1) * sectors + (s + 1)
      const i3 = (r + 1) * sectors + s

      t.push({ vertices: [vertices[i0], vertices[i1], vertices[i2]], color })
      t.push({ vertices: [vertices[i0], vertices[i2], vertices[i3]], color })
    }
  }
  return t
}
