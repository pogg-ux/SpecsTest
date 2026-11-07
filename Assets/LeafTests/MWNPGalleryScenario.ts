// Screenshot gallery driver (not a test of behavior): parameter `shot` drives the Lens to one documented state and
// stops there so the Preview can be captured: start, library, job-control, symptoms, step-schematic, amber, finding, retest, report,
// camera, options, hidden-labels, hidden-all.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, cardIs, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

@component
export class MWNPGalleryScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const shot = (config && config.get("shot")) || "start"
    const ui = new MWNPLeafInteractor()
    const app = (global as any).mwnpAssistant
    const settle = async () => sleep(900)

    await waitFor((s) => s.initialized === true && s.visibleCard === "safety", 10000, "safety card")
    await sleep(900)
    if (shot === "start") return ev("GALLERY " + shot, {})

    await ui.tap("Btn_DismissSafety")
    await waitFor((s) => s.visibleCard === "home", 3000, "library menu")
    if (shot === "library") {
      await settle()
      return ev("GALLERY " + shot, {})
    }
    if (shot === "options") {
      await ui.tap("Btn_Lib_Options")
      await waitFor((s) => s.visibleCard === "options", 3000, "options")
      await settle()
      return ev("GALLERY " + shot, {})
    }

    await ui.tap("Btn_Lib_Job")
    await waitFor((s) => s.visibleCard === "job", 3000, "job card")
    await ui.tap("Btn_ReportSymptom")
    await waitFor((s) => s.visibleCard === "symptoms", 3000, "symptoms")
    if (shot === "symptoms") {
      await settle()
      return ev("GALLERY " + shot, {})
    }
    if (shot === "endnew-camera" || shot === "endnew-job") {
      // A job, then End job -> Yes, then New job -> Yes; then the Camera or the Job card.
      await ui.tap("Btn_Symptom_EXTEND")
      await waitFor((s) => s.visibleCard === "step" && s.activePoint === "TS-4", 3000, "step at TS-4")
      await ui.enterReading("12.1")
      for (const kind of ["EndJob", "NewJob"]) {
        await ui.tap("Btn_Lib_Control")
        await waitFor((s) => cardIs(s.visibleCard, "jobcontrol"), 3000, "job control")
        await sleep(300)
        await ui.tap("Btn_" + kind)
        await waitFor((s) => s.visibleCard === "confirm", 3000, "confirm")
        await sleep(300)
        await ui.tap("Btn_ConfirmYes")
        await waitFor((s) => (kind === "EndJob" ? s.jobActive === false : s.jobActive === true && s.visibleCard === "symptoms"), 3000, kind + " done")
        await sleep(600)
      }
      await ui.tap(shot === "endnew-camera" ? "Btn_Lib_Camera" : "Btn_Lib_Job")
      await waitFor((s) => s.visibleCard === (shot === "endnew-camera" ? "camera" : "symptoms"), 3000, "card")
      await sleep(1400)
      return ev("GALLERY " + shot, {})
    }
    await ui.tap("Btn_Symptom_EXTEND")
    await waitFor((s) => s.visibleCard === "step" && s.activePoint === "TS-4", 3000, "step at TS-4")

    if (shot === "amber") {
      await ui.enterReading("6.0")
      await waitFor((s) => s.lastResultColor === "amber", 3000, "amber result")
      await settle()
      return ev("GALLERY " + shot, {})
    }

    await ui.enterReading("12.1")
    await waitFor((s) => s.activePoint === "F1:IN", 3000, "F1:IN")
    if (shot === "step-schematic") {
      await ui.tap("Btn_Schematic")
      await waitFor((s) => s.schematicOpen, 3000, "schematic")
      await settle()
      return ev("GALLERY " + shot, {})
    }
    if (shot === "hidden-labels" || shot === "hidden-all") {
      if (shot === "hidden-all") app.optionsCard.set("hideButton", 1)
      await sleep(400)
      await ui.tap("Btn_DisplayToggle")
      if (shot === "hidden-all") await ui.tap("Btn_LibraryToggle")
      await waitFor((s) => s.display.hidden && !s.display.fading && s.display.alpha === 0 && (shot !== "hidden-all" || (s.libraryHidden && !s.libraryFading)), 3000, "hidden")
      await settle()
      return ev("GALLERY " + shot, {})
    }

    if (shot === "notes") {
      await ui.tap("Btn_Lib_Notes")
      await waitFor((s) => s.visibleCard === "notes", 3000, "notes")
      await ui.tap("Btn_AddNote")
      await waitFor((s) => s.notesView === "pick", 3000, "quick picks")
      await ui.tap("Btn_QuickNote_1")
      await waitFor((s) => s.notes.length === 2 && s.notesView === "list", 3000, "note added")
      await sleep(300)
      await settle()
      return ev("GALLERY " + shot, {})
    }

    // A snapshot for the Camera card and the Job report.
    await ui.tap("Btn_Camera")
    await waitFor((s) => s.visibleCard === "camera", 3000, "camera")
    await ui.tap("Btn_Snapshot")
    await waitFor((s) => s.captures.length === 1 && s.cameraCardOpen, 6000, "snapshot")
    if (shot === "viewer") {
      await sleep(400)
      await ui.tap("CameraThumb")
      await waitFor((s) => s.visibleCard === "viewer", 3000, "photo viewer")
      await settle()
      return ev("GALLERY " + shot, {})
    }
    if (shot === "camera") {
      await settle()
      return ev("GALLERY " + shot, {})
    }
    await ui.tap("Btn_CameraClose")
    await waitFor((s) => s.visibleCard === "step", 3000, "step")

    await ui.enterReading("12.0")
    await waitFor((s) => s.activePoint === "F1:OUT", 3000, "F1:OUT")
    await ui.enterReading("0.0")
    await waitFor((s) => s.visibleCard === "finding", 3000, "finding")
    if (shot === "finding") {
      await settle()
      return ev("GALLERY " + shot, {})
    }
    await ui.tap("Btn_Retest")
    await waitFor((s) => s.phase === "retest_wait", 3000, "retest_wait")
    if (shot === "retest") {
      await settle()
      return ev("GALLERY " + shot, {})
    }
    let guard = 0
    while (mwnpState().s1 !== "UP" && guard < 2) {
      await ui.tap("S1_Toggle")
      guard++
    }
    await waitFor((s) => s.phase === "retest" && s.s1 === "UP", 3000, "retest active")
    await ui.enterReading("12.0")
    await waitFor((s) => s.visibleCard === "summary", 4000, "job report")
    await sleep(1400)
    if (shot === "job-control") {
      await ui.tap("Btn_Lib_Control")
      await waitFor((s) => cardIs(s.visibleCard, "jobcontrol"), 3000, "job control")
      await sleep(1400)
    }
    if (shot === "complete" || shot === "complete-filed" || shot === "complete-notes") {
      await ui.tap("Btn_Lib_Control")
      await waitFor((s) => cardIs(s.visibleCard, "jobcontrol"), 3000, "job control")
      await ui.tap("Btn_EndJob")
      await waitFor((s) => s.visibleCard === "confirm", 3000, "confirm")
      await sleep(300)
      await ui.tap("Btn_ConfirmYes")
      await waitFor((s) => s.jobActive === false && s.visibleCard === "report", 3000, "job ended")
      await sleep(1400)
      if (shot === "complete-filed" || shot === "complete-notes") {
        // The filed report, read-only.
        await ui.tap("Btn_PrevJob_0")
        await waitFor((s) => s.viewingPrevious === 0, 3000, "filed report")
        await sleep(900)
      }
    }
    if (shot === "complete-notes") {
      await ui.tap("Btn_TabNotes")
      await waitFor((s) => s.reportTab === "notes", 3000, "notes tab")
      await sleep(1200)
    }
    ev("GALLERY " + shot, {})
  }
}
