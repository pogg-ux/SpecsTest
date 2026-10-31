// C3 Fault flagged: 12.1 at TS-4, 12.0 at F1 IN, then 0.0 V at F1 OUT -> F1 outline red,
// trace stops at F1 (2b green, 2c gray), Finding card "F1 open" with the next action.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, waitFor} from "./MWNPLeafInteractor"

@component
export class MWNPC3FaultFlaggedScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    await ui.logInSpecUpToF1Out()
    await ui.enterReading("0.0")

    const s = await waitFor((x) => x.visibleCard === "finding", 3000, "finding card")
    ev("C3 state", {
      outlines: s.outlines,
      traces: s.traces,
      finding: s.finding,
      findingCard: s.findingCard,
      lastResultColor: s.lastResultColor,
      badges: s.badges,
      openThresholdV: s.openThresholdV,
    })
    expect(s.lastResultColor, "F1 OUT result color").toBe("red")
    expect(s.outlines["F1"], "F1 outline").toBe("red")
    expect(s.traces["2a"], "trace 2a").toBe("green")
    expect(s.traces["2b"], "trace 2b").toBe("green")
    expect(s.traces["2c"], "trace 2c").toBe("gray")
    expect(s.finding && s.finding.part, "finding part").toBe("F1")
    expect(s.finding && s.finding.head, "finding head").toBe("F1 open")

    const title = s.findingCard.title as string
    const action = s.findingCard.nextAction as string
    expect(title.includes("F1 open"), "finding title: " + title).toBe(true)
    for (const needle of ["Lockout/tagout", "check continuity", "0.5 A fast-blow", "Do not upsize"]) {
      expect(action.includes(needle), "next action contains '" + needle + "': " + action).toBe(true)
    }
    expect((s.findingCard.evidence as string).includes("0.0 V at F1 OUT"), "evidence: " + s.findingCard.evidence).toBe(true)

    // Netlist-driven threshold: 0.0 is classified "open" because it is <= open_circuit_threshold_v.
    const nl = (global as any).mwnpAssistant.nl.data
    expect(s.openThresholdV, "open threshold equals netlist value").toBe(nl.test_points.open_circuit_threshold_v)
    expect(s.openThresholdV, "open threshold").toBe(1)

    // On-model + card objects.
    const outline = findSceneObjectByName("Outline_F1")
    expect(!!outline && outline.isEnabledInHierarchy, "Outline_F1 visible").toBe(true)
    const retest = findSceneObjectByName("Btn_Retest")
    expect(!!retest && retest.isEnabledInHierarchy, "Btn_Retest visible").toBe(true)
    ev("C3 PASS", {})
  }
}
