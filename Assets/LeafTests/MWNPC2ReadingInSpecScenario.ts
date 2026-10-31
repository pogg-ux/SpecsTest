// C2 Reading in spec: 12.1 V at TS-4 on the number pad turns the step green, TS-4 shows a
// "12.1 V ✓" badge, and F1 IN becomes active with "Expected 12 V (S1 UP)".

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

@component
export class MWNPC2ReadingInSpecScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()

    // Readout echoes the typed digits before Enter.
    await ui.tap("Key_1")
    await ui.tap("Key_2")
    await ui.tap("Key_Dot")
    await ui.tap("Key_1")
    const typed = mwnpState()
    ev("C2 typed", {entry: typed.entry, readout: typed.readout})
    expect(typed.entry, "entry before Enter").toBe("12.1")
    await ui.tap("Key_Enter")

    const s = await waitFor((x) => x.activePoint === "F1:IN", 3000, "F1:IN active")
    ev("C2 state", {
      lastResultColor: s.lastResultColor,
      badges: s.badges,
      activePoint: s.activePoint,
      expectedTag: s.expectedTag,
      stepResult: s.stepResult,
      readings: s.readings,
    })
    expect(s.lastResultColor, "TS-4 result color").toBe("green")
    expect(s.stepResult.includes("12.1 V ✓ in spec"), "step card result: " + s.stepResult).toBe(true)
    expect(s.badges["TS-4"], "TS-4 badge").toBe("12.1 V ✓")
    expect(s.activePoint, "active point").toBe("F1:IN")
    expect(s.expectedTag.point, "expected tag point").toBe("F1:IN")
    expect(s.expectedTag.text, "expected tag text").toBe("Expected 12 V (S1 UP)")
    expect(s.outlines["TS-4"], "TS-4 outline after pass").toBe("green")
    expect(s.readings.length, "one reading logged").toBe(1)
    expect(s.readings[0].cls, "reading class").toBe("in_spec")

    // Netlist-driven: the green call uses min_v/max_v and the expected text uses nominal_v/condition from netlist.json.
    const nl = (global as any).mwnpAssistant.nl.data
    const p = nl.test_points.points["TS-4"]
    expect(12.1 >= p.min_v && 12.1 <= p.max_v, "12.1 within netlist TS-4 range").toBe(true)
    expect(s.readings[0].range, "range text from netlist").toBe(p.min_v + "–" + p.max_v + " V")
    const f1in = nl.test_points.points["F1:IN"]
    expect(s.expectedTag.text, "expected text from netlist").toBe("Expected " + f1in.nominal_v + " V (" + f1in.condition + ")")

    // On-model objects.
    const badge = findSceneObjectByName("Badge_TS-4")
    expect(!!badge && badge.isEnabledInHierarchy, "Badge_TS-4 visible").toBe(true)
    const tag = findSceneObjectByName("ExpectedTag")
    expect(!!tag && tag.isEnabledInHierarchy, "ExpectedTag visible").toBe(true)
    ev("C2 PASS", {})
  }
}
