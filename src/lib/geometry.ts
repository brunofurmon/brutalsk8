import { Vec3 } from '@/lib/math3d'

export type Triangle = {
  vertices: [Vec3, Vec3, Vec3]
  color: Vec3
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
