import { Vec3 } from '@/lib/math3d'

export type Triangle = {
  vertices: [Vec3, Vec3, Vec3]
  color: Vec3
  isWorld?: boolean
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

export const createBox = (center: Vec3, size: Vec3, color: Vec3): Triangle[] => {
  const [cx, cy, cz] = center
  const [w, h, d] = size
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2

  const p: Vec3[] = [
    [cx - hw, cy - hh, cz + hd],
    [cx + hw, cy - hh, cz + hd], // Front-bottom: 0, 1
    [cx + hw, cy + hh, cz + hd],
    [cx - hw, cy + hh, cz + hd], // Front-top: 2, 3
    [cx - hw, cy - hh, cz - hd],
    [cx + hw, cy - hh, cz - hd], // Back-bottom: 4, 5
    [cx + hw, cy + hh, cz - hd],
    [cx - hw, cy + hh, cz - hd], // Back-top: 6, 7
  ]

  return [
    { vertices: [p[0], p[1], p[2]], color },
    { vertices: [p[0], p[2], p[3]], color }, // Front
    { vertices: [p[5], p[4], p[7]], color },
    { vertices: [p[5], p[7], p[6]], color }, // Back
    { vertices: [p[3], p[2], p[6]], color },
    { vertices: [p[3], p[6], p[7]], color }, // Top
    { vertices: [p[4], p[5], p[1]], color },
    { vertices: [p[4], p[1], p[0]], color }, // Bottom
    { vertices: [p[1], p[5], p[6]], color },
    { vertices: [p[1], p[6], p[2]], color }, // Right
    { vertices: [p[4], p[0], p[3]], color },
    { vertices: [p[4], p[3], p[7]], color }, // Left
  ]
}

export const createSphere = (
  center: Vec3,
  radius: number,
  color: Vec3,
  hemisphere = false,
): Triangle[] => {
  const t: Triangle[] = []
  const rings = hemisphere ? 2 : 3
  const sectors = 5
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
