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

    // Trace segments on the model are enabled.
    for (const name of ["Trace_2a_2", "Trace_2b_3", "Trace_2c_4"]) {
      const so = findSceneObjectByName(name)
      expect(!!so && so.isEnabledInHierarchy, name + " visible").toBe(true)
    }
    ev("C1 PASS", {})
  }
}
