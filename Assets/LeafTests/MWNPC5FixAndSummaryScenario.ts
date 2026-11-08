// C5 Fix and summary: after the F1-open finding, "Fuse replaced: retest" -> flip S1 UP lights L1
// -> 12.0 V at L1+ is green -> Findings summary lists every reading (point, value, range, time)
// plus finding and result.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

@component
export class MWNPC5FixAndSummaryScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    const app = (global as any).mwnpAssistant
    await ui.startExtendDiagnosis()
    await ui.logInSpecUpToF1Out()
    await ui.enterReading("0.0")
    await waitFor((x) => x.visibleCard === "finding", 3000, "finding card")

    // Button label on the finding card.
    const retestBtn = findSceneObjectByName("Btn_Retest")
    let label: Text | null = null
    for (const c of retestBtn.children) if (c.name === "Label") label = c.getComponent("Component.Text") as Text
    ev("C5 retest button", {label: label ? label.text : null})
    expect(!!label && label.text === "Fuse replaced: retest", "retest button label").toBe(true)

    await ui.tap("Btn_Retest")
    const w = await waitFor((x) => x.phase === "retest_wait", 3000, "retest_wait")
    ev("C5 retest-wait", {s1: w.s1, lamps: w.lamps, stepTitle: w.stepTitle, visibleCard: w.visibleCard})
    expect(w.s1, "S1 moved off UP after lockout").toBe("DOWN")
    expect(w.lamps["L1"], "L1 off before S1 flipped UP").toBe(false)

    // Flip S1 on the model (pinch the toggle) until it is UP.
    let guard = 0
    while (mwnpState().s1 !== "UP" && guard < 2) {
      await ui.tap("S1_Toggle")
      guard++
    }
    const r = await waitFor((x) => x.phase === "retest" && x.s1 === "UP", 3000, "retest active with S1 UP")
    ev("C5 retest-active", {s1: r.s1, lamps: r.lamps, activePoint: r.activePoint, expectedTag: r.expectedTag, s1Pinches: guard})
    expect(r.lamps["L1"], "L1 lit with S1 UP after fuse replaced").toBe(true)
    let glowOn = false
    for (const c of findSceneObjectByName("Lamp_L1").children) if (c.name === "Glow") glowOn = c.isEnabledInHierarchy
    expect(glowOn, "Lamp_L1/Glow enabled").toBe(true)
    expect(r.activePoint, "retest point").toBe("L1:+")

    await ui.enterReading("12.0")
    const d = await waitFor((x) => x.phase === "done" || x.phase === "summary", 3000, "retest passed")
    ev("C5 retest-passed", {lastResultColor: d.lastResultColor, stepResult: d.stepResult, outlines: d.outlines, traces: d.traces, repaired: d.repaired})
    expect(d.lastResultColor, "L1+ result color").toBe("green")
    expect(d.repaired, "repaired").toBe(true)
    expect(d.outlines["F1"], "F1 outline green after retest").toBe("green")

    // Summary appears after summaryDelaySec (1.5 s).
    const t0 = getTime()
    await ui.confirmFixed()
    const s = await waitFor((x) => x.visibleCard === "summary", 4000, "findings summary")
    const delay = getTime() - t0
    ev("C5 summary", {delaySec: delay, rows: s.summaryRows, finding: s.summaryFinding, result: s.summaryResult, readings: s.readings})

    expect(s.readings.length, "4 readings logged").toBe(4)
    expect(s.summaryRows.length, "one summary row per reading").toBe(s.readings.length)
    for (let i = 0; i < s.readings.length; i++) {
      const rd = s.readings[i]
      const row = s.summaryRows[i] as string
      const disp = app.nl.display(rd.point)
      const val = app.nl.fmtReading(rd.value) + " V"
      for (const part of [disp, val, rd.range, rd.time]) {
        expect(row.includes(part), "row " + i + " contains '" + part + "': " + row).toBe(true)
      }
      expect(/^\d\d:\d\d:\d\d$/.test(rd.time), "time format " + rd.time).toBe(true)
    }
    expect((s.summaryFinding as string).includes("F1 open"), "summary finding: " + s.summaryFinding).toBe(true)
    expect((s.summaryResult as string).includes("EXTEND restored"), "summary result: " + s.summaryResult).toBe(true)

    // Save to job log.
    await ui.tap("Btn_SaveJobLog")
    await sleep(200)
    expect(mwnpState().savedToJobLog, "saved to job log").toBe(true)
    ev("C5 PASS", {})
  }
}
