// Card text and backing never wash out: after every way a card can be shown, hidden, swapped or faded, every visible card's
// text is fully opaque (titles and body text pure white) and its backing is the 90 % smoke-gray, not a half-faded copy.
//
// Sequences: Library -> each card in turn; Camera open / close x3 fast; Job control -> End job -> Yes -> Job; New job -> Yes
// (then an End job -> New job round trip, Camera and Job cards); both Hide / Show buttons pressed in the middle of card swaps.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

const CARDS = ["LibraryCardCard", "JobCard", "SymptomCard", "JobControlCard", "JobConfirmCard", "StepCardCard", "FindingCardCard", "SummaryCardCard", "CameraCardCard", "OptionsCardCard", "NotesCardCard", "PhotoViewerCardCard"]
/** Titles and body text that must be pure white (everything else only has to be opaque: amber primary labels, status colors). */
const WHITE_NAMES = [
  "LibraryTitle", "LibraryAppName", "JobHeader", "JobTitle", "FilesLoaded", "NoJobText", "SymptomsHeader", "SymptomHeading", "JobControlHeader", "JobControlTitle",
  "JobControlNote", "JobConfirmHeader", "ConfirmMessage", "CameraTitle", "CameraTarget", "SummaryTitle", "SummaryJob", "SummarySymptom", "NotesTitle", "OptionsTitle",
]

function near(a: number, b: number, e: number): boolean {
  return Math.abs(a - b) <= e
}

/** Everything wrong with the cards currently on screen, as readable strings ("" list = fine). */
function problems(): string[] {
  const bad: string[] = []
  for (const cardName of CARDS) {
    const card = findSceneObjectByName(cardName)
    if (!card || !card.isEnabledInHierarchy) continue
    const plate = card.getComponent(BackPlate.getTypeName()) as BackPlate | null
    const rr = plate ? ((plate as any).roundedRectangle as RoundedRectangleLike | undefined) : undefined
    if (rr) {
      if (rr.opacity < 0.97) bad.push(cardName + " backing opacity " + rr.opacity.toFixed(2))
      const a = rr.backgroundColor.w
      if (!near(a, 0.9, 0.03)) bad.push(cardName + " backing alpha " + a.toFixed(2) + " (want 0.90)")
    }
    const walk = (o: SceneObject) => {
      if (!o.enabled) return
      const t = o.getComponent("Component.Text") as Text
      if (t && t.text.length > 0) {
        const c = t.textFill.color
        if (c.w < 0.97) bad.push(cardName + "/" + o.name + " alpha " + c.w.toFixed(2))
        else {
          const amber = near(c.x, 1, 0.03) && near(c.y, 0.72, 0.05) && near(c.z, 0, 0.1)
          const white = c.x >= 0.97 && c.y >= 0.97 && c.z >= 0.97
          const mustBeWhite = WHITE_NAMES.indexOf(o.name) >= 0
          if (mustBeWhite && !white) bad.push(cardName + "/" + o.name + " not white " + [c.x, c.y, c.z].map((v) => v.toFixed(2)).join(","))
          // Labels and others: white, the amber of a primary action, or one of the state colors; never a dim gray.
          if (!white && !amber && c.x === c.y && c.y === c.z) bad.push(cardName + "/" + o.name + " gray " + c.x.toFixed(2))
        }
      }
      for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
    }
    walk(card)
  }
  return bad
}

interface RoundedRectangleLike {
  opacity: number
  backgroundColor: vec4
}

@component
export class MWNPCardTextScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    const audit = async (what: string, settle: number = 1100) => {
      await sleep(settle)
      const bad = problems()
      const app = (global as any).mwnpAssistant
      const cm = app.motion.filter((m: any) => m.so === app.cameraCard.sceneObject)[0]
      const cf = app.cameraCard.closeFader
      ev("audit " + what, {bad, motion: cm ? {a: cm.fader.alpha, h: cm.fader.hidden, f: cm.fader.isFading, open: cm.open} : null, close: cf ? {a: cf.alpha, h: cf.hidden, f: cf.isFading} : null, enabled: app.cameraCard.sceneObject.enabled})
      expect(bad.join("; "), what + ": every visible card is fully opaque, white, 90% backing").toBe("")
    }
    const pick = async (button: string, card: string) => {
      await ui.tap(button)
      await waitFor((s) => s.visibleCard === card, 3000, card)
    }

    await ui.startExtendDiagnosis()
    await audit("start (step card)")

    // ── Library -> each card in turn, twice round ──
    for (let round = 0; round < 2; round++) {
      for (const [b, c] of [["Btn_Lib_Job", "step"], ["Btn_Lib_Control", "jobcontrol"], ["Btn_Lib_Report", "report"], ["Btn_Lib_Camera", "camera"], ["Btn_Lib_Notes", "notes"], ["Btn_Lib_Options", "options"], ["Btn_Lib_Job", "step"]]) {
        await pick(b, c)
        await audit("Library " + b + " (round " + round + ")", 800)
      }
    }
    // Pressed again and again while open: pulses must not dim.
    for (const b of ["Btn_Lib_Camera", "Btn_Lib_Camera", "Btn_Lib_Camera", "Btn_Lib_Camera"]) {
      await ui.tap(b)
      await sleep(60)
    }
    await audit("Camera pulsed repeatedly")
    await pick("Btn_Lib_Job", "step")
    await audit("back to the step card")

    // ── Camera open / close x3, fast ──
    for (let i = 0; i < 3; i++) {
      await ui.tap("Btn_Lib_Camera")
      await sleep(70)
      await ui.tap("Btn_CameraClose")
      await sleep(70)
    }
    await audit("Camera fast x3 (closed)")
    await pick("Btn_Lib_Camera", "camera")
    await audit("Camera after the fast round trips")
    await ui.tap("Btn_CameraClose")
    await waitFor((s) => s.visibleCard === "home" || s.visibleCard === "step", 3000, "camera closed")
    await audit("after Camera Close")

    // ── Job control -> End job -> Yes -> Job ──
    await pick("Btn_Lib_Control", "jobcontrol")
    await audit("Job control")
    await ui.tap("Btn_EndJob")
    await waitFor((s) => s.visibleCard === "confirm", 3000, "end confirm")
    await audit("End job confirm", 700)
    await ui.tap("Btn_ConfirmNo")
    await waitFor((s) => s.visibleCard === "jobcontrol", 3000, "No")
    await audit("Job control after No", 700)
    await ui.tap("Btn_EndJob")
    await waitFor((s) => s.visibleCard === "confirm", 3000, "end confirm again")
    await sleep(200)
    await ui.tap("Btn_ConfirmYes")
    await waitFor((s) => s.jobActive === false && s.visibleCard === "report", 3000, "clean report")
    await audit("clean report after End job")
    await pick("Btn_Lib_Job", "job")
    await audit("Job card (no job)")
    await pick("Btn_Lib_Camera", "camera")
    await audit("Camera after End job")
    await ui.tap("Btn_CameraClose")
    await sleep(300)

    // ── New job -> Yes ──
    await pick("Btn_Lib_Control", "jobcontrol")
    await audit("Job control (no job)", 700)
    await ui.tap("Btn_NewJob")
    await waitFor((s) => s.visibleCard === "confirm", 3000, "new confirm")
    await sleep(200)
    await ui.tap("Btn_ConfirmYes")
    await waitFor((s) => s.visibleCard === "symptoms" && s.jobActive === true, 3000, "symptom list")
    await audit("symptom list after New job")

    // End job -> New job round trip, then the Camera and Job cards.
    await ui.tap("Btn_Symptom_EXTEND")
    await waitFor((s) => s.visibleCard === "step", 3000, "step")
    await ui.enterReading("12.1")
    await pick("Btn_Lib_Control", "jobcontrol")
    await ui.tap("Btn_EndJob")
    await waitFor((s) => s.visibleCard === "confirm", 3000, "end confirm 2")
    await sleep(200)
    await ui.tap("Btn_ConfirmYes")
    await waitFor((s) => s.jobActive === false, 3000, "ended 2")
    await sleep(300)
    await pick("Btn_Lib_Control", "jobcontrol")
    await ui.tap("Btn_NewJob")
    await waitFor((s) => s.visibleCard === "confirm", 3000, "new confirm 2")
    await sleep(200)
    await ui.tap("Btn_ConfirmYes")
    await waitFor((s) => s.visibleCard === "symptoms" && s.jobActive === true, 3000, "symptom list 2")
    await audit("symptom list after End -> New")
    await pick("Btn_Lib_Camera", "camera")
    await audit("Camera after End -> New")
    await ui.tap("Btn_CameraClose")
    await sleep(300)
    await pick("Btn_Lib_Job", "symptoms")
    await audit("Job card after End -> New")
    await pick("Btn_Lib_Camera", "camera")
    await audit("Camera again")
    await ui.tap("Btn_CameraClose")
    await sleep(300)
    await ui.tap("Btn_Symptom_EXTEND")
    await waitFor((s) => s.visibleCard === "step", 3000, "step again")
    await audit("step card of the new job")

    // ── Both Hide / Show buttons in the middle of card swaps ──
    for (let i = 0; i < 3; i++) {
      await ui.tap("Btn_Lib_Camera")
      await sleep(90)
      await ui.tap("Btn_DisplayToggle")
      await sleep(110)
      await ui.tap("Btn_Lib_Notes")
      await sleep(90)
      await ui.tap("Btn_LibraryToggle")
      await sleep(120)
      await ui.tap("Btn_DisplayToggle")
      await sleep(80)
      await ui.tap("Btn_LibraryToggle")
      await sleep(100)
      await ui.tap("Btn_Lib_Control")
      await sleep(600)
    }
    await waitFor((s) => !s.display.fading && !s.libraryFading, 3000, "fades settled")
    await audit("after Hide / Show mid-swap")
    if (mwnpState().display.hidden) {
      await ui.tap("Btn_DisplayToggle")
      await audit("after showing the display")
    }
    for (const [b, c] of [["Btn_Lib_Camera", "camera"], ["Btn_Lib_Job", "step"]]) {
      await pick(b, c)
      await audit("final " + b, 800)
    }
    ev("CARD TEXT PASS", {})
  }
}
