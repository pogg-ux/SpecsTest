// Verify the fix before closing: retest in spec -> "Problem solved?" (job stays open). "Sparky, not fixed" -> back to the step
// list with a note; "Sparky, fixed" -> summary + "End job?"; only Yes / "Sparky, end job" closes. Also hide / show by voice.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

@component
export class MWNPVerifyFixScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    const app = (global as any).mwnpAssistant
    await ui.startExtendDiagnosis()
    const sparky = (global as any).mwnpSparky
    sparky.setRealClips(false)
    sparky.setAsrEnabled(false)
    await sleep(300)
    const has = (n: string): boolean => !!findInteractablesByName(n, undefined, true)[0]
    const notes = (): string => app.notes.map((x: any) => x.source + ": " + x.text).join(" | ")

    const toVerify = async (): Promise<void> => {
      await ui.logInSpecUpToF1Out()
      await ui.enterReading("0.0")
      await waitFor((x) => x.visibleCard === "finding", 3000, "finding card")
      await ui.tap("Btn_Retest")
      await waitFor((x) => x.phase === "retest_wait", 3000, "retest_wait")
      let g = 0
      while (mwnpState().s1 !== "UP" && g < 2) {
        await ui.tap("S1_Toggle")
        g++
      }
      await waitFor((x) => x.phase === "retest", 3000, "retest active")
      await ui.enterReading("12.0")
      await waitFor((x) => x.phase === "done", 3000, "retest passed")
      const t0 = Date.now()
      while (!has("Btn_FixedYes") && Date.now() - t0 < 6000) await sleep(100)
    }

    await toVerify()
    expect(has("Btn_FixedYes") && has("Btn_FixedNo"), "Problem solved? shows both buttons").toBe(true)
    expect(mwnpState().visibleCard, "no summary yet").toBe("finding")
    expect(mwnpState().jobActive, "job still open").toBe(true)

    // Hide / show by voice (works on the verify card too).
    sparky.inject("Sparky, hide")
    await sleep(500)
    expect(mwnpState().display.hidden, "hide hides the display").toBe(true)
    sparky.inject("Sparky, show")
    await sleep(500)
    expect(mwnpState().display.hidden, "show shows it again").toBe(false)

    // Not fixed -> step list, note logged, job open.
    sparky.inject("Sparky, not fixed")
    await sleep(700)
    expect(mwnpState().visibleCard, "not fixed -> step card").toBe("step")
    expect(mwnpState().phase, "agent back on the steps").toBe("steps")
    expect(mwnpState().jobActive, "job stays open").toBe(true)
    expect(notes().indexOf("No, still faulty") >= 0, "decision logged: " + notes()).toBe(true)

    // Second pass: fixed -> summary asks End job?; Not yet keeps it open; then end by voice.
    await toVerify()
    sparky.inject("Sparky, fixed")
    await waitFor((x) => x.visibleCard === "summary", 3000, "summary")
    await sleep(800)
    ev("verify summary", {yes: has("Btn_EndJobYes"), no: has("Btn_EndJobNo"), save: has("Btn_SaveJobLog"), heading: has("EndJobAsk"), next: has("Btn_ReportNextPage")})
    expect(has("Btn_EndJobYes") && has("Btn_EndJobNo"), "End job? buttons").toBe(true)
    expect(mwnpState().jobActive, "summary does not close the job").toBe(true)
    await ui.tap("Btn_EndJobNo")
    await sleep(500)
    expect(mwnpState().jobActive, "Not yet keeps the job open").toBe(true)
    expect(notes().indexOf("Yes, fixed") >= 0 && notes().indexOf("Not yet") >= 0, "decisions logged: " + notes()).toBe(true)
    sparky.inject("Sparky, end job")
    await sleep(300)
    expect(mwnpState().jobActive, "end job by voice only when asked").toBe(true)

    await toVerify2(ui, app, sparky, has)
    ev("VERIFY FIX PASS", {})
  }
}

async function toVerify2(ui: MWNPLeafInteractor, app: any, sparky: any, has: (n: string) => boolean): Promise<void> {
  // Ask End job? again through the Job card's own path: report -> job. Here we simply re-run to the verify card is not needed;
  // the summary from the previous pass is still showing with the question gone, so end the job from the Job card.
  void app
  void has
  sparky.inject("Sparky, open job")
  await sleep(600)
  expect(mwnpState().visibleCard, "open job -> Job card").toBe("jobhome")
  await ui.tap("Btn_EndJob")
  await ui.tap("Btn_ConfirmYes")
  await sleep(600)
  expect(mwnpState().jobActive, "End job from the Job card closes it").toBe(false)
}
