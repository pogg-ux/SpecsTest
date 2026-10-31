// MWNPNetlist.ts — pure logic, no scene access.
//
// Owns: parsing Assets/MWNP/netlist.json and every query the agent makes
// against it (classification, thresholds, check_order steps, path, ratings,
// citations, display strings). Every circuit fact the Lens shows is derived
// here from the file — nothing about the MWNP circuit is hard-coded.
//
// Must not: touch SceneObjects, UI, or audio. Must not invent facts: if the
// file lacks something (e.g. TS-3 has no test_points entry), callers get null
// and report "no tolerance defined".

export interface NetComponent {
  id: string
  type: string
  description: string
  terminals?: string[]
  rating?: string
  voltage_tolerance?: string
}

export interface NetWire {
  id: string
  from: string
  to: string
  nominal: string
}

export interface NetFunction {
  control: string
  path: string[]
  load: string
  return: string
}

export interface NetPoint {
  condition?: string
  nominal_v?: number
  tolerance_pct?: number
  min_v?: number
  max_v?: number
  feeds?: string
  tolerance_source?: string
  note?: string
}

export interface NetFault {
  symptom: string
  isolates?: string
  suspects: string[]
  check_order: string[]
}

export interface NetlistData {
  machine: string
  description: string
  revision?: string
  supply_voltage?: string
  components: NetComponent[]
  wires: NetWire[]
  functions: {[key: string]: NetFunction}
  test_points: {
    reference: string
    tolerance_rule: string
    open_circuit_threshold_v: number
    reading_classification: {[key: string]: string}
    points: {[id: string]: NetPoint}
  }
  faults: NetFault[]
}

/** The four classes named in test_points.reading_classification. */
export type ReadingClass = "in_spec" | "open" | "unexplained" | "no_tolerance"

export interface CheckStep {
  index: number // 0-based position in check_order
  text: string // verbatim check_order entry
  pointId: string | null // test point named in the step ("TS-4", "F1:OUT", "L1:+")
  question: string // text before the conclusion
  conclusion: string // "If no: ..." text (or the text after "but ...:")
  isLoadOffCheck: boolean // "12 V at L1:+ but lamp off: ..." style step
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export class Netlist {
  readonly data: NetlistData

  constructor(data: NetlistData) {
    this.data = data
  }

  static parse(json: string): Netlist {
    return new Netlist(JSON.parse(json) as NetlistData)
  }

  // ── Identity / display ────────────────────────────────────────────────────

  /** "F1:IN" -> "F1", "TS-4" -> "TS-4". */
  baseId(pointOrEnd: string): string {
    const i = pointOrEnd.indexOf(":")
    return i >= 0 ? pointOrEnd.substring(0, i) : pointOrEnd
  }

  terminalOf(pointOrEnd: string): string | null {
    const i = pointOrEnd.indexOf(":")
    return i >= 0 ? pointOrEnd.substring(i + 1) : null
  }

  /** "F1:IN" -> "F1 IN", "L1:+" -> "L1+", "TS-4" -> "TS-4". */
  display(pointOrEnd: string): string {
    const base = this.baseId(pointOrEnd)
    const term = this.terminalOf(pointOrEnd)
    if (term === null) return base
    if (term === "+" || term === "-") return base + term
    return base + " " + term
  }

  component(idOrPoint: string): NetComponent | null {
    const base = this.baseId(idOrPoint)
    for (const c of this.data.components) if (c.id === base) return c
    return null
  }

  componentIds(): string[] {
    return this.data.components.map((c) => c.id)
  }

  /** Rating without parenthetical notes: "0.5 A fast-blow (rating TBD...)" -> "0.5 A fast-blow". */
  shortRating(idOrPoint: string): string | null {
    const c = this.component(idOrPoint)
    if (!c || !c.rating) return null
    return c.rating.replace(/\s*\(.*?\)\s*/g, " ").trim()
  }

  /** "Bench trainer: ..." -> "bench trainer". */
  machineKind(): string {
    const d = this.data.description || ""
    const head = d.split(":")[0].trim()
    return head.length > 0 ? head.charAt(0).toLowerCase() + head.substring(1) : ""
  }

  // ── Volts formatting ──────────────────────────────────────────────────────

  /** Nominal values: 12 -> "12", 10.8 -> "10.8". */
  fmtNominal(v: number): string {
    return Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v).toString() : v.toString()
  }

  /** Readings always show one decimal: 12.1 -> "12.1", 0 -> "0.0". */
  fmtReading(v: number): string {
    return v.toFixed(1)
  }

  // ── Test points / classification ──────────────────────────────────────────

  point(pointId: string): NetPoint | null {
    const p = this.data.test_points.points[pointId]
    return p ? p : null
  }

  hasTolerance(pointId: string): boolean {
    const p = this.point(pointId)
    return !!p && typeof p.min_v === "number" && typeof p.max_v === "number"
  }

  openThreshold(): number {
    return this.data.test_points.open_circuit_threshold_v
  }

  /** Classification exactly as described in test_points.reading_classification. */
  classify(pointId: string, reading: number): ReadingClass {
    const p = this.point(pointId)
    if (!p || !this.hasTolerance(pointId)) return "no_tolerance"
    if (reading >= (p.min_v as number) && reading <= (p.max_v as number)) return "in_spec"
    if (typeof p.nominal_v === "number" && reading <= this.openThreshold()) return "open"
    return "unexplained"
  }

  /** Color word declared for a class in the file ("green", "red", "amber"), or "raw". */
  classColorWord(cls: ReadingClass): string {
    const rule = this.data.test_points.reading_classification[cls] || ""
    const m = rule.match(/→\s*([a-zA-Z]+)/)
    return m ? m[1].toLowerCase() : "raw"
  }

  /** "Expected 12 V (S1 UP)". Null when the point has no entry. */
  expectedText(pointId: string): string | null {
    const p = this.point(pointId)
    if (!p || typeof p.nominal_v !== "number") return null
    const cond = p.condition ? " (" + p.condition + ")" : ""
    return "Expected " + this.fmtNominal(p.nominal_v) + " V" + cond
  }

  /** "10.8–13.2 V" or null. */
  rangeText(pointId: string): string | null {
    if (!this.hasTolerance(pointId)) return null
    const p = this.point(pointId) as NetPoint
    return this.fmtNominal(p.min_v as number) + "–" + this.fmtNominal(p.max_v as number) + " V"
  }

  /** "Meter black lead on TS-2" -> "TS-2". */
  referencePoint(): string {
    const ref = this.data.test_points.reference || ""
    const parts = ref.trim().split(/\s+/)
    return parts.length > 0 ? parts[parts.length - 1] : ""
  }

  // ── Wires ─────────────────────────────────────────────────────────────────

  wireIndicesById(id: string): number[] {
    const out: number[] = []
    this.data.wires.forEach((w, i) => {
      if (w.id === id) out.push(i)
    })
    return out
  }

  /** Index of the wire whose `to` is exactly this point (or whose `to` is the bare component). */
  wireInto(pointId: string): number {
    for (let i = 0; i < this.data.wires.length; i++) if (this.data.wires[i].to === pointId) return i
    return -1
  }

  wireOutOf(pointId: string): number {
    for (let i = 0; i < this.data.wires.length; i++) if (this.data.wires[i].from === pointId) return i
    return -1
  }

  /** Wires carrying 0 V are drawn blue, every other conductor red (per the file's nominal). */
  isReturnWire(index: number): boolean {
    const n = (this.data.wires[index].nominal || "").trim()
    return /^0\s*V/.test(n)
  }

  // ── Faults / steps ────────────────────────────────────────────────────────

  faultCount(): number {
    return this.data.faults.length
  }

  /** "EXTEND does not work (L1 off ...); RETRACT works" -> "EXTEND doesn't work". */
  symptomLabel(i: number): string {
    const s = this.data.faults[i].symptom
    const head = s.split(" (")[0].split(";")[0].trim()
    return head.replace(/does not/g, "doesn't")
  }

  /** Stable key for object names: first word of the symptom ("EXTEND", "RETRACT", "Neither"). */
  symptomKey(i: number): string {
    return this.data.faults[i].symptom.trim().split(/\s+/)[0].replace(/[^A-Za-z0-9]/g, "")
  }

  /** Function key a symptom is about ("EXTEND"), or null for multi-function symptoms. */
  functionForFault(i: number): string | null {
    const s = this.data.faults[i].symptom
    for (const key of Object.keys(this.data.functions)) {
      if (s.indexOf(key + " ") === 0) return key
    }
    return null
  }

  /** "PS1, wire 1 and S1 COM are good because RETRACT works" -> "RETRACT works, so PS1, wire 1 and S1 COM are good." */
  reasoning(i: number): string {
    const iso = this.data.faults[i].isolates
    if (!iso) return ""
    const parts = iso.split(" because ")
    if (parts.length === 2) {
      return parts[1].trim() + ", so " + parts[0].trim() + "."
    }
    return iso.trim() + "."
  }

  /** Wire ids the fault's `isolates` text declares good ("wire 1"). */
  isolatedWireIds(i: number): string[] {
    const iso = this.data.faults[i].isolates || ""
    const out: string[] = []
    const re = /wire\s+([0-9A-Za-z]+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(iso)) !== null) out.push(m[1])
    return out
  }

  /** Path wires still in question for this fault (function path minus isolated wires). */
  activePathWireIds(i: number): string[] {
    const fn = this.functionForFault(i)
    if (fn) {
      const iso = this.isolatedWireIds(i)
      return this.data.functions[fn].path.filter((w) => iso.indexOf(w) < 0)
    }
    // Multi-function symptom: wires named in the check order.
    const out: string[] = []
    for (const step of this.data.faults[i].check_order) {
      const re = /wire\s+([0-9A-Za-z]+)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(step)) !== null) if (out.indexOf(m[1]) < 0) out.push(m[1])
    }
    return out
  }

  /** Wire indices for the active path, in path order. */
  activePathWireIndices(i: number): number[] {
    const out: number[] = []
    for (const id of this.activePathWireIds(i)) {
      for (const idx of this.wireIndicesById(id)) if (out.indexOf(idx) < 0) out.push(idx)
    }
    return out
  }

  /** Components the active path wires land on (TS-4, F1, L1). */
  activePathComponents(i: number): string[] {
    const out: string[] = []
    for (const idx of this.activePathWireIndices(i)) {
      const b = this.baseId(this.data.wires[idx].to)
      if (out.indexOf(b) < 0 && this.component(b)) out.push(b)
    }
    return out
  }

  /** "EXTEND path: 2a → TS-4 → 2b → F1 (0.5 A fast-blow) → 2c → L1." */
  pathChain(i: number): string {
    const fn = this.functionForFault(i)
    const parts: string[] = []
    for (const idx of this.activePathWireIndices(i)) {
      const w = this.data.wires[idx]
      parts.push(w.id)
      const b = this.baseId(w.to)
      const r = this.shortRating(b)
      parts.push(r ? b + " (" + r + ")" : b)
    }
    if (parts.length === 0 || !fn) return ""
    return fn + " path: " + parts.join(" → ") + "."
  }

  /** Citation for the first protective (fuse) component on the active path:
   *  "Schematic: wire 2b TS-4 → F1, 0.5 A fast-blow". */
  pathCitation(i: number): string {
    for (const idx of this.activePathWireIndices(i)) {
      const w = this.data.wires[idx]
      const c = this.component(w.to)
      if (c && c.type === "fuse") {
        const r = this.shortRating(c.id)
        return "Schematic: wire " + w.id + " " + this.display(this.baseId(w.from)) + " → " + c.id + (r ? ", " + r : "")
      }
    }
    return ""
  }

  steps(i: number): CheckStep[] {
    return this.data.faults[i].check_order.map((text, index) => this.parseStep(text, index))
  }

  private parseStep(text: string, index: number): CheckStep {
    // "at TS-4", "at F1:IN", "at L1:+", "at S1 COM" — accepted only when the base is a component in the file.
    const pm = text.match(/\bat\s+([A-Za-z0-9\-]+)(?:(?::|\s)(IN|OUT|COM|UP|DOWN|\+|-)(?![A-Za-z0-9]))?/)
    let pointId: string | null = null
    if (pm && this.component(pm[1])) pointId = pm[2] ? pm[1] + ":" + pm[2] : pm[1]
    let question = text
    let conclusion = ""
    let isLoadOffCheck = false
    const ifNo = text.indexOf("If no:")
    if (ifNo >= 0) {
      question = text.substring(0, ifNo).trim()
      conclusion = text.substring(ifNo + "If no:".length).trim()
    } else {
      const sep = text.indexOf(": ")
      if (sep >= 0) {
        question = text.substring(0, sep).trim()
        conclusion = text.substring(sep + 2).trim()
      }
      isLoadOffCheck = /\bbut\b/.test(question)
    }
    return {index, text, pointId, question, conclusion, isLoadOffCheck}
  }

  /** "F1 open — check fuse continuity with power off." -> "F1 open". */
  conclusionHead(conclusion: string): string {
    return conclusion.split(" — ")[0].replace(/\.$/, "").trim()
  }

  /** Part a conclusion names: wire ("wire 2b") first if it leads, else the first component mentioned. */
  conclusionPart(conclusion: string): {kind: "wire" | "component" | "none"; id: string} {
    const wm = conclusion.match(/^wire\s+([0-9A-Za-z]+)/)
    if (wm) return {kind: "wire", id: wm[1]}
    let best = -1
    let bestId = ""
    for (const c of this.data.components) {
      const m = new RegExp("(^|[^A-Za-z0-9-])" + escapeRegex(c.id) + "($|[^A-Za-z0-9-])").exec(conclusion)
      if (m && (best < 0 || m.index < best)) {
        best = m.index
        bestId = c.id
      }
    }
    return best >= 0 ? {kind: "component", id: bestId} : {kind: "none", id: ""}
  }

  /** Step citation: wire feeding the point, plus the point component's rating, plus the wire out for in-line parts. */
  stepCitation(pointId: string | null): string {
    if (!pointId) return ""
    const parts: string[] = []
    const into = this.wireInto(pointId)
    if (into >= 0) {
      const w = this.data.wires[into]
      parts.push("wire " + w.id + " " + this.display(w.from) + " → " + this.display(w.to))
    }
    const r = this.shortRating(pointId)
    if (r) parts.push(this.baseId(pointId) + " " + r)
    if (into < 0) {
      const out = this.wireOutOf(pointId)
      if (out >= 0) {
        const w = this.data.wires[out]
        parts.push("wire " + w.id + " " + this.display(w.from) + " → " + this.display(w.to))
      }
    }
    return parts.length > 0 ? "Schematic: " + parts.join("; ") : ""
  }

  /** Last step in the fault's check order that has a tolerance — the point used to verify the repair. */
  retestPoint(i: number): string | null {
    const steps = this.steps(i)
    for (let k = steps.length - 1; k >= 0; k--) {
      const p = steps[k].pointId
      if (p && this.hasTolerance(p)) return p
    }
    return null
  }

  /** "S1 UP" -> {component:"S1", position:"UP"}. */
  controlOf(fn: string): {component: string; position: string} | null {
    const f = this.data.functions[fn]
    if (!f) return null
    const parts = f.control.trim().split(/\s+/)
    if (parts.length < 2) return null
    return {component: parts[0], position: parts[1]}
  }

  functionKeys(): string[] {
    return Object.keys(this.data.functions)
  }
}
