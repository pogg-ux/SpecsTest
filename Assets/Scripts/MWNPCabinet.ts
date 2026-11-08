// MWNPCabinet.ts — stand-in 3D model of the MWNP 1.0 bench trainer, built from primitives.
//
// Owns: bench, enclosure, backboard, PS1, DIN rail + TS-1..TS-5, switch/lamp plate (S1, L1, L2,
// plugged holes), fuse plate (F1, F2, open spots), wires (red +12 V / blue 0 V), and the
// visual state the agent drives: outlines, trace line, probe markers, lamp glow, S1 lever.
// Also owns the S1 toggle interaction (SIK Interactable + collider on "S1_Toggle").
//
// Why script-built instead of authored: the wires, terminal colors and labels are derived
// from netlist.json (which wires exist, which are 0 V returns, which terminal is spare), so
// the model is data-driven. LAYOUT below is the physical stand-in geometry from
// MWNP_1.0_panel_layout.png (cm, cabinet-local, +Y up, +Z toward the user) — positions only,
// no circuit facts. Move the whole trainer by moving the authored "MWNPTrainer" SceneObject.
//
// Size note: long because LAYOUT/ROUTES tables + primitive builders live together; no logic here.
// Must not: decide pass/fail or compose agent text. Text on the model lives in MWNPPartTagsUI.
// Test handles: "S1_Toggle" (pinch to flip), "Outline_<ID>", "Trace_<wire>_<i>", "Lamp_L1",
//               "Probe_Test", "Probe_Ref". Readable: s1Position, lampLit, outlineStates, traceStates.

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {Netlist} from "./MWNPNetlist"
import {C4, CabinetKit, lighten} from "./MWNPCabinetKit"

type V2 = [number, number]

interface PartBox {
  c: V2 // center x,y
  s: [number, number, number] // w,h,d
  z: number // center z
}

// ── Physical stand-in layout (from MWNP_1.0_panel_layout.png, 18.85 px/cm, origin = board center) ──
// Matches the image's plate/panel sizes and positions. One deliberate deviation: terminal pitch is
// 2.0 cm (image ≈1.5 cm) so the ≥1.5 cm ID labels fit on the terminals, centered on the image's group.
const LAYOUT = {
  board: {w: 46, h: 46, frame: 1.0, wallDepth: 6},
  ps1: {c: [0, 15.3], s: [19.6, 8.5, 5], z: 2.5} as PartBox,
  rail: {c: [0, 4.9], s: [34.3, 1.7, 1], z: 0.5} as PartBox,
  terminalX: {"TS-1": -13.3, "TS-2": -11.3, "TS-3": -9.3, "TS-4": -7.3, "TS-5": -5.3} as {[id: string]: number},
  terminal: {y: 4.9, s: [1.8, 4.4, 3.0], z: 2.5},
  switchPlate: {c: [0, -3.7], s: [25, 5, 0.8], z: 0.4} as PartBox,
  holes: {x0: -3.2, dx: 2.44, cols: 6, rows: [-2.3, -3.6, -5.0]}, // 3 rows × 6, level with L1 / S1 / L2
  lamps: {L1: [-10.5, -2.3], L2: [-10.5, -5.0]} as {[id: string]: V2},
  s1: [-10.5, -3.6] as V2,
  fusePlate: {c: [0, -13.5], s: [29, 7.5, 0.8], z: 0.4} as PartBox,
  fuses: {F1: [-11.85, -13.5], F2: [-8.6, -13.5]} as {[id: string]: V2},
  fuseSize: [1.5, 4.4, 1.2],
  openFuseX: [-5.3, -2.0, 1.4, 4.6, 7.9, 11.2],
  // Tag placement (cabinet-local). ID tags: em 1.5 cm. Overlays (expected/badge/info): em 1.0 cm.
  tagZ: {ps1: 5.3, terminal: 4.6, fuse: 2.3, plate: 1.8}, // terminal labels sit in front of the part outline
  switchTagX: {L1: -7.5, L2: -7.5, S1: -4.9} as {[id: string]: number},
}

// Terminal / connection points (cabinet-local x,y).
const POINTS: {[id: string]: V2} = {
  "PS1:+": [-7.2, 11.05], "PS1:-": [7.5, 11.05],
  "S1:COM": [-11.2, -3.6], "S1:UP": [-10.4, -3.1], "S1:DOWN": [-10.4, -4.1],
  "F1:IN": [-11.85, -11.3], "F1:OUT": [-11.85, -15.7],
  "F2:IN": [-8.6, -11.3], "F2:OUT": [-8.6, -15.7],
  "L1:+": [-11.15, -2.3], "L1:-": [-9.85, -2.3],
  "L2:+": [-11.15, -5.0], "L2:-": [-9.85, -5.0],
}

// Wire routes keyed "<from>><to>" exactly as in netlist.json wires[]; label = where the number sits.
// Routed like the panel image, all inside the 46 × 46 board (|x| ≤ 20.3, -20 ≤ y ≤ 11).
// As in the image, wires with no route here (S1 DOWN → TS-5 and the lamp returns) are not drawn;
// the board footnote lists them from the netlist.
const ROUTES: {[key: string]: {pts: V2[]; label: V2}} = {
  "PS1:+>TS-1": {pts: [[-7.2, 11.05], [-7.2, 8.8], [-13.3, 8.8], [-13.3, 7.1]], label: [-12.6, 9.75]},
  "PS1:->TS-2": {pts: [[7.5, 11.05], [7.5, 9.45], [-11.3, 9.45], [-11.3, 7.1]], label: [-9.8, 10.35]},
  "TS-1>S1:COM": {pts: [[-13.3, 2.7], [-13.3, 0.45], [-15.6, 0.45], [-15.6, -3.6], [-11.2, -3.6]], label: [-16.4, -1.2]},
  "S1:UP>TS-4": {pts: [[-10.4, -3.1], [-10.4, 0.2], [-7.6, 0.2], [-7.6, 2.7]], label: [-10.1, 1.1]},
  "TS-4>F1:IN": {pts: [[-6.9, 2.7], [-6.9, 1.45], [19.2, 1.45], [19.2, -8.3], [-11.85, -8.3], [-11.85, -11.3]], label: [17.9, -6.0]},
  "TS-5>F2:IN": {pts: [[-5.3, 2.7], [-5.3, 2.2], [20.3, 2.2], [20.3, -9.1], [-8.6, -9.1], [-8.6, -11.3]], label: [21.3, -6.0]},
  "F1:OUT>L1:+": {pts: [[-11.85, -15.7], [-11.85, -19.1], [-18.1, -19.1], [-18.1, -2.3], [-11.15, -2.3]], label: [-16.6, -18.4]},
  "F2:OUT>L2:+": {pts: [[-8.6, -15.7], [-8.6, -20.0], [-19.0, -20.0], [-19.0, -5.0], [-11.15, -5.0]], label: [-16.6, -20.75]},
}

const WIRE_Z = 1.0
/** Opacity of every wire that is not part of the current step (~30%). */
const DIM_WIRE_ALPHA = 0.3
/** The current step's wire is drawn this much thicker than the others, just above them (between WIRE_Z and TRACE_Z). */
const FOCUS_THICKNESS = 1.5
const FOCUS_Z = 1.2
const TRACE_Z = 1.35

function c4(r: number, g: number, b: number, a: number = 1): vec4 {
  return new vec4(r, g, b, a)
}

// Colors follow the panel image; anything black there is smoke-gray here (additive display).
const PALETTE = {
  bench: c4(0.36, 0.27, 0.18),
  frame: c4(0.56, 0.59, 0.63),
  board: c4(0.82, 0.84, 0.86),
  smoke: c4(0.3, 0.31, 0.34),
  ps1: c4(0.95, 0.9, 0.7),
  rail: c4(0.72, 0.72, 0.73),
  endStop: c4(0.35, 0.35, 0.38),
  termSupply: c4(0.88, 0.4, 0.4),
  termReturn: c4(0.4, 0.6, 0.95),
  termSpare: c4(0.92, 0.92, 0.92),
  plexi: c4(0.72, 0.82, 0.9),
  hole: c4(0.45, 0.46, 0.5),
  fuse: c4(0.85, 0.78, 0.88),
  openSpot: c4(0.45, 0.48, 0.52),
  wireSupply: c4(1.0, 0.16, 0.12),
  wireReturn: c4(0.22, 0.42, 1.0),
  wireFocus: c4(0.2, 0.9, 1.0), // bright cyan: the current step's wire
  s1: c4(0.75, 0.76, 0.8),
  l1Off: c4(0.18, 0.35, 0.18),
  l1On: c4(0.45, 1.0, 0.45),
  l2Off: c4(0.42, 0.3, 0.12),
  l2On: c4(1.0, 0.68, 0.2),
  outlineAmber: c4(1.0, 0.722, 0.0), // #FFB800
  outlineActive: c4(0.2, 0.75, 1.0),
  outlineGreen: c4(0.0, 1.0, 0.4), // #00FF66
  outlineRed: c4(1.0, 0.231, 0.188), // #FF3B30
  traceActive: c4(1.0, 0.549, 0.0), // #FF8C00 orange
  traceGreen: c4(0.0, 1.0, 0.4), // #00FF66
  traceGray: c4(0.5, 0.5, 0.52),
  traceRed: c4(1.0, 0.231, 0.188), // #FF3B30
  probeTest: c4(1.0, 0.3, 0.25),
  probeRef: c4(0.85, 0.85, 0.9),
}

/** Realistic palette entry written as the look wanted (0..1 on screen); the vertex-color material shows linear values, so convert (gamma 2.2). */
function k(r: number, g: number, b: number, a: number = 1): C4 {
  return [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2), a]
}

/** A legacy-palette color (the flat unlit material shows about v^0.72) as the kit needs it to look the same. */
function fromLegacy(c: vec4): C4 {
  return [Math.pow(c.x, 1.584), Math.pow(c.y, 1.584), Math.pow(c.z, 1.584), 1]
}

/** A color for the flat unlit material (Part_ boxes) that shows as the given on-screen look (matches k()). */
function flatFor(r: number, g: number, b: number): vec4 {
  return new vec4(Math.pow(r, 1.39), Math.pow(g, 1.39), Math.pow(b, 1.39), 1)
}

/** Realistic-look colors (bright, readable on the additive display; the kit bakes the light/dark shading). Style: gray steel box, galvanized plates. */
const RC = {
  steel: k(0.55, 0.58, 0.62),
  steelLight: k(0.74, 0.77, 0.81),
  steelMid: k(0.44, 0.47, 0.52),
  galv: k(0.6, 0.63, 0.67), // galvanized backplate
  galvLight: k(0.76, 0.78, 0.81), // galvanized switch / lamp / fuse plates
  plateEdge: k(0.58, 0.61, 0.66),
  rail: k(0.84, 0.86, 0.9),
  railDark: k(0.6, 0.62, 0.67),
  termBody: k(0.7, 0.72, 0.77),
  screw: k(0.88, 0.89, 0.93),
  slot: k(0.46, 0.48, 0.54),
  ps1Face: k(0.86, 0.88, 0.9),
  vent: k(0.42, 0.44, 0.49),
  label: k(0.97, 0.97, 0.98),
  led: k(0.3, 1.0, 0.45),
  glass: k(0.9, 0.97, 1.0),
  brass: k(0.9, 0.72, 0.3),
  copper: k(0.9, 0.55, 0.35),
  chrome: k(0.95, 0.96, 1.0),
  filament: k(0.95, 0.55, 0.15),
  holeRing: k(0.5, 0.52, 0.57),
  holePlug: k(0.72, 0.74, 0.79),
  nameplate: k(0.33, 0.36, 0.42),
  tie: k(0.3, 0.31, 0.35),
  white: k(1, 1, 1),
}
const RC_V = {
  termBody: flatFor(0.7, 0.72, 0.77),
  ps1Body: flatFor(0.8, 0.82, 0.84),
  fuseHolder: flatFor(0.82, 0.84, 0.87), // the plate color: the fuse base disappears into the plate, the clips and the fuse are in the kit
}
/** Realistic look: amber pilot lamps. */
const AMBER_ON = c4(1.0, 0.72, 0.18)
const AMBER_OFF = c4(0.46, 0.31, 0.1)

@component
export class MWNPCabinet extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Trainer Cabinet – stand-in model built from primitives</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Unit box mesh used for every panel part")
  boxMesh: RenderMesh
  @input
  @hint("Unit sphere mesh for lamps, holes and probe markers")
  sphereMesh: RenderMesh
  @input
  @hint("Unlit base material; cloned and tinted per part")
  baseMaterial: Material
  @input
  @allowUndefined
  @hint("Vertex-color material (SimpleVertexBaseColor) used by the realistic look")
  vertexMaterial: Material
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Realistic industrial look: steel enclosure, DIN parts, round wires. Off = the original flat boxes.")
  realisticLook: boolean = true
  @input
  @widget(new SliderWidget(0.3, 1.0, 0.05))
  @hint("Realistic look: opacity of the round wire bodies that are not the current step's wire. 0.3 = the original dimmed rule (washed out); 0.7 keeps red / blue readable while the cyan focus wire still stands out.")
  wireBodyAlpha: number = 0.7
  @input
  @widget(new SliderWidget(0.1, 0.6, 0.05))
  @hint("Wire thickness in cm")
  wireThicknessCm: number = 0.3
  @input
  @widget(new SliderWidget(0.2, 0.8, 0.05))
  @hint("Trace line thickness in cm")
  traceThicknessCm: number = 0.75
  @input
  @widget(new SliderWidget(10, 60, 1))
  @hint("S1 lever throw angle in degrees")
  leverAngleDeg: number = 35
  @ui.group_end
  @ui.separator
  @ui.group_start("Debug")
  @input
  @hint("Draw collider wireframes (S1 toggle)")
  debugColliders: boolean = false
  @ui.group_end

  // Readable state for tests
  s1Position: string = "UP"
  lampLit: {[id: string]: boolean} = {}
  outlineStates: {[id: string]: string} = {}
  traceStates: {[wireKey: string]: string} = {}
  activePointId: string = ""

  private netlist: Netlist | null = null
  private matCache: {[k: string]: Material} = {}
  private outlines: {[id: string]: {so: SceneObject; mats: Material[]}} = {}
  private partBoxes: {[id: string]: {c: V2; w: number; h: number; zFront: number}} = {}
  private traces: {[wireIndex: number]: {so: SceneObject; mats: Material[]}} = {}
  private lamps: {[id: string]: {mat: Material; glow: SceneObject}} = {}
  private leverPivot: SceneObject | null = null
  private probeTest: SceneObject | null = null
  private probeRef: SceneObject | null = null
  private _onS1Toggled = new Event<string>()
  get onS1Toggled(): PublicApi<string> {
    return this._onS1Toggled.publicApi()
  }

  /** Call once (from Main's OnStart) after netlist.json is parsed. */
  build(netlist: Netlist): void {
    this.netlist = netlist
    const root = this.sceneObject
    const bw = LAYOUT.board.w
    const bh = LAYOUT.board.h

    const real = this.realisticLook && !!this.vertexMaterial
    const kit = new CabinetKit()
    const fr = LAYOUT.board.frame
    const wd = LAYOUT.board.wallDepth

    // Enclosure: the legacy flat frame, or (realistic) a gray steel enclosure with depth, a white backplate, flange lips, corner bolts
    // and the hinge pins on the left edge (the door itself is swung out of the picture).
    if (real) this.kitShell(kit, bw, bh, fr, wd)
    else {
      this.box(root, "Backboard", [0, 0], [bw, bh, 1.5], -0.85, PALETTE.frame)
      this.box(root, "MountingPanel", [0, 0], [bw - 2 * fr, bh - 2 * fr, 0.1], -0.05, PALETTE.board)
      this.box(root, "Wall_Top", [0, bh / 2 - fr / 2], [bw, fr, wd], wd / 2 - 1, PALETTE.frame)
      this.box(root, "Wall_Bottom", [0, -bh / 2 + fr / 2], [bw, fr, wd], wd / 2 - 1, PALETTE.frame)
      this.box(root, "Wall_Left", [-bw / 2 + fr / 2, 0], [fr, bh, wd], wd / 2 - 1, PALETTE.frame)
      this.box(root, "Wall_Right", [bw / 2 - fr / 2, 0], [fr, bh, wd], wd / 2 - 1, PALETTE.frame)
    }

    // PS1
    const ps = LAYOUT.ps1
    this.part(root, "PS1", ps.c, ps.s, ps.z, real ? RC_V.ps1Body : PALETTE.ps1)
    if (real) this.kitPs1(kit)
    else {
      this.sphere(root, "PS1_TermPlus", POINTS["PS1:+"], 0.9, 1.0, PALETTE.wireSupply)
      this.sphere(root, "PS1_TermMinus", POINTS["PS1:-"], 0.9, 1.0, PALETTE.wireReturn)
    }

    // DIN rail + terminals (color from netlist: 0 V return = blue, unwired = spare gray, else red)
    if (real) this.kitRail(kit)
    else this.box(root, "DIN_Rail", LAYOUT.rail.c, LAYOUT.rail.s, LAYOUT.rail.z, PALETTE.rail)
    const tIds = Object.keys(LAYOUT.terminalX)
    let minX = 999
    let maxX = -999
    for (const id of tIds) {
      const x = LAYOUT.terminalX[id]
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      if (!netlist.component(id)) continue
      this.part(root, id, [x, LAYOUT.terminal.y], LAYOUT.terminal.s as [number, number, number], LAYOUT.terminal.z, real ? RC_V.termBody : this.terminalColor(id))
      if (real) this.kitTerminal(kit, id, x)
    }
    if (real) {
      for (const ex of [minX - 1.4, maxX + 1.4]) {
        kit.box(ex, LAYOUT.terminal.y, 2.5, 0.7, 4.6, 3.2, RC.steelMid)
        this.kitScrew(kit, ex, LAYOUT.terminal.y, 4.1, 0.26)
      }
    } else {
      this.box(root, "EndStop_L", [minX - 1.4, LAYOUT.terminal.y], [0.7, 4.6, 3.2], 2.5, PALETTE.endStop)
      this.box(root, "EndStop_R", [maxX + 1.4, LAYOUT.terminal.y], [0.7, 4.6, 3.2], 2.5, PALETTE.endStop)
    }

    // Switch / lamp plate: one narrow strip, 3 rows x 6 plugged spare holes right of S1/L1/L2
    const sp = LAYOUT.switchPlate
    if (real) this.kitSwitchPlate(kit)
    else {
      this.box(root, "SwitchLampPlate", sp.c, sp.s, sp.z, PALETTE.smoke)
      LAYOUT.holes.rows.forEach((y, row) => {
        for (let col = 0; col < LAYOUT.holes.cols; col++) {
          const h = this.sphere(root, "PluggedHole_" + row + "_" + col, [LAYOUT.holes.x0 + col * LAYOUT.holes.dx, y], 0.9, 0.85, PALETTE.hole)
          h.getTransform().setLocalScale(new vec3(0.9, 0.9, 0.2))
        }
      })
    }
    this.buildLamp(root, "L1", PALETTE.l1Off)
    this.buildLamp(root, "L2", PALETTE.l2Off)
    this.buildS1(root)

    // Fuse plate, fuses, open spots
    const fp = LAYOUT.fusePlate
    if (real) this.kitFusePlate(kit)
    else this.box(root, "FusePlate", fp.c, fp.s, fp.z, PALETTE.plexi)
    for (const id of Object.keys(LAYOUT.fuses)) {
      if (!netlist.component(id)) continue
      this.part(root, id, LAYOUT.fuses[id], LAYOUT.fuseSize as [number, number, number], 1.4, real ? RC_V.fuseHolder : PALETTE.fuse)
      if (real) this.kitFuse(kit, LAYOUT.fuses[id])
    }
    LAYOUT.openFuseX.forEach((x, i) => {
      const spot = this.obj(root, "OpenFuseSpot_" + i)
      this.dashedRect(spot, [x, fp.c[1]], LAYOUT.fuseSize[0], LAYOUT.fuseSize[1], 0.12, 0.85, PALETTE.openSpot)
    })
    if (real) this.finishKit(root, kit)

    // Wires from netlist.json (those without a panel route are listed in the board footnote).
    // Realistic: round conductors (an 8-sided tube with round joints and a thin light ridge on the lit side); same center lines and depth.
    netlist.data.wires.forEach((w, i) => {
      const r = ROUTES[w.from + ">" + w.to]
      if (!r) return
      const color = netlist.isReturnWire(i) ? PALETTE.wireReturn : PALETTE.wireSupply
      const wso = this.obj(root, "Wire_" + w.id + "_" + i)
      const wm = this.mat(color)
      let hlMat: Material | undefined
      let hlColor: vec4 | undefined
      if (real) {
        const rad = Math.max(0.22, this.wireThicknessCm * 0.75)
        const path: [number, number, number][] = r.pts.map((p) => [p[0], p[1], WIRE_Z])
        const body = new CabinetKit()
        body.tube(path, rad, 8, RC.white)
        this.addMesh(this.obj(wso, "Tube"), body.build(), wm)
        hlColor = c4(Math.min(1, color.x + (1 - color.x) * 0.55), Math.min(1, color.y + (1 - color.y) * 0.55), Math.min(1, color.z + (1 - color.z) * 0.55))
        hlMat = this.mat(hlColor)
        const ridge = new CabinetKit()
        for (let q = 0; q < r.pts.length - 1; q++) {
          const a = r.pts[q]
          const b = r.pts[q + 1]
          const horizontal = a[1] === b[1]
          const off: [number, number, number] = horizontal ? [0, rad * 0.4, rad * 0.5] : [-rad * 0.4, 0, rad * 0.5]
          ridge.cyl([a[0] + off[0], a[1] + off[1], WIRE_Z + off[2]], [b[0] + off[0], b[1] + off[1], WIRE_Z + off[2]], rad * 0.28, rad * 0.28, 5, RC.white, false, false)
        }
        this.addMesh(this.obj(wso, "Ridge"), ridge.build(), hlMat)
      } else {
        this.polyline(wso, r.pts, this.wireThicknessCm, WIRE_Z, [wm])
      }
      // Focus copy: cyan, thicker, hidden until this wire is the current step's wire.
      const fso = this.obj(root, "WireFocus_" + w.id + "_" + i)
      const fm = this.mat(PALETTE.wireFocus)
      this.polyline(fso, r.pts, this.wireThicknessCm * FOCUS_THICKNESS, FOCUS_Z, [fm])
      fso.enabled = false
      this.wireBase[i] = {mat: wm, color, focusSO: fso, focusMat: fm, hlMat, hlColor}
    })
    this.applyWireFocus()
    if (real) this.buildTies(root, netlist)

    // Probe markers (hidden until a point is active)
    this.probeTest = this.sphere(root, "Probe_Test", [0, 0], 1.0, 2.0, PALETTE.probeTest, true)
    this.probeRef = this.sphere(root, "Probe_Ref", [0, 0], 1.0, 2.0, PALETTE.probeRef, true)
    this.paint((this.probeTest.getComponent("Component.RenderMeshVisual") as RenderMeshVisual).mainMaterial, PALETTE.probeTest)
    this.paint((this.probeRef.getComponent("Component.RenderMeshVisual") as RenderMeshVisual).mainMaterial, PALETTE.probeRef)
    this.probeTest.enabled = false
    this.probeRef.enabled = false

    this.setS1("UP")
  }

  // ── Queries used by Main / PartTags ───────────────────────────────────────

  /** Local position of a test point / terminal (front surface). */
  getPointPos(pointId: string): vec3 {
    const p = POINTS[pointId]
    if (p) return new vec3(p[0], p[1], 1.8)
    const b = this.partBoxes[pointId]
    if (b) return new vec3(b.c[0], b.c[1], b.zFront + 0.3)
    return new vec3(0, 0, 2)
  }

  /**
   * Where the "Expected …" tag goes for a point: beside it, never on the component, inside the
   * board, and left of the step card (which floats over the board's right third).
   */
  getExpectedTagPos(pointId: string): vec3 {
    const tx = LAYOUT.terminalX[pointId]
    if (tx !== undefined) return new vec3(Math.min(tx + 3.8, -3.5), 9.6, 5.6) // above the rail, below PS1
    const p = this.getPointPos(pointId)
    if (pointId.indexOf("F") === 0) return new vec3(-17.0, p.y, 3.0) // left of the fuse row
    return new vec3(-16.5, p.y, 3.0) // left of the switch/lamp strip
  }

  /** Where the small result badge goes for a point (same side as its expected tag). */
  getBadgePos(pointId: string): vec3 {
    const tx = LAYOUT.terminalX[pointId]
    if (tx !== undefined) return new vec3(tx, 8.9, 5.4)
    const p = this.getPointPos(pointId)
    if (pointId.indexOf("F") === 0) return new vec3(-15.9, p.y, 3.0)
    return new vec3(-15.4, p.y, 3.0)
  }

  /** ID tag per component: position, rotation (terminals are labeled vertically, as on the panel), info bubble spot. */
  getTagAnchors(): {id: string; pos: vec3; rotDeg: number; infoPos: vec3; strip?: {top: number; bottom: number; index: number}}[] {
    const out: {id: string; pos: vec3; rotDeg: number; infoPos: vec3; strip?: {top: number; bottom: number; index: number}}[] = []
    if (!this.netlist) return out
    const z = LAYOUT.tagZ
    for (const id of this.netlist.componentIds()) {
      const tx = LAYOUT.terminalX[id]
      if (id === "PS1") out.push({id, pos: new vec3(LAYOUT.ps1.c[0], LAYOUT.ps1.c[1] + 0.7, z.ps1), rotDeg: 0, infoPos: new vec3(0, 12.3, 6.0)})
      else if (tx !== undefined) {
        const half = LAYOUT.terminal.s[1] / 2
        out.push({id, pos: new vec3(tx, LAYOUT.terminal.y, z.terminal), rotDeg: 90, infoPos: new vec3(-6.0, 0.75, 5.0), strip: {top: LAYOUT.terminal.y + half, bottom: LAYOUT.terminal.y - half, index: parseInt(id.split("-")[1]) - 1}})
      }
      else if (LAYOUT.fuses[id]) out.push({id, pos: new vec3(LAYOUT.fuses[id][0], LAYOUT.fuses[id][1], z.fuse), rotDeg: 0, infoPos: new vec3(-12.0, -18.3, 3.0)})
      else if (LAYOUT.switchTagX[id] !== undefined) {
        const y = id === "S1" ? LAYOUT.s1[1] : LAYOUT.lamps[id][1]
        out.push({id, pos: new vec3(LAYOUT.switchTagX[id], y, z.plate), rotDeg: 0, infoPos: new vec3(-6.0, -7.4, 3.0)})
      }
    }
    return out
  }

  getWireLabels(): {name: string; text: string; pos: vec3; isReturn: boolean}[] {
    const out: {name: string; text: string; pos: vec3; isReturn: boolean}[] = []
    if (!this.netlist) return out
    const nl = this.netlist
    nl.data.wires.forEach((w, i) => {
      const r = ROUTES[w.from + ">" + w.to]
      if (!r) return
      out.push({name: "WireLabel_" + w.id + "_" + i, text: w.id, pos: new vec3(r.label[0], r.label[1], 1.6), isReturn: nl.isReturnWire(i)})
    })
    return out
  }

  /** Footnote along the board's bottom edge listing netlist wires not drawn on the panel (as in the image). */
  getBoardNote(): {text: string; pos: vec3} | null {
    if (!this.netlist) return null
    const nl = this.netlist
    const missing: string[] = []
    nl.data.wires.forEach((w) => {
      if (!ROUTES[w.from + ">" + w.to]) missing.push(nl.display(w.from) + " → " + w.id + " → " + nl.display(w.to))
    })
    if (missing.length === 0) return null
    return {text: "Not drawn: " + missing.join(", ") + " (see schematic)", pos: new vec3(2.0, -21.35, 0.3)}
  }

  /**
   * The spots the technician has to reach or read, in cabinet-local cm: the TS-4 / F1 IN / F1 OUT / L1+ probe points,
   * the L1 lamp and the S1 toggle. Labels must stay off these (a label may sit on its own part's body).
   */
  getKeyAreas(): {id: string; cx: number; cy: number; w: number; h: number}[] {
    const out: {id: string; cx: number; cy: number; w: number; h: number}[] = []
    const ts4 = this.probeOffset("TS-4")
    out.push({id: "TS-4 probe point", cx: ts4.x, cy: ts4.y, w: 2.0, h: 2.0})
    for (const id of ["F1:IN", "F1:OUT", "L1:+"]) {
      const p = POINTS[id]
      out.push({id: id + " probe point", cx: p[0], cy: p[1], w: 2.0, h: 2.0})
    }
    out.push({id: "L1 lamp", cx: LAYOUT.lamps.L1[0], cy: LAYOUT.lamps.L1[1], w: 1.6, h: 1.6})
    out.push({id: "S1 toggle", cx: LAYOUT.s1[0], cy: LAYOUT.s1[1], w: 3.4, h: 3.0})
    return out
  }

  /** Board extents in cabinet-local cm (for tests). */
  getBoardHalfSize(): vec2 {
    return new vec2(LAYOUT.board.w / 2, LAYOUT.board.h / 2)
  }

  /**
   * Every position other parts depend on (points, part boxes, tag anchors, expected / badge spots, wire routes and labels, key areas),
   * rounded to 0.001 cm, as one JSON string. The realistic-look work must not change it: a test compares it with a recorded baseline.
   */
  geometrySnapshot(): string {
    const r = (n: number): number => Math.round(n * 1000) / 1000
    const v = (p: vec3): number[] => [r(p.x), r(p.y), r(p.z)]
    const out: any = {points: {}, boxes: {}, anchors: [], expected: {}, badges: {}, routes: ROUTES, wireLabels: [], keyAreas: [], half: []}
    for (const id of Object.keys(POINTS).sort()) out.points[id] = v(this.getPointPos(id))
    for (const id of Object.keys(this.partBoxes).sort()) {
      const b = this.partBoxes[id]
      out.boxes[id] = [r(b.c[0]), r(b.c[1]), r(b.w), r(b.h), r(b.zFront)]
    }
    for (const a of this.getTagAnchors()) out.anchors.push({id: a.id, pos: v(a.pos), rot: a.rotDeg, info: v(a.infoPos), strip: a.strip ? [r(a.strip.top), r(a.strip.bottom), a.strip.index] : null})
    const ids = Object.keys(this.partBoxes).sort()
    for (const id of ids) {
      out.expected[id] = v(this.getExpectedTagPos(id))
      out.badges[id] = v(this.getBadgePos(id))
    }
    for (const w of this.getWireLabels()) out.wireLabels.push({name: w.name, text: w.text, pos: v(w.pos), ret: w.isReturn})
    for (const k of this.getKeyAreas()) out.keyAreas.push([k.id, r(k.cx), r(k.cy), r(k.w), r(k.h)])
    const hs = this.getBoardHalfSize()
    out.half = [r(hs.x), r(hs.y)]
    const note = this.getBoardNote()
    out.note = note ? v(note.pos) : null
    out.wireCount = Object.keys(this.wireBase).length
    return JSON.stringify(out)
  }

  // ── Visual state driven by Main ───────────────────────────────────────────

  /** "none" | "amber" | "active" | "green" | "red" */
  setOutline(id: string, state: string): void {
    const b = this.partBoxes[id]
    if (!b) return
    let o = this.outlines[id]
    if (!o) {
      const so = this.obj(this.sceneObject, "Outline_" + id)
      const mats: Material[] = []
      // Terminals are 2 cm apart, so their outline hugs the part instead of reaching onto the neighbor's label.
      const margin = LAYOUT.terminalX[id] !== undefined ? 0.4 : 1.0
      this.rectFrame(so, b.c, b.w + margin, b.h + margin, 0.22, b.zFront + 0.15, PALETTE.outlineAmber, mats)
      o = {so, mats}
      this.outlines[id] = o
    }
    this.outlineStates[id] = state
    if (state === "none") {
      o.so.enabled = false
      return
    }
    o.so.enabled = true
    const col =
      state === "active" ? PALETTE.outlineActive : state === "green" ? PALETTE.outlineGreen : state === "red" ? PALETTE.outlineRed : PALETTE.outlineAmber
    for (const m of o.mats) this.paint(m, col)
  }

  clearOutlines(): void {
    for (const id of Object.keys(this.outlines)) this.setOutline(id, "none")
  }

  /** Trace overlay for one netlist wire index: "hidden" | "active" | "green" | "gray" | "red" */
  setTrace(wireIndex: number, state: string): void {
    if (!this.netlist) return
    const w = this.netlist.data.wires[wireIndex]
    if (!w) return
    let t = this.traces[wireIndex]
    if (!t) {
      const r = ROUTES[w.from + ">" + w.to]
      if (!r) return
      const so = this.obj(this.sceneObject, "Trace_" + w.id + "_" + wireIndex)
      const mats: Material[] = []
      const segMats: Material[] = []
      for (let k = 0; k < r.pts.length - 1; k++) {
        const m = this.baseMaterial.clone()
        mats.push(m)
        segMats.push(m)
      }
      this.polyline(so, r.pts, this.traceThicknessCm, TRACE_Z, segMats)
      t = {so, mats}
      this.traces[wireIndex] = t
    }
    this.traceStates[w.id] = state
    if (state === "hidden") {
      t.so.enabled = false
      return
    }
    const isFocus = this.focusWire === wireIndex
    // The current wire in the plain "active" state is the cyan focus wire itself (no extra trace over it).
    if (isFocus && state === "active") {
      t.so.enabled = false
      return
    }
    t.so.enabled = true
    // Fault red, good green and untested gray keep their colors; only wires that are not the current step's are dimmed.
    const col =
      state === "green" ? PALETTE.traceGreen : state === "gray" ? PALETTE.traceGray : state === "red" ? PALETTE.traceRed : PALETTE.traceActive
    for (const m of t.mats) this.paint(m, isFocus ? col : this.dim(col))
  }

  // ── Wire focus: the current step's wire is bright cyan and 1.5x thicker; every other wire is dimmed to 30% ──

  private wireBase: {[wireIndex: number]: {mat: Material; color: vec4; focusSO: SceneObject; focusMat: Material; hlMat?: Material; hlColor?: vec4}} = {}
  private focusWire = -1

  private dim(c: vec4): vec4 {
    return new vec4(c.x, c.y, c.z, c.w * DIM_WIRE_ALPHA)
  }

  /** Netlist wire index of the current step's wire (-1 = none: every wire dimmed). Call before setTrace. */
  setFocusWire(wireIndex: number): void {
    this.focusWire = wireIndex
    this.applyWireFocus()
  }

  private applyWireFocus(): void {
    for (const k of Object.keys(this.wireBase)) {
      const i = parseInt(k)
      const b = this.wireBase[i]
      const focus = i === this.focusWire
      // Set directly (not through paint): the model's wires are not overlays, so the Hide / Show display fade leaves them alone.
      const set = (m: Material, c: vec4) => {
        m.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto
        m.mainPass.baseColor = new vec4(c.x * c.w, c.y * c.w, c.z * c.w, c.w)
      }
      const bodyAlpha = b.hlMat ? this.wireBodyAlpha : DIM_WIRE_ALPHA
      set(b.mat, new vec4(b.color.x, b.color.y, b.color.z, b.color.w * bodyAlpha))
      if (b.hlMat && b.hlColor) set(b.hlMat, new vec4(b.hlColor.x, b.hlColor.y, b.hlColor.z, b.hlColor.w * bodyAlpha))
      set(b.focusMat, PALETTE.wireFocus)
      b.focusSO.enabled = focus
    }
  }

  hideTraces(): void {
    for (const k of Object.keys(this.traces)) this.setTrace(parseInt(k), "hidden")
  }

  /** Probe markers on the active test point and on the meter reference (black lead). */
  setActivePoint(pointId: string | null, refPointId: string | null): void {
    this.activePointId = pointId ? pointId : ""
    if (!this.probeTest || !this.probeRef) return
    if (!pointId) {
      this.probeTest.enabled = false
      this.probeRef.enabled = false
      return
    }
    this.probeTest.enabled = true
    this.probeTest.getTransform().setLocalPosition(this.probeOffset(pointId))
    if (refPointId) {
      this.probeRef.enabled = true
      this.probeRef.getTransform().setLocalPosition(this.probeOffset(refPointId))
    } else {
      this.probeRef.enabled = false
    }
  }

  // ── Overlay fade (traces, outlines, probe markers) for the Hide / Show display control ──

  private overlayAlpha = 1
  private overlayBase = new Map<Material, vec4>()

  /** Colors an overlay material and remembers the color so fadeOverlays can scale its alpha. */
  private paint(m: Material, col: vec4): void {
    if (!this.overlayBase.has(m)) m.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto
    this.overlayBase.set(m, col)
    const a = col.w * this.overlayAlpha
    m.mainPass.baseColor = new vec4(col.x * a, col.y * a, col.z * a, a)
  }

  /** 0..1: scales the alpha of every trace, outline and probe marker; the state behind them is untouched. */
  fadeOverlays(alpha: number): void {
    this.overlayAlpha = alpha
    this.overlayBase.forEach((col, m) => {
      const a = col.w * alpha
      m.mainPass.baseColor = new vec4(col.x * a, col.y * a, col.z * a, a)
    })
  }

  get overlayOpacity(): number {
    return this.overlayAlpha
  }

  setLamp(id: string, lit: boolean): void {
    const l = this.lamps[id]
    if (!l) return
    this.lampLit[id] = lit
    const real = this.realisticLook && !!this.vertexMaterial
    const on = real ? AMBER_ON : id === "L1" ? PALETTE.l1On : PALETTE.l2On
    const off = real ? AMBER_OFF : id === "L1" ? PALETTE.l1Off : PALETTE.l2Off
    l.mat.mainPass.baseColor = lit ? on : off
    l.glow.enabled = lit
  }

  /** "UP" | "DOWN" — moves the lever only; Main decides what lights. */
  setS1(position: string): void {
    this.s1Position = position
    if (!this.leverPivot) return
    const a = ((position === "UP" ? -1 : 1) * this.leverAngleDeg * Math.PI) / 180
    this.leverPivot.getTransform().setLocalRotation(quat.fromEulerAngles(a, 0, 0))
  }

  // ── Builders ──────────────────────────────────────────────────────────────

  private terminalColor(id: string): vec4 {
    const nl = this.netlist as Netlist
    let wired = false
    let ret = false
    nl.data.wires.forEach((w, i) => {
      if (nl.baseId(w.from) === id || nl.baseId(w.to) === id) {
        wired = true
        if (nl.isReturnWire(i)) ret = true
      }
    })
    if (!wired) return PALETTE.termSpare
    return ret ? PALETTE.termReturn : PALETTE.termSupply
  }

  private probeOffset(pointId: string): vec3 {
    if (LAYOUT.terminalX[pointId] !== undefined) return new vec3(LAYOUT.terminalX[pointId], LAYOUT.terminal.y - 3.0, 2.2)
    return this.getPointPos(pointId).add(new vec3(0, 0, 0.6))
  }

  private buildLamp(root: SceneObject, id: string, offColor: vec4): void {
    if (!this.netlist || !this.netlist.component(id)) return
    const p = LAYOUT.lamps[id]
    const real = this.realisticLook && !!this.vertexMaterial
    let so: SceneObject
    if (real) {
      // Round lens: a dome (r 0.68, front at z 1.93) in a steel bezel (the bezel is in the static mesh); uniform color so setLamp can recolor it.
      so = this.obj(root, "Lamp_" + id)
      so.getTransform().setLocalPosition(new vec3(p[0], p[1], 1.25))
      const dome = new CabinetKit()
      dome.dome([0, 0, 0], [0, 0, 1], 0.68, RC.white, 16, 6)
      const lm = this.baseMaterial.clone()
      lm.mainPass.baseColor = AMBER_OFF
      this.addMesh(so, dome.build(), lm)
    } else {
      so = this.sphere(root, "Lamp_" + id, p, 1.3, 1.25, offColor, true)
    }
    const rmv = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    const mat = rmv.mainMaterial
    const glow = this.sphere(so, "Glow", [0, 0], 1.0, 0, !real && id === "L1" ? c4(0.3, 0.8, 0.3) : c4(0.8, 0.5, 0.1), true)
    // Realistic: a thin halo disc behind the bezel (visible as a glowing ring around it); the lens itself turns bright via setLamp.
    glow.getTransform().setLocalPosition(real ? new vec3(0, 0, -0.3) : new vec3(0, 0, 0))
    glow.getTransform().setLocalScale(real ? new vec3(2.5, 2.5, 0.2) : new vec3(2.0, 2.0, 1.2))
    glow.enabled = false
    this.lamps[id] = {mat, glow}
    this.partBoxes[id] = {c: p, w: 1.3, h: 1.3, zFront: 1.9}
    this.lampLit[id] = false
  }

  private buildS1(root: SceneObject): void {
    if (!this.netlist || !this.netlist.component("S1")) return
    const p = LAYOUT.s1
    const real = this.realisticLook && !!this.vertexMaterial
    if (!real) this.box(root, "S1_Base", p, [1.0, 1.0, 0.6], 1.1, PALETTE.s1) // realistic: the hex nut and collar are in the static mesh
    // Collider wrapper: unit scale, identity rotation; big pinch target.
    const toggle = this.obj(root, "S1_Toggle")
    toggle.getTransform().setLocalPosition(new vec3(p[0], p[1], 1.9))
    const col = toggle.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    shape.size = new vec3(3.4, 3.0, 3.0)
    col.shape = shape
    col.fitVisual = false // UIKit sets this on its own colliders; the default (true) re-fits to child visuals
    col.debugDrawEnabled = this.debugColliders
    this.leverPivot = this.obj(toggle, "S1_LeverPivot")
    this.leverPivot.getTransform().setLocalPosition(new vec3(0, 0, -0.5))
    const lever = this.obj(this.leverPivot, "S1_Lever")
    if (real) {
      // A real toggle: a tapered round lever (2.4 cm) with a ball tip; it flips UP/DOWN by rotating the pivot, as before.
      lever.getTransform().setLocalPosition(new vec3(0, 0, 1.2))
      lever.getTransform().setLocalScale(new vec3(1, 1, 1))
      const lk = new CabinetKit()
      lk.cyl([0, 0, -1.2], [0, 0, 1.2], 0.32, 0.2, 14, RC.chrome)
      lk.cyl([-0.09, 0.12, -1.1], [-0.06, 0.09, 1.1], 0.05, 0.04, 5, RC.white) // chrome highlight stripe
      this.addMesh(lever, lk.build(), this.vertexMaterial)
      const tip = this.obj(this.leverPivot, "S1_LeverTip")
      tip.getTransform().setLocalPosition(new vec3(0, 0, 2.55))
      const tk = new CabinetKit()
      tk.sphere([0, 0, 0], 0.45, RC.chrome, 14, 9)
      this.addMesh(tip, tk.build(), this.vertexMaterial)
    } else {
      lever.getTransform().setLocalPosition(new vec3(0, 0, 0.9))
      lever.getTransform().setLocalScale(new vec3(0.4, 0.4, 1.8))
      this.addMesh(lever, this.boxMesh, this.mat(PALETTE.s1))
      const tip = this.obj(this.leverPivot, "S1_LeverTip")
      tip.getTransform().setLocalPosition(new vec3(0, 0, 1.85))
      tip.getTransform().setLocalScale(new vec3(0.6, 0.6, 0.6))
      this.addMesh(tip, this.sphereMesh, this.mat(c4(0.9, 0.9, 0.95)))
    }
    this.partBoxes["S1"] = {c: p, w: 1.6, h: 2.0, zFront: 1.6}

    const interactable = toggle.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onTriggerEnd.add(() => {
      const next = this.s1Position === "UP" ? "DOWN" : "UP"
      this.setS1(next)
      this._onS1Toggled.invoke(next)
    })
  }

  // ── Realistic look: static parts built with the kit (one vertex-colored mesh; positions come from LAYOUT / POINTS, never changed) ──

  /** A Phillips screw head facing +Z at (x, y, z). */
  private kitScrew(kit: CabinetKit, x: number, y: number, z: number, r: number): void {
    kit.cyl([x, y, z], [x, y, z + 0.12], r, r * 0.92, 10, RC.screw)
    kit.box(x, y, z + 0.135, r * 1.5, r * 0.26, 0.03, RC.slot)
    kit.box(x, y, z + 0.135, r * 0.26, r * 1.5, 0.03, RC.slot)
  }

  /** Gray steel enclosure with depth, galvanized backplate, flange lips, brass corner bosses and the hinge side (door swung out of view). */
  private kitShell(kit: CabinetKit, bw: number, bh: number, fr: number, wd: number): void {
    const zc = wd / 2 - 1 // walls span z -1 .. wd-1, as the original frame
    kit.box(0, 0, -0.85, bw, bh, 1.5, RC.steelMid)
    // Galvanized backplate (speckled spangle) with a darker edge strip and four mounting screws.
    const pw = bw - 2 * fr
    const ph = bh - 2 * fr
    const e = 0.35
    kit.box(0, 0, -0.05, pw, ph, 0.1, RC.galv, undefined, ["pz"])
    kit.speckle(-pw / 2, -ph / 2, pw / 2, ph / 2, 0.0, 60, 60, RC.galv, 0.1, 7)
    kit.box(0, ph / 2 - e / 2, 0.04, pw, e, 0.08, RC.plateEdge)
    kit.box(0, -ph / 2 + e / 2, 0.04, pw, e, 0.08, RC.plateEdge)
    kit.box(-pw / 2 + e / 2, 0, 0.04, e, ph - 2 * e, 0.08, RC.plateEdge)
    kit.box(pw / 2 - e / 2, 0, 0.04, e, ph - 2 * e, 0.08, RC.plateEdge)
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) this.kitScrew(kit, sx * (pw / 2 - 1.3), sy * (ph / 2 - 1.3), 0.1, 0.55)
    // Walls (the inner faces get the darker/lighter shading from the baked light, which gives the depth).
    kit.box(0, bh / 2 - fr / 2, zc, bw, fr, wd, RC.steel, {pz: RC.steelLight})
    kit.box(0, -bh / 2 + fr / 2, zc, bw, fr, wd, RC.steel, {pz: RC.steelLight})
    kit.box(-bw / 2 + fr / 2, 0, zc, fr, bh - 2 * fr, wd, RC.steel, {pz: RC.steelLight})
    kit.box(bw / 2 - fr / 2, 0, zc, fr, bh - 2 * fr, wd, RC.steel, {pz: RC.steelLight})
    // Inner flange lip (0.5 cm), flush with the front rim.
    const lip = 0.5
    const lz = wd - 1 - 0.15
    kit.box(0, bh / 2 - fr - lip / 2, lz, bw - 2 * fr, lip, 0.3, RC.steelLight)
    kit.box(0, -bh / 2 + fr + lip / 2, lz, bw - 2 * fr, lip, 0.3, RC.steelLight)
    kit.box(-bw / 2 + fr + lip / 2, 0, lz, lip, bh - 2 * fr - 2 * lip, 0.3, RC.steelLight)
    kit.box(bw / 2 - fr - lip / 2, 0, lz, lip, bh - 2 * fr - 2 * lip, 0.3, RC.steelLight)
    // Brass corner bosses on the front rim.
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) kit.cyl([sx * (bw / 2 - fr / 2), sy * (bh / 2 - fr / 2), wd - 1], [sx * (bw / 2 - fr / 2), sy * (bh / 2 - fr / 2), wd - 1 + 0.14], 0.44, 0.4, 10, RC.brass)
    // Hinge side (left): frame leaf, door-side leaf stub with screws, a knuckle barrel and a pin head at each end. The door itself is out of view.
    const hx = -bw / 2 - 0.8
    for (const hy of [bh / 3, -bh / 3]) {
      kit.box(hx + 0.85, hy, wd - 1.5, 1.3, 5.8, 0.45, RC.steelMid, {pz: RC.steel})
      kit.box(hx - 0.95, hy, wd - 1.45, 1.9, 5.8, 0.45, RC.steelMid, {pz: RC.steel})
      kit.cyl([hx, hy - 2.9, wd - 1.9], [hx, hy + 2.9, wd - 1.9], 0.72, 0.72, 14, RC.steelLight)
      kit.cyl([hx, hy + 2.9, wd - 1.9], [hx, hy + 3.7, wd - 1.9], 0.34, 0.34, 8, RC.screw)
      kit.cyl([hx, hy - 2.9, wd - 1.9], [hx, hy - 3.5, wd - 1.9], 0.34, 0.34, 8, RC.screw)
      for (const dy of [-1.9, 1.9]) this.kitScrew(kit, hx - 1.05, hy + dy, wd - 1.22, 0.3)
    }
    // Nameplate on the backplate's top margin (above PS1): "MWNP 1.0 - 12 VDC Trainer Panel", text at least 1.0 cm tall in the real world.
    const ny = 20.6
    kit.box(0, ny, 0.3, 20.6, 1.6, 0.3, RC.nameplate, {pz: lighten(RC.nameplate, 0.08)})
    kit.box(0, ny + 0.74, 0.47, 20.6, 0.1, 0.04, lighten(RC.nameplate, 0.45))
    for (const sx of [-1, 1]) kit.cyl([sx * 10.0, ny, 0.45], [sx * 10.0, ny, 0.52], 0.18, 0.16, 8, RC.screw)
    const em = Math.max(1.0, 1.0 / Math.max(0.05, this.sceneObject.getTransform().getWorldScale().y))
    this.kitText(this.sceneObject, "Nameplate", "MWNP 1.0 - 12 VDC Trainer Panel", [0, ny, 0.52], em, 19.8, new vec4(1, 1, 1, 1))
  }

  /** A single-line text on the model (depth-tested), centered at pos, em height in cabinet cm. */
  private kitText(parent: SceneObject, name: string, text: string, pos: [number, number, number], em: number, width: number, color: vec4): void {
    const so = this.obj(parent, name)
    so.getTransform().setLocalPosition(new vec3(pos[0], pos[1], pos[2]))
    const t = so.createComponent("Component.Text") as Text
    t.text = text
    t.depthTest = true
    t.size = em * 43.886
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-width / 2, width / 2, -em, em)
    t.textFill.color = color
  }

  /** PS1 as a DIN-rail power supply: perforated metal front, a "12 VDC" label plate, a green status LED and two terminal stubs. */
  private kitPs1(kit: CabinetKit): void {
    const ps = LAYOUT.ps1
    const frontZ = ps.z + ps.s[2] / 2 // 5.0
    kit.box(ps.c[0], ps.c[1] + 0.2, frontZ + 0.02, ps.s[0] - 1.0, ps.s[1] - 1.2, 0.04, RC.ps1Face)
    for (let r = 0; r < 6; r++) for (let c = 0; c < 22; c++) kit.disc([ps.c[0] - 8.8 + c * 0.84, ps.c[1] + 3.7 - r * 0.88, frontZ + 0.045], [0, 0, 1], 0.27, 8, RC.vent)
    kit.box(ps.c[0] + 5.8, ps.c[1] - 1.9, frontZ + 0.05, 6.6, 2.0, 0.04, RC.label)
    kit.cyl([ps.c[0] - 6.0, ps.c[1] - 1.5, frontZ + 0.04], [ps.c[0] - 6.0, ps.c[1] - 1.5, frontZ + 0.14], 0.34, 0.3, 10, RC.led)
    // Terminal stubs below the body at PS1:+ / PS1:- (the wires leave from behind them, at the same points as before).
    const stubs: [number, vec4][] = [[POINTS["PS1:+"][0], PALETTE.wireSupply], [POINTS["PS1:-"][0], PALETTE.wireReturn]]
    for (const [x, col] of stubs) {
      const y = POINTS["PS1:+"][1] - 0.5
      kit.box(x, y, 2.0, 1.7, 0.9, 3.0, RC.termBody)
      kit.cyl([x, y, 3.5], [x, y, 3.62], 0.5, 0.46, 10, fromLegacy(col))
      kit.box(x, y, 3.635, 0.75, 0.14, 0.03, RC.slot)
    }
    const em = Math.max(1.0, 1.0 / Math.max(0.05, this.sceneObject.getTransform().getWorldScale().y))
    this.kitText(this.sceneObject, "PS1_Label", "12 VDC", [ps.c[0] + 5.8, ps.c[1] - 1.9, frontZ + 0.08], em, 6.2, new vec4(0.25, 0.27, 0.32, 1))
  }

  /** Silver DIN rail: raised lips, a darker center groove and mounting slots. */
  private kitRail(kit: CabinetKit): void {
    const r = LAYOUT.rail
    kit.box(r.c[0], r.c[1], r.z, r.s[0], r.s[1], r.s[2], RC.rail)
    kit.box(r.c[0], r.c[1] + 0.74, 1.05, r.s[0], 0.22, 0.1, lighten(RC.rail, 0.3))
    kit.box(r.c[0], r.c[1] - 0.74, 1.05, r.s[0], 0.22, 0.1, lighten(RC.rail, 0.3))
    kit.box(r.c[0], r.c[1], 1.03, r.s[0], 0.5, 0.04, RC.railDark)
    for (let i = 0; i < 12; i++) kit.box(r.c[0] - r.s[0] / 2 + 1.6 + i * 2.9, r.c[1], 1.06, 1.4, 0.26, 0.02, RC.slot)
  }

  /** A gray terminal block: separator ribs, a color-coded marker strip (supply red / return blue / spare white) and two Phillips screws. */
  private kitTerminal(kit: CabinetKit, id: string, x: number): void {
    const t = LAYOUT.terminal
    const col = this.terminalColor(id)
    const fz = t.z + t.s[2] / 2 // 4.0
    kit.box(x - t.s[0] / 2, t.y, t.z, 0.08, t.s[1], t.s[2] + 0.02, RC.slot)
    kit.box(x, t.y, fz + 0.03, t.s[0] - 0.1, 0.9, 0.06, fromLegacy(col))
    this.kitScrew(kit, x, t.y + 1.35, fz, 0.52)
    this.kitScrew(kit, x, t.y - 1.35, fz, 0.52)
  }

  /** Light galvanized switch / lamp plate with plugged holes and an end screw; amber pilot-lamp bezels; the chrome toggle's washer, hex nut and collar. */
  private kitSwitchPlate(kit: CabinetKit): void {
    const sp = LAYOUT.switchPlate
    const frontZ = sp.z + sp.s[2] / 2 // 0.8
    kit.box(sp.c[0], sp.c[1], sp.z, sp.s[0], sp.s[1], sp.s[2], RC.galvLight, undefined, ["pz"])
    kit.speckle(sp.c[0] - sp.s[0] / 2, sp.c[1] - sp.s[1] / 2, sp.c[0] + sp.s[0] / 2, sp.c[1] + sp.s[1] / 2, frontZ, 50, 10, RC.galvLight, 0.07, 11)
    this.kitScrew(kit, sp.c[0] + sp.s[0] / 2 - 0.9, sp.c[1] + 1.2, frontZ, 0.3)
    LAYOUT.holes.rows.forEach((y) => {
      for (let col = 0; col < LAYOUT.holes.cols; col++) {
        const x = LAYOUT.holes.x0 + col * LAYOUT.holes.dx
        kit.cyl([x, y, 0.8], [x, y, 0.86], 0.52, 0.5, 10, RC.holeRing)
        kit.cyl([x, y, 0.86], [x, y, 0.92], 0.34, 0.3, 10, RC.holePlug)
      }
    })
    for (const id of Object.keys(LAYOUT.lamps)) {
      if (this.netlist && !this.netlist.component(id)) continue
      const p = LAYOUT.lamps[id]
      kit.cyl([p[0], p[1], 0.8], [p[0], p[1], 1.4], 0.8, 0.74, 16, RC.chrome)
      kit.sphere([p[0] - 0.24, p[1] + 0.28, 1.84], 0.13, RC.white, 6, 4)
    }
    if (this.netlist && this.netlist.component("S1")) {
      const p = LAYOUT.s1
      kit.cyl([p[0], p[1], 0.8], [p[0], p[1], 0.92], 0.86, 0.86, 16, RC.chrome)
      kit.cyl([p[0], p[1], 0.92], [p[0], p[1], 1.3], 0.75, 0.75, 6, RC.chrome)
      kit.cyl([p[0], p[1], 1.3], [p[0], p[1], 1.6], 0.45, 0.4, 12, RC.chrome)
    }
  }

  /** Light galvanized fuse plate with the six empty fuse slots cut out, and end screws. */
  private kitFusePlate(kit: CabinetKit): void {
    const fp = LAYOUT.fusePlate
    const frontZ = fp.z + fp.s[2] / 2
    kit.box(fp.c[0], fp.c[1], fp.z, fp.s[0], fp.s[1], fp.s[2], RC.galvLight, undefined, ["pz"])
    kit.speckle(fp.c[0] - fp.s[0] / 2, fp.c[1] - fp.s[1] / 2, fp.c[0] + fp.s[0] / 2, fp.c[1] + fp.s[1] / 2, frontZ, 58, 14, RC.galvLight, 0.07, 19)
    for (const x of LAYOUT.openFuseX) {
      kit.box(x, fp.c[1], frontZ + 0.01, LAYOUT.fuseSize[0], LAYOUT.fuseSize[1], 0.02, RC.slot)
      kit.box(x, fp.c[1] + LAYOUT.fuseSize[1] / 2 - 0.2, frontZ + 0.02, LAYOUT.fuseSize[0] - 0.3, 0.12, 0.02, RC.holeRing)
    }
    this.kitScrew(kit, fp.c[0] + fp.s[0] / 2 - 0.9, fp.c[1] + 2.2, frontZ, 0.3)
  }

  /** A glass cartridge fuse seated in two clips: glass body, brass end caps, filament, steel clips and wire lugs. The Part_ box is the plate-colored base. */
  private kitFuse(kit: CabinetKit, c: V2): void {
    const x = c[0]
    const y = c[1]
    const z = 2.3
    kit.cyl([x, y - 1.1, z], [x, y + 1.1, z], 0.5, 0.5, 14, RC.glass)
    kit.cyl([x, y - 1.45, z], [x, y - 1.1, z], 0.52, 0.52, 12, RC.brass)
    kit.cyl([x, y + 1.1, z], [x, y + 1.45, z], 0.52, 0.52, 12, RC.brass)
    kit.box(x, y, z + 0.5, 0.1, 2.2, 0.05, RC.filament)
    kit.box(x - 0.2, y, z + 0.49, 0.06, 2.0, 0.04, RC.white)
    for (const dy of [-1.3, 1.3]) {
      kit.box(x, y + dy, 1.75, 1.3, 0.55, 0.9, RC.steelLight)
      kit.box(x, y + dy, 2.22, 0.9, 0.5, 0.06, RC.steel)
    }
    for (const dy of [-1.95, 1.95]) {
      kit.box(x, y + dy, 2.05, 0.55, 0.6, 0.2, RC.copper)
      kit.cyl([x, y + dy, 2.15], [x, y + dy, 2.25], 0.18, 0.16, 8, RC.screw)
    }
  }

  /** Puts the static kit mesh in the scene (one object, vertex-color material). */
  private finishKit(root: SceneObject, kit: CabinetKit): void {
    const so = this.obj(root, "CabinetStatic")
    this.addMesh(so, kit.build(), this.vertexMaterial)
  }

  /**
   * Small black cable ties along the wire runs (dark gray: nothing is black on the additive display). Long runs get several; where
   * parallel wires run side by side (within 1.6 cm) one wider tie bundles them. Static, opaque; the wire centerlines are not touched.
   */
  private buildTies(root: SceneObject, netlist: Netlist): void {
    interface Seg {
      w: number
      a: V2
      b: V2
      horiz: boolean
      len: number
    }
    const segs: Seg[] = []
    netlist.data.wires.forEach((w, i) => {
      const r = ROUTES[w.from + ">" + w.to]
      if (!r) return
      for (let q = 0; q < r.pts.length - 1; q++) {
        const a = r.pts[q]
        const b = r.pts[q + 1]
        segs.push({w: i, a, b, horiz: a[1] === b[1], len: Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])})
      }
    })
    const rad = Math.max(0.22, this.wireThicknessCm * 0.75)
    const kit = new CabinetKit()
    const made: {[k: string]: boolean} = {}
    const fracs = (len: number): number[] => (len < 5 ? [] : len < 9 ? [0.5] : len < 20 ? [0.3, 0.7] : [0.15, 0.4, 0.65, 0.88])
    for (const s of segs) {
      for (const f of fracs(s.len)) {
        const px = s.a[0] + (s.b[0] - s.a[0]) * f
        const py = s.a[1] + (s.b[1] - s.a[1]) * f
        const mine = s.horiz ? py : px
        const along = s.horiz ? px : py
        let lo = mine
        let hi = mine
        let owner = s.w
        for (const o of segs) {
          if (o === s || o.horiz !== s.horiz) continue
          const lat = o.horiz ? o.a[1] : o.a[0]
          const o0 = o.horiz ? Math.min(o.a[0], o.b[0]) : Math.min(o.a[1], o.b[1])
          const o1 = o.horiz ? Math.max(o.a[0], o.b[0]) : Math.max(o.a[1], o.b[1])
          if (along < o0 || along > o1 || Math.abs(lat - mine) > 1.6) continue
          lo = Math.min(lo, lat)
          hi = Math.max(hi, lat)
          owner = Math.min(owner, o.w)
        }
        if (owner !== s.w) continue // the lowest wire index in the bundle makes the tie
        const key = (s.horiz ? "h" : "v") + Math.round(along * 2) + "_" + Math.round(lo * 4) + "_" + Math.round(hi * 4)
        if (made[key]) continue
        made[key] = true
        const span = hi - lo + 2 * rad + 0.2
        const mid = (lo + hi) / 2
        const th = 2 * rad + 0.2
        if (s.horiz) {
          kit.box(along, mid, WIRE_Z, 0.3, span, th, RC.tie)
          kit.box(along + 0.2, mid + span / 2 + 0.1, WIRE_Z + 0.05, 0.12, 0.45, 0.1, RC.tie) // the tail
        } else {
          kit.box(mid, along, WIRE_Z, span, 0.3, th, RC.tie)
          kit.box(mid + span / 2 + 0.1, along + 0.2, WIRE_Z + 0.05, 0.45, 0.12, 0.1, RC.tie)
        }
      }
    }
    this.addMesh(this.obj(root, "CableTies"), kit.build(), this.vertexMaterial)
  }

  /**
   * Cream sleeve markers: the twin of each wire's number label, on the wire near the end FAR from the existing label (which stays where it
   * is: the geometry lock). Empty unless the realistic look is on.
   */
  getWireSleeveEnds(): {wireName: string; text: string; pos: vec3}[] {
    const out: {wireName: string; text: string; pos: vec3}[] = []
    if (!this.netlist || !this.realisticLook || !this.vertexMaterial) return out
    this.netlist.data.wires.forEach((w, i) => {
      const r = ROUTES[w.from + ">" + w.to]
      if (!r) return
      const n = r.pts.length
      const dA = Math.hypot(r.label[0] - r.pts[0][0], r.label[1] - r.pts[0][1])
      const dB = Math.hypot(r.label[0] - r.pts[n - 1][0], r.label[1] - r.pts[n - 1][1])
      const atStart = dA > dB // the existing label is nearer the end of the wire, so the twin goes near its start
      const p0 = atStart ? r.pts[0] : r.pts[n - 1]
      const p1 = atStart ? r.pts[1] : r.pts[n - 2]
      // Walk along the route from that end and take the first spot that is clear of the key areas and of the other labels.
      const path: V2[] = atStart ? r.pts.slice() : r.pts.slice().reverse()
      const keys = this.getKeyAreas()
      const clear = (x: number, y: number): boolean => {
        for (const kA of keys) if (Math.abs(x - kA.cx) < kA.w / 2 + 1.7 && Math.abs(y - kA.cy) < kA.h / 2 + 1.1) return false
        for (const q of Object.keys(ROUTES)) if (Math.abs(x - ROUTES[q].label[0]) < 2.4 && Math.abs(y - ROUTES[q].label[1]) < 1.5) return false
        for (const t of Object.keys(LAYOUT.terminalX)) if (Math.abs(x - LAYOUT.terminalX[t]) < 1.6 && Math.abs(y - LAYOUT.terminal.y) < 3.4) return false
        return true
      }
      let chosen: V2 | null = null
      for (let dist = 1.9; dist <= 14 && !chosen; dist += 0.8) {
        let left = dist
        for (let q = 0; q < path.length - 1 && !chosen; q++) {
          const a = path[q]
          const b = path[q + 1]
          const len = Math.hypot(b[0] - a[0], b[1] - a[1])
          if (left <= len) {
            const f = left / Math.max(0.01, len)
            const x = a[0] + (b[0] - a[0]) * f
            const y = a[1] + (b[1] - a[1]) * f
            if (clear(x, y)) chosen = [x, y]
            break
          }
          left -= len
        }
      }
      if (chosen) out.push({wireName: "WireLabel_" + w.id + "_" + i, text: w.id, pos: new vec3(chosen[0], chosen[1], 1.6)})
      void p0
      void p1
    })
    return out
  }

  /** A component body that can later get an outline. */
  private part(parent: SceneObject, id: string, c: V2, s: [number, number, number], z: number, color: vec4): SceneObject {
    const so = this.box(parent, "Part_" + id, c, s, z, color)
    this.partBoxes[id] = {c, w: s[0], h: s[1], zFront: z + s[2] / 2}
    return so
  }

  private obj(parent: SceneObject, name: string): SceneObject {
    const so = global.scene.createSceneObject(name)
    so.setParent(parent)
    return so
  }

  private mat(color: vec4): Material {
    const key = color.x.toFixed(3) + "," + color.y.toFixed(3) + "," + color.z.toFixed(3) + "," + color.w.toFixed(3)
    let m = this.matCache[key]
    if (!m) {
      m = this.baseMaterial.clone()
      m.mainPass.baseColor = color
      this.matCache[key] = m
    }
    return m
  }

  private addMesh(so: SceneObject, mesh: RenderMesh, mat: Material): RenderMeshVisual {
    const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = mesh
    rmv.mainMaterial = mat
    return rmv
  }

  private box(parent: SceneObject, name: string, c: V2, s: [number, number, number], z: number, color: vec4, ownMat?: Material): SceneObject {
    const so = this.obj(parent, name)
    so.getTransform().setLocalPosition(new vec3(c[0], c[1], z))
    so.getTransform().setLocalScale(new vec3(s[0], s[1], s[2]))
    this.addMesh(so, this.boxMesh, ownMat ? ownMat : this.mat(color))
    return so
  }

  private sphere(parent: SceneObject, name: string, c: V2, d: number, z: number, color: vec4, ownMaterial: boolean = false): SceneObject {
    const so = this.obj(parent, name)
    so.getTransform().setLocalPosition(new vec3(c[0], c[1], z))
    so.getTransform().setLocalScale(new vec3(d, d, d))
    let m: Material
    if (ownMaterial) {
      m = this.baseMaterial.clone()
      m.mainPass.baseColor = color
    } else {
      m = this.mat(color)
    }
    this.addMesh(so, this.sphereMesh, m)
    return so
  }

  /** Axis-aligned polyline of thin boxes; one material per segment (or the first one reused). */
  private polyline(parent: SceneObject, pts: V2[], t: number, z: number, mats: Material[]): void {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k]
      const b = pts[k + 1]
      const cx = (a[0] + b[0]) / 2
      const cy = (a[1] + b[1]) / 2
      const w = Math.abs(b[0] - a[0]) + t
      const h = Math.abs(b[1] - a[1]) + t
      const m = mats.length > k ? mats[k] : mats[0]
      this.box(parent, "Seg" + k, [cx, cy], [w, h, t], z, PALETTE.wireSupply, m)
    }
  }

  /** Dashed rectangular outline (open fuse positions, as drawn on the panel). */
  private dashedRect(parent: SceneObject, c: V2, w: number, h: number, t: number, z: number, color: vec4): void {
    const dash = 0.45
    const gap = 0.3
    const sides: [V2, V2][] = [
      [[c[0] - w / 2, c[1] + h / 2], [c[0] + w / 2, c[1] + h / 2]],
      [[c[0] - w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] - h / 2]],
      [[c[0] - w / 2, c[1] - h / 2], [c[0] - w / 2, c[1] + h / 2]],
      [[c[0] + w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] + h / 2]],
    ]
    let k = 0
    for (const [a, b] of sides) {
      const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
      const n = Math.max(1, Math.floor((len + gap) / (dash + gap)))
      const step = len / n
      const horiz = a[1] === b[1]
      for (let i = 0; i < n; i++) {
        const mid = -len / 2 + step * (i + 0.5)
        const pos: V2 = horiz ? [(a[0] + b[0]) / 2 + mid, a[1]] : [a[0], (a[1] + b[1]) / 2 + mid]
        const size: [number, number, number] = horiz ? [Math.min(dash, step), t, t] : [t, Math.min(dash, step), t]
        this.box(parent, "Dash" + k++, pos, size, z, color)
      }
    }
  }

  /** Thin rectangular outline; collects per-bar materials into `mats` when given (for recoloring). */
  private rectFrame(parent: SceneObject, c: V2, w: number, h: number, t: number, z: number, color: vec4, mats: Material[] | null): void {
    const bars: [V2, [number, number, number]][] = [
      [[c[0], c[1] + h / 2], [w + t, t, t]],
      [[c[0], c[1] - h / 2], [w + t, t, t]],
      [[c[0] - w / 2, c[1]], [t, h + t, t]],
      [[c[0] + w / 2, c[1]], [t, h + t, t]],
    ]
    bars.forEach((bar, i) => {
      let m: Material
      if (mats) {
        m = this.baseMaterial.clone()
        m.mainPass.baseColor = color
        mats.push(m)
      } else {
        m = this.mat(color)
      }
      this.box(parent, "Bar" + i, bar[0], bar[1], z, color, m)
    })
  }
}
