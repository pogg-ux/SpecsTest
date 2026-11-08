// MWNPAgent.ts — the rule-based "agent": pure state machine, no scene access.
//
// Owns: job phase, chosen fault, check_order step pointer, number-pad entry, the reading
// log, the finding, and which path wires are verified / suspect / beyond the open.
// Every decision is netlist-driven: classification via Netlist.classify (min_v/max_v,
// open_circuit_threshold_v), steps from faults[].check_order, path from functions.
// Must not: build text for display (Main does that) or touch SceneObjects.

import {CheckStep, Netlist, ReadingClass} from "./MWNPNetlist"

export type Phase = "notice" | "job" | "symptoms" | "steps" | "finding" | "retest_wait" | "retest" | "done" | "summary"

export interface ReadingLog {
  pointId: string
  value: number
  cls: ReadingClass
  colorWord: string
  range: string
  time: string
  phase: "diagnose" | "retest"
}

export interface Finding {
  kind: "wire" | "component" | "none"
  id: string // "F1" or wire id "2b"
  head: string // "F1 open"
  conclusion: string // full check_order conclusion text
  pointId: string // where the open was measured
  stepIndex: number
}

export interface AgentSnapshot {
  phase: Phase
  stepIndex: number
  entry: string
  readingsLen: number
  stepColor: string
  finding: Finding | null
  repaired: boolean
  wireStates: {[wireIndex: number]: string}
}

export interface EnterResult {
  accepted: boolean
  pointId: string
  value: number
  cls: ReadingClass | null
  advanced: boolean
  finding: Finding | null
  retestPassed: boolean
}

export class MWNPAgent {
  readonly nl: Netlist
  phase: Phase = "notice"
  faultIndex: number = -1
  steps: CheckStep[] = []
  stepIndex: number = -1
  entry: string = ""
  readings: ReadingLog[] = []
  /** Color word for the current step's last result: "" | "green" | "red" | "amber" | "raw". */
  stepColor: string = ""
  finding: Finding | null = null
  retestPointId: string | null = null
  repaired: boolean = false
  /** wire index -> "active" | "green" | "gray" | "red" */
  wireStates: {[wireIndex: number]: string} = {}

  constructor(nl: Netlist) {
    this.nl = nl
  }

  get functionKey(): string | null {
    return this.faultIndex >= 0 ? this.nl.functionForFault(this.faultIndex) : null
  }

  activePoint(): string | null {
    if (this.phase === "steps") {
      const s = this.steps[this.stepIndex]
      return s ? s.pointId : null
    }
    if (this.phase === "retest") return this.retestPointId
    return null
  }

  currentStep(): CheckStep | null {
    return this.phase === "steps" && this.stepIndex >= 0 ? this.steps[this.stepIndex] : null
  }

  dismissNotice(): void {
    this.phase = "job"
  }

  openSymptoms(): void {
    this.phase = "symptoms"
  }

  pickSymptom(i: number): void {
    this.faultIndex = i
    this.steps = this.nl.steps(i)
    this.readings = []
    this.finding = null
    this.repaired = false
    this.entry = ""
    this.stepColor = ""
    this.wireStates = {}
    for (const idx of this.nl.activePathWireIndices(i)) this.wireStates[idx] = "active"
    this.retestPointId = this.nl.retestPoint(i)
    this.phase = "steps"
    this.stepIndex = this.nextMeasurableStep(-1)
  }

  /** Number-pad key: "0".."9", ".", "back". Returns the entry string. */
  key(k: string): string {
    if (k === "back") this.entry = this.entry.substring(0, Math.max(0, this.entry.length - 1))
    else if (k === ".") {
      if (this.entry.indexOf(".") < 0) this.entry = (this.entry.length === 0 ? "0" : this.entry) + "."
    } else if (/^[0-9]$/.test(k) && this.entry.length < 6) this.entry += k
    return this.entry
  }

  /** Enter the typed value at the active point. */
  enter(time: string): EnterResult {
    const pointId = this.activePoint()
    const res: EnterResult = {accepted: false, pointId: pointId || "", value: NaN, cls: null, advanced: false, finding: null, retestPassed: false}
    if (!pointId || this.entry.length === 0) return res
    const v = parseFloat(this.entry)
    if (isNaN(v)) return res
    this.entry = ""
    const cls = this.nl.classify(pointId, v)
    const colorWord = this.nl.classColorWord(cls)
    res.accepted = true
    res.value = v
    res.cls = cls
    this.stepColor = colorWord
    this.readings.push({
      pointId,
      value: v,
      cls,
      colorWord,
      range: this.nl.rangeText(pointId) || "no tolerance defined",
      time,
      phase: this.phase === "retest" ? "retest" : "diagnose",
    })

    if (this.phase === "retest") {
      if (cls === "in_spec") {
        this.repaired = true
        res.retestPassed = true
        for (const k of Object.keys(this.wireStates)) this.wireStates[parseInt(k)] = "green"
        this.phase = "done"
      }
      return res
    }

    // Diagnose phase
    if (cls === "in_spec" || cls === "no_tolerance") {
      if (cls === "in_spec") this.markWire(this.nl.wireInto(pointId), "green")
      const next = this.nextMeasurableStep(this.stepIndex)
      const nextStep = this.steps[this.stepIndex + 1]
      if (nextStep && nextStep.isLoadOffCheck && nextStep.pointId === pointId) {
        // "12 V at <load>+ but lamp off" — the file's own conclusion for this case.
        this.finding = this.makeFinding(nextStep, pointId)
        this.phase = "finding"
        res.finding = this.finding
      } else if (next >= 0) {
        this.stepIndex = next
        this.stepColor = ""
        res.advanced = true
      } else {
        // No measurable step left: the next check_order entry (if any) is the file's conclusion.
        const after = this.steps[this.stepIndex + 1]
        this.finding = after
          ? this.makeFinding(after, pointId)
          : {kind: "none", id: "", head: "No open found in the check order", conclusion: "", pointId, stepIndex: this.stepIndex}
        this.phase = "finding"
        res.finding = this.finding
      }
      return res
    }

    if (cls === "open") {
      const step = this.steps[this.stepIndex]
      this.finding = this.makeFinding(step, pointId)
      if (this.finding.kind === "wire") {
        for (const idx of this.nl.wireIndicesById(this.finding.id)) this.markWire(idx, "red")
      }
      this.grayDownstream(pointId)
      this.phase = "finding"
      res.finding = this.finding
      return res
    }

    // unexplained: stay on the same point, flag nothing.
    return res
  }

  startRetest(): void {
    // Single-function symptoms wait for the switch to be put back; others retest directly.
    this.phase = this.functionKey ? "retest_wait" : "retest"
    this.entry = ""
    this.stepColor = ""
  }

  /** Switch moved. Returns true when the retest point becomes active. */
  switchMoved(component: string, position: string): boolean {
    if (this.phase !== "retest_wait") return false
    const fn = this.functionKey
    if (!fn) return false
    const ctl = this.nl.controlOf(fn)
    if (ctl && ctl.component === component && ctl.position === position) {
      this.phase = "retest"
      return true
    }
    return false
  }

  /** Voice "next": moves to the next measurable step without logging anything. False when not on a step or already on the last one. */
  stepForward(): boolean {
    if (this.phase !== "steps") return false
    const next = this.nextMeasurableStep(this.stepIndex)
    if (next < 0) return false
    this.stepIndex = next
    this.stepColor = ""
    this.entry = ""
    return true
  }

  /** Voice "back": moves to the previous measurable step without logging anything. False when not on a step or already on the first one. */
  stepBack(): boolean {
    if (this.phase !== "steps") return false
    for (let k = this.stepIndex - 1; k >= 0; k--) {
      const s = this.steps[k]
      if (s.pointId && !s.isLoadOffCheck) {
        this.stepIndex = k
        this.stepColor = ""
        this.entry = ""
        return true
      }
    }
    return false
  }

  /** Everything enter() can change, copied, so the last reading can be undone (voice "undo"). */
  snapshot(): AgentSnapshot {
    const ws: {[wireIndex: number]: string} = {}
    for (const k of Object.keys(this.wireStates)) ws[parseInt(k)] = this.wireStates[parseInt(k)]
    return {
      phase: this.phase,
      stepIndex: this.stepIndex,
      entry: this.entry,
      readingsLen: this.readings.length,
      stepColor: this.stepColor,
      finding: this.finding ? {...this.finding} : null,
      repaired: this.repaired,
      wireStates: ws,
    }
  }

  restore(s: AgentSnapshot): void {
    this.phase = s.phase
    this.stepIndex = s.stepIndex
    this.entry = s.entry
    this.readings.length = s.readingsLen
    this.stepColor = s.stepColor
    this.finding = s.finding ? {...s.finding} : null
    this.repaired = s.repaired
    this.wireStates = {}
    for (const k of Object.keys(s.wireStates)) this.wireStates[parseInt(k)] = s.wireStates[parseInt(k)]
  }

  /** Index of the step after `from` that names a measurable test point. */
  private nextMeasurableStep(from: number): number {
    for (let k = from + 1; k < this.steps.length; k++) {
      const s = this.steps[k]
      if (s.pointId && !s.isLoadOffCheck) return k
    }
    return -1
  }

  private makeFinding(step: CheckStep, pointId: string): Finding {
    const part = this.nl.conclusionPart(step.conclusion)
    return {
      kind: part.kind,
      id: part.id,
      head: this.nl.conclusionHead(step.conclusion),
      conclusion: step.conclusion,
      pointId,
      stepIndex: step.index,
    }
  }

  private markWire(idx: number, state: string): void {
    if (idx >= 0 && this.wireStates[idx] !== undefined) this.wireStates[idx] = state
  }

  /** Path wires past the open point are grayed out (trace "stops" at the open). */
  private grayDownstream(pointId: string): void {
    const path = this.nl.activePathWireIndices(this.faultIndex)
    const into = this.nl.wireInto(pointId)
    const out = this.nl.wireOutOf(pointId)
    let start = -1
    if (out >= 0 && path.indexOf(out) >= 0) start = path.indexOf(out)
    else if (into >= 0 && path.indexOf(into) >= 0) start = path.indexOf(into) + 1
    if (start < 0) return
    for (let k = start; k < path.length; k++) {
      if (this.wireStates[path[k]] !== "red") this.wireStates[path[k]] = "gray"
    }
  }
}
