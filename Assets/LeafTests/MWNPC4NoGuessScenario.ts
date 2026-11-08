// C4 No-guess: 6.0 V at F1 OUT -> amber, exact "can't determine" message, F1 OUT stays active,
// no part flagged. Separately, pinching the TS-3 (spare) tag says no tolerance is defined.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, waitFor} from "./MWNPLeafInteractor"

const AMBER_MSG =
  "6.0 V doesn't match any fault in the job files. Recheck your meter leads and connection, then re-enter. I can't determine a cause from the files."

@component
export class MWNPC4NoGuessScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    await ui.logInSpecUpToF1Out()
    await ui.enterReading("6.0")

    const s = await waitFor((x) => x.readings.length === 3, 3000, "third reading logged")
    ev("C4 state", {
      lastResultColor: s.lastResultColor,
      stepColor: s.stepColor,
      activePoint: s.activePoint,
      finding: s.finding,
      phase: s.phase,
      visibleCard: s.visibleCard,
      lastMessage: s.lastMessage,
      stepResult: s.stepResult,
      outlines: s.outlines,
      badges: s.badges,
    })
    expect(s.lastResultColor, "result color").toBe("amber")
    expect(s.stepColor, "step color").toBe("amber")
    expect(s.readings[2].cls, "reading class").toBe("unexplained")
    expect(s.lastMessage, "amber message").toBe(AMBER_MSG)
    expect(s.stepResult, "step card shows amber message").toBe(AMBER_MSG)
    expect(s.activePoint, "F1 OUT stays active").toBe("F1:OUT")
    expect(s.phase, "phase").toBe("steps")
    expect(s.visibleCard, "card").toBe("step")
    expect(s.finding, "no finding").toBeNull()
    for (const id of Object.keys(s.outlines)) {
      expect(s.outlines[id] === "red", "outline " + id + " not red").toBe(false)
    }
    expect(s.badges["F1:OUT"] === undefined, "no F1 OUT badge").toBe(true)

    // Netlist-driven: 6.0 sits between open_circuit_threshold_v and min_v, so it is neither open nor in spec.
    const nl = (global as any).mwnpAssistant.nl.data
    const p = nl.test_points.points["F1:OUT"]
    expect(6.0 > nl.test_points.open_circuit_threshold_v && 6.0 < p.min_v, "6.0 is in the unexplained band per netlist").toBe(true)

    // Re-entry still works at the same point (sanity: no lockup after amber).
    expect(s.entry, "entry cleared after Enter").toBe("")

    // TS-3 spare: no tolerance defined. "Labels: This step only" hides tags that are not part of the step, so show them all first.
    ;(global as any).mwnpAssistant.optionsCard.set("labels", 1) // "Always on"
    await sleep(400) // the labels refresh each frame
    await ui.tap("Tag_TS-3")
    const t = await waitFor((x) => x.tagInfo !== "", 3000, "tag info")
    ev("C4 tag", {tagInfo: t.tagInfo})
    expect(t.tagInfo, "TS-3 tag info").toBe("TS-3: Spare. No tolerance defined in the job files.")
    const info = findSceneObjectByName("TagInfo")
    expect(!!info && info.isEnabledInHierarchy, "TagInfo visible").toBe(true)
    // Pinching a tag must not change the diagnosis.
    expect(t.activePoint, "still at F1 OUT after tag pinch").toBe("F1:OUT")
    ev("C4 PASS", {})
  }
}
