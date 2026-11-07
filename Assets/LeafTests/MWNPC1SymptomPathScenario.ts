// C1 Symptom -> path: Report symptom + "EXTEND doesn't work" outlines TS-4/F1/L1 amber,
// draws the trace along 2a/2b/2c, and the step card cites wire 2b, TS-4 -> F1, 0.5 A fast-blow.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev} from "./MWNPLeafInteractor"

@component
export class MWNPC1SymptomPathScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    const s = await ui.startExtendDiagnosis()
    ev("C1 state", {outlines: s.outlines, traces: s.traces, pathCitation: s.pathCitation, stepTitle: s.stepTitle})

    for (const id of ["TS-4", "F1", "L1"]) {
      expect(s.outlines[id], "outline " + id).toBe("amber")
    }
    for (const w of ["2a", "2b", "2c"]) {
      expect(s.traces[w], "trace " + w).toBe("active")
    }
    // RETRACT branch is not on the path.
    expect(s.outlines["F2"] === "amber", "F2 must not be amber").toBe(false)
    expect(s.traces["3b"] === "active", "trace 3b must not be active").toBe(false)

    // Citation is on the visible step card text, not just in state.
    const cite = findSceneObjectByName("PathCitation")
    expect(!!cite, "PathCitation text object exists").toBe(true)
    const citeText = (cite.getComponent("Component.Text") as Text).text
    ev("C1 citation", {citeText, visible: cite.isEnabledInHierarchy})
    expect(cite.isEnabledInHierarchy, "PathCitation visible").toBe(true)
    for (const needle of ["wire 2b", "TS-4 → F1", "0.5 A fast-blow"]) {
      expect(citeText.includes(needle), "citation contains '" + needle + "': " + citeText).toBe(true)
    }

    // Every path wire is shown: as a dimmed trace, or — for the current step's wire — as the thicker cyan focus wire.
    let focusShown = 0
    for (const name of ["2a_2", "2b_3", "2c_4"]) {
      const trace = findSceneObjectByName("Trace_" + name)
      const focus = findSceneObjectByName("WireFocus_" + name)
      const focused = !!focus && focus.isEnabledInHierarchy
      if (focused) focusShown++
      expect((!!trace && trace.isEnabledInHierarchy) || focused, name + " visible (trace or focus wire)").toBe(true)
    }
    expect(focusShown, "exactly one path wire is the current step's cyan focus wire").toBe(1)
    ev("C1 PASS", {})
  }
}
