// MWNPCabinetKit.ts — tiny procedural mesh kit for the realistic MWNP cabinet look.
//
// Owns: building one vertex-colored mesh out of boxes, cylinders, cones, discs, domes, spheres and round tubes. Every vertex gets its
// color pre-shaded by a fixed light from the top-left-front (the scene is unlit and the display is additive, so the depth cue is baked
// in: light faces stay bright, shadowed faces are mid-tone, nothing goes near black).
// Must not: know about the cabinet layout, the netlist or any state (MWNPCabinet calls it with positions).
// API: new CabinetKit(); box/cyl/disc/dome/sphere/tube(...); build() -> RenderMesh; vertexCount.
// All shapes are closed solids with counter-clockwise faces seen from outside (back-face culling is on).

export type V3 = [number, number, number]
export type C4 = [number, number, number, number]

/** Direction the baked light comes from (normalized in shade()). */
const LIGHT: V3 = [-0.35, 0.55, 0.76]
const LIGHT_LEN = Math.sqrt(LIGHT[0] * LIGHT[0] + LIGHT[1] * LIGHT[1] + LIGHT[2] * LIGHT[2])

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
function scale(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function norm(a: V3): V3 {
  const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
  return l < 1e-9 ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l]
}

/** Color of a surface with outward normal n: factor 0.62 (facing away from the light) to 1.12 (facing it). */
export function shade(color: C4, n: V3): C4 {
  const nn = norm(n)
  const lam = Math.max(0, (nn[0] * LIGHT[0] + nn[1] * LIGHT[1] + nn[2] * LIGHT[2]) / LIGHT_LEN)
  const f = 0.62 + 0.5 * lam
  return [Math.min(1, color[0] * f), Math.min(1, color[1] * f), Math.min(1, color[2] * f), color[3]]
}

/** Mixes `color` toward white by t (0..1). */
export function lighten(color: C4, t: number): C4 {
  return [color[0] + (1 - color[0]) * t, color[1] + (1 - color[1]) * t, color[2] + (1 - color[2]) * t, color[3]]
}

export class CabinetKit {
  private verts: number[] = []
  private idx: number[] = []
  private n = 0

  get vertexCount(): number {
    return this.n
  }

  private v(p: V3, c: C4): number {
    this.verts.push(p[0], p[1], p[2], c[0], c[1], c[2], c[3])
    return this.n++
  }

  private tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c)
  }

  /** One quad p0..p3 counter-clockwise seen from outside, flat-shaded by normal n. */
  private quad(p0: V3, p1: V3, p2: V3, p3: V3, n: V3, color: C4): void {
    const c = shade(color, n)
    const a = this.v(p0, c)
    const b = this.v(p1, c)
    const d = this.v(p2, c)
    const e = this.v(p3, c)
    this.tri(a, b, d)
    this.tri(a, d, e)
  }

  /** Axis-aligned box: center, size. `faces` overrides the color of single faces (px, nx, py, ny, pz). The back face (-z) is skipped. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: C4, faces?: {[face: string]: C4}): void {
    const x0 = cx - sx / 2
    const x1 = cx + sx / 2
    const y0 = cy - sy / 2
    const y1 = cy + sy / 2
    const z0 = cz - sz / 2
    const z1 = cz + sz / 2
    const col = (f: string): C4 => (faces && faces[f] ? (faces[f] as C4) : color)
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], col("px"))
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], col("nx"))
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], col("py"))
    this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0], col("ny"))
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col("pz"))
  }

  /** Basis perpendicular to axis a: (u, v) with u x v = a. */
  private basis(a: V3): [V3, V3] {
    const helper: V3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const u = norm(cross(helper, a))
    const v = cross(a, u)
    return [u, v]
  }

  /** Cylinder / cone from p0 (radius r0) to p1 (radius r1), smooth side shading, optional flat end caps. */
  cyl(p0: V3, p1: V3, r0: number, r1: number, sides: number, color: C4, capStart: boolean = true, capEnd: boolean = true): void {
    const a = norm(sub(p1, p0))
    const [u, v] = this.basis(a)
    const ring0: number[] = []
    const ring1: number[] = []
    for (let i = 0; i <= sides; i++) {
      const th = (i / sides) * Math.PI * 2
      const dir = add(scale(u, Math.cos(th)), scale(v, Math.sin(th)))
      const c = shade(color, dir)
      ring0.push(this.v(add(p0, scale(dir, r0)), c))
      ring1.push(this.v(add(p1, scale(dir, r1)), c))
    }
    for (let i = 0; i < sides; i++) {
      this.tri(ring0[i], ring0[i + 1], ring1[i + 1])
      this.tri(ring0[i], ring1[i + 1], ring1[i])
    }
    if (capEnd) this.disc(p1, a, r1, sides, color)
    if (capStart) this.disc(p0, scale(a, -1), r0, sides, color)
  }

  /** Flat disc facing `normal`. */
  disc(center: V3, normal: V3, r: number, sides: number, color: C4): void {
    const a = norm(normal)
    const [u, v] = this.basis(a)
    const c = shade(color, a)
    const mid = this.v(center, c)
    const ring: number[] = []
    for (let i = 0; i <= sides; i++) {
      const th = (i / sides) * Math.PI * 2
      ring.push(this.v(add(center, add(scale(u, Math.cos(th) * r), scale(v, Math.sin(th) * r))), c))
    }
    for (let i = 0; i < sides; i++) this.tri(mid, ring[i], ring[i + 1])
  }

  /** Hemisphere (or any latitude band) around axis `a`: phi0..phi1 in radians (0 = equator, pi/2 = pole). */
  dome(center: V3, a: V3, r: number, color: C4, sides: number = 12, rings: number = 5, phi0: number = 0, phi1: number = Math.PI / 2): void {
    const ax = norm(a)
    const [u, v] = this.basis(ax)
    const grid: number[][] = []
    for (let j = 0; j <= rings; j++) {
      const phi = phi0 + ((phi1 - phi0) * j) / rings
      const row: number[] = []
      for (let i = 0; i <= sides; i++) {
        const th = (i / sides) * Math.PI * 2
        const ring = add(scale(u, Math.cos(th)), scale(v, Math.sin(th)))
        const nrm = add(scale(ring, Math.cos(phi)), scale(ax, Math.sin(phi)))
        row.push(this.v(add(center, scale(nrm, r)), shade(color, nrm)))
      }
      grid.push(row)
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < sides; i++) {
        this.tri(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1])
        this.tri(grid[j][i], grid[j + 1][i + 1], grid[j + 1][i])
      }
    }
  }

  /** Full sphere (joints of the round wires). */
  sphere(center: V3, r: number, color: C4, sides: number = 8, rings: number = 6): void {
    this.dome(center, [0, 0, 1], r, color, sides, rings, -Math.PI / 2, Math.PI / 2)
  }

  /** Round tube along a polyline of 3D points (axis-aligned or not), with round joints. */
  tube(pts: V3[], r: number, sides: number, color: C4): void {
    for (let k = 0; k < pts.length - 1; k++) this.cyl(pts[k], pts[k + 1], r, r, sides, color, false, false)
    for (let k = 0; k < pts.length; k++) this.sphere(pts[k], r, color, sides, Math.max(4, Math.floor(sides / 2)))
  }

  /** Builds the mesh. Position + RGBA vertex color, triangles, 16-bit indices (call once per kit). */
  build(): RenderMesh {
    if (this.n > 65000) print("[CabinetKit] warning: " + this.n + " vertices; 16-bit indices allow 65535")
    const b = new MeshBuilder([
      {name: "position", components: 3},
      {name: "color", components: 4},
    ])
    b.topology = MeshTopology.Triangles
    b.indexType = MeshIndexType.UInt16
    b.appendVerticesInterleaved(this.verts)
    b.appendIndices(this.idx)
    const mesh = b.getMesh()
    b.updateMesh()
    return mesh
  }
}
