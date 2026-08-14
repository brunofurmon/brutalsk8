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
 * Cor cinza concreto sólido.
 */
const CONCRETE: Vec3 = [150, 150, 150]
const CONCRETE_DECK: Vec3 = [130, 130, 130]
const COPIING: Vec3 = [200, 200, 210]

/**
 * Cria a geometria de uma mini-ramp: duas transições (quarter-pipes nas
 * laterais) ligadas por um flat central, com coping metálico no topo de cada
 * transição e decks (plataformas) atrás. Tudo com triângulos, cores sólidas.
 *
 * A rampa é centrada na origem e fica fixa no mundo (eixos: X = largura,
 * Z = profundidade, Y = altura).
 */
export const createMiniRamp = (p: MiniRampParams): Triangle[] => {
  const { width, depth, transitionDepth, height, radius, segments } = p
  const halfW = width / 2
  const flatDepth = depth - 2 * transitionDepth

  const tris: Triangle[] = []

  // ---- Plataforma central (flat) ----
  tris.push({
    vertices: [
      [-halfW, 0, -flatDepth / 2],
      [halfW, 0, -flatDepth / 2],
      [halfW, 0, flatDepth / 2],
    ],
    color: CONCRETE,
  })
  tris.push({
    vertices: [
      [-halfW, 0, -flatDepth / 2],
      [halfW, 0, flatDepth / 2],
      [-halfW, 0, flatDepth / 2],
    ],
    color: CONCRETE,
  })

  // ---- Transições (quarter-pipes) nas laterais +Z e -Z ----
  // Função para gerar uma transição curva virada "para dentro" (flat).
  const addTransition = (side: 1 | -1) => {
    // side=+1: transição em +Z, curva vai do flat (z=flatDepth/2, y=0) até o
    // topo (z=flatDepth/2+transitionDepth, y=height).
    const flatZ = side * (flatDepth / 2)
    // Centro da curva (centro do círculo da transição) está em y=height,
    // z=flatZ (raio vertical até o ponto base). Verifica coerência.
    const centerZ = flatZ
    const centerY = height

    const segs = Math.max(2, segments)
    const strip: { pos: Vec3 }[] = []
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * (Math.PI / 2)
      // ang=0: ponto base (flat), ang=PI/2: topo da transição.
      const y = centerY - radius * Math.cos(ang)
      const z = centerZ + side * radius * Math.sin(ang)
      strip.push({ pos: [-halfW, y, z] })
    }

    // Faixas longitudinais (x) por dois pontos consecutivos da curva = quad
    // dividido em 2 triângulos. Fazemos a largura em um único quad (sem
    // subdivisão em X) — a luz destaca as faixas em Z.
    for (let i = 0; i < strip.length - 1; i++) {
      const a = strip[i].pos
      const b = strip[i + 1].pos
      const aR: Vec3 = [a[0] + width, a[1], a[2]]
      const bR: Vec3 = [b[0] + width, b[1], b[2]]
      tris.push({ vertices: [a, aR, bR], color: CONCRETE })
      tris.push({ vertices: [a, bR, b], color: CONCRETE })
    }

    // Verticais nas extremidades em X (fecham as laterais da transição).
    for (let i = 0; i < strip.length - 1; i++) {
      const a = strip[i].pos
      const b = strip[i + 1].pos
      // Lateral -X
      tris.push({ vertices: [[a[0], 0, a[2]], a, b], color: CONCRETE_DECK })
      tris.push({ vertices: [[a[0], 0, a[2]], b, [b[0], 0, b[2]]], color: CONCRETE_DECK })
      // Lateral +X
      const aR: Vec3 = [a[0] + width, a[1], a[2]]
      const bR: Vec3 = [b[0] + width, b[1], b[2]]
      tris.push({ vertices: [[aR[0], 0, aR[2]], bR, aR], color: CONCRETE_DECK })
      tris.push({ vertices: [[aR[0], 0, aR[2]], [bR[0], 0, bR[2]], bR], color: CONCRETE_DECK })
    }

    // ---- Deck (plataforma atrás da transição) ----
    const deckZ = flatZ + side * transitionDepth
    const deckBackZ = flatZ + side * (transitionDepth + 40)
    tris.push({
      vertices: [
        [-halfW, height, deckZ],
        [halfW, height, deckZ],
        [halfW, height, deckBackZ],
      ],
      color: CONCRETE_DECK,
    })
    tris.push({
      vertices: [
        [-halfW, height, deckZ],
        [halfW, height, deckBackZ],
        [-halfW, height, deckBackZ],
      ],
      color: CONCRETE_DECK,
    })

    // ---- Coping (cilindro fino no topo da transição, em toda a largura) ----
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
        color: COPIING,
      })
      tris.push({
        vertices: [
          [-halfW, y1, z1],
          [halfW, y2, z2],
          [-halfW, y2, z2],
        ],
        color: COPIING,
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
