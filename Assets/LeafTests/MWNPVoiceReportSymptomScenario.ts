// "Sparky, report symptom" opens the symptom picker; "report" / "job report" still open the Job Report.
// The bug: the PARTIAL transcript "Sparky, report" arrived before "symptom" and opened the Job Report at once. Commands whose
// phrase starts a longer phrase now wait for the final (or for the text to stop changing) when heard as a partial.
// Typed-text injection through global.mwnpSparky.inject(text, isFinal), no microphone.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {parseCommand} from "../Scripts/MWNPSpeech"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

@component
export class MWNPVoiceReportSymptomScenario extends Scenario {
  async run(): Promise<void> {
    // ── Parser: the phrases, and which ones must wait as a partial ──
    const p = (t: string): string => {
      const c = parseCommand(t)
      return c ? c.name + (c.needsSettle ? "*" : "") : "null"
    }
    expect(p("report symptom"), "report symptom").toBe("report_symptom")
    expect(p("report a symptom"), "report a symptom").toBe("report_symptom")
    expect(p("report"), "report waits as a partial (it starts 'report symptom')").toBe("open_report*")
    expect(p("job report"), "job report").toBe("open_report*")
    expect(p("open report"), "open report").toBe("open_report*")
    expect(p("job"), "job waits as a partial (it starts 'job report')").toBe("open_job*")
    expect(p("yes"), "yes waits (it starts 'yes fixed')").toBe("yes*")
    expect(p("yes fixed"), "yes fixed").toBe("fixed")
    expect(p("show"), "show waits (it starts 'show labels' ...)").toBe("show_display*")
    expect(p("show labels"), "show labels").toBe("show_labels")
    expect(p("next"), "an unambiguous command still acts on a partial").toBe("next")

    // ── In the Lens ──
    const ui = new MWNPLeafInteractor()
    await waitFor((s) => s.initialized === true && s.visibleCard === "safety", 10000, "safety card")
    await ui.tap("Btn_DismissSafety")
    await waitFor((s) => s.visibleCard === "home", 3000, "library menu, no card open")
    const sparky = (global as any).mwnpSparky
    expect(!!sparky, "SparkyVoice is running").toBe(true)
    sparky.setRealClips(false)
    sparky.setAsrEnabled(false)
    await sleep(300)
    const last = (): any => sparky.acted[sparky.acted.length - 1]
    const openJobCard = async (): Promise<void> => {
      await ui.tap("Btn_Lib_Job")
      await waitFor((s) => s.visibleCard === "job", 3000, "job card")
    }
    const isReport = (): boolean => mwnpState().visibleCard === "report" || mwnpState().visibleCard === "summary"

    // "report symptom" as the transcript grows: the partial "report" must NOT open the report.
    await openJobCard()
    let n = sparky.acted.length
    sparky.inject("Sparky, report", false)
    await sleep(200)
    expect(sparky.acted.length, "partial 'report' does not act yet").toBe(n)
    expect(isReport(), "and the Job Report is not open").toBe(false)
    sparky.inject("Sparky, report symptom", false)
    await sleep(500)
    expect(last().name, "report symptom acted").toBe("report_symptom")
    expect(mwnpState().visibleCard, "report symptom opens the symptom picker").toBe("symptoms")
    expect(sparky.acted.length, "exactly one command acted").toBe(n + 1)
    sparky.inject("Sparky, report symptom", true)
    await sleep(200)
    expect(sparky.acted.length, "the final repeating it is ignored").toBe(n + 1)

    // "report symptom" typed whole, as a final.
    await sleep(2100)
    sparky.inject("Sparky, close")
    await sleep(500)
    expect(mwnpState().visibleCard, "close -> library menu, no card open").toBe("home")
    await sleep(2100)
    sparky.inject("Sparky, report symptom")
    await sleep(500)
    expect(mwnpState().visibleCard, "final 'report symptom' opens the symptom picker").toBe("symptoms")

    // "report" alone: as a final it opens the Job Report ...
    await sleep(2100)
    sparky.inject("Sparky, close")
    await sleep(500)
    sparky.inject("Sparky, report")
    await sleep(600)
    expect(isReport(), "final 'report' opens the Job Report: " + mwnpState().visibleCard).toBe(true)

    // ... and as a partial that stops changing, it opens it after the settle.
    await sleep(2100)
    sparky.inject("Sparky, close")
    await sleep(500)
    expect(isReport(), "closed").toBe(false)
    await sleep(2100)
    sparky.inject("Sparky, report", false)
    await sleep(200)
    expect(isReport(), "a fresh partial 'report' is still waiting").toBe(false)
    await sleep(1500)
    expect(isReport(), "once the text has settled, 'report' opens the Job Report: " + mwnpState().visibleCard).toBe(true)

    // "job report" opens the Job Report too (not the Job card).
    await sleep(2100)
    sparky.inject("Sparky, close")
    await sleep(500)
    await sleep(2100)
    sparky.inject("Sparky, job", false)
    await sleep(200)
    expect(mwnpState().visibleCard === "job" || mwnpState().visibleCard === "jobhome", "partial 'job' does not open the Job card yet").toBe(false)
    sparky.inject("Sparky, job report", true)
    await sleep(600)
    expect(isReport(), "'job report' opens the Job Report: " + mwnpState().visibleCard).toBe(true)
    // The wake word as live ASR writes it: "Sporky, report symptom" works; "sports ..." / "party ..." do nothing.
    await sleep(2100)
    sparky.inject("Sparky, close")
    await sleep(500)
    expect(mwnpState().visibleCard, "closed -> library menu").toBe("home")
    n = sparky.acted.length
    sparky.inject("Sports, report symptom")
    sparky.inject("Party, report symptom")
    await sleep(400)
    expect(sparky.acted.length, "'sports' / 'party' are not the wake word").toBe(n)
    expect(mwnpState().visibleCard, "and nothing opened").toBe("home")
    for (const w of ["Sporky", "Sparkey", "Spark e"]) {
      await sleep(2100)
      sparky.inject(w + ", report symptom")
      await sleep(500)
      expect(mwnpState().visibleCard, w + ", report symptom opens the symptom picker").toBe("symptoms")
      await sleep(2100)
      sparky.inject("Sparky, close")
      await sleep(500)
    }
    ev("VOICE REPORT SYMPTOM PASS", {acted: sparky.acted.length})
  }
}
