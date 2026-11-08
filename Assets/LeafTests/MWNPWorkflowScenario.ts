// Final workflow check: walks every path a technician can take with real taps (the same SIK interactions a mouse click
// makes in the Interactive Preview) and checks that no card traps the user, every control on every card is reachable by a
// mouse ray, every confirm has Yes and No, and Hide / Show, Options and Text size never break the layout.
//   Job A: EXTEND fault -> notes -> snapshot -> Finding -> retest -> Job report -> End job
//   Job B: New job -> RETRACT path (F2 open) -> retest -> End job
//   Job C: New job -> "Neither EXTEND nor RETRACT works" (TS-1 dead) -> retest -> End job

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {MWNPLeafInteractor, cardIs, ev, mwnpState, rayReaches, waitFor} from "./MWNPLeafInteractor"
import {checkCard, findCamera, screenRect} from "./MWNPLayoutCardsScenario"

function isEnabled(name: string): boolean {
  const so = findSceneObjectByName(name)
  return !!so && so.isEnabledInHierarchy
}

function textOf(name: string): string {
  const so = findSceneObjectByName(name)
  return so ? ((so.getComponent("Component.Text") as Text).text || "") : ""
}

/** Names of every enabled Interactable under the named card body (first occurrence of each name). */
function interactablesUnder(cardName: string): string[] {
  const root = findSceneObjectByName(cardName)
  const out: string[] = []
  const walk = (o: SceneObject) => {
    if (!o.isEnabledInHierarchy) return
    if (o.getComponent(Interactable.getTypeName()) && out.indexOf(o.name) < 0) out.push(o.name)
    for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
  }
  if (root) walk(root)
  return out
}

@component
export class MWNPWorkflowScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    const app = (global as any).mwnpAssistant
    const cam = findCamera()
    const camPos = cam.getSceneObject().getTransform().getWorldPosition()
    const problems: string[] = []
    const check = (ok: boolean, what: string) => {
      if (!ok) problems.push(what)
      expect(ok, what).toBe(true)
    }

    /** Library destination: tap, wait for the card. */
    const go = async (button: string, card: string) => {
      await ui.tap(button)
      await waitFor((s) => cardIs(s.visibleCard, card), 3000, card)
      await sleep(450)
    }
    /** Every control on the card is the first thing a mouse ray reaches (so a click lands on it). */
    const reachAll = async (cardName: string) => {
      const names = interactablesUnder(cardName).filter((n) => n !== "Label" && n !== "Icon" && n !== cardName) // the card's own backing plate sits behind its controls
      check(names.length > 0, cardName + " has controls")
      for (const n of names) {
        const why = await rayReaches(camPos, n)
        check(why === "", cardName + "/" + n + " reachable by a mouse click" + (why ? " (" + why + ")" : ""))
      }
    }
    const overlapsMenu = (cardName: string): boolean => {
      const rect = (n: string) => {
        const so = findSceneObjectByName(n)
        const sz = (so.getComponent("Component.ScriptComponent") as any).size
        return screenRect(cam, so, sz.x, sz.y)
      }
      // The Library menu collapses to its chip while a card is open (one card at a time): nothing to overlap then.
      if (!findSceneObjectByName("LibraryCardCard").isEnabledInHierarchy) return false
      const a = rect("LibraryCardCard")
      const b = rect(cardName)
      return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
    }
    /** Hide / Show round trip (main and Library) with the card still the same afterwards. */
    const hideShow = async (cardName: string) => {
      const before = mwnpState().visibleCard
      await ui.tap("Btn_DisplayToggle")
      await waitFor((x) => x.display.hidden && !x.display.fading && x.display.alpha === 0, 3000, "hidden")
      check(!isEnabled(cardName), cardName + " hidden by Hide")
      // The Library's own Hide button belongs to its menu, which is collapsed to a chip while a card is open.
      check(isEnabled("Btn_DisplayToggle") && (isEnabled("Btn_LibraryToggle") || isEnabled("Btn_LibraryChip")), "the main Hide/Show button and the Library (menu or chip) stay")
      await ui.tap("Btn_DisplayToggle")
      await waitFor((x) => !x.display.hidden && !x.display.fading && x.display.alpha === 1, 3000, "shown")
      // The step card may be showing as its chip (after a reading) or as the Log reading keypad; that is its state to come back to.
      const stepAsChip = cardName === "StepCardCard" && (isEnabled("Btn_StepChip") || isEnabled("KeypadCardCard"))
      check((isEnabled(cardName) || stepAsChip) && mwnpState().visibleCard === before, cardName + " back after Show")
      // The Library's own Hide button exists only while its menu is showing (it is a chip while a card is open).
      if (isEnabled("Btn_LibraryToggle")) {
        await ui.tap("Btn_LibraryToggle")
        await waitFor((x) => x.libraryHidden && !x.libraryFading && x.libraryAlpha === 0, 3000, "library hidden")
        check(isEnabled(cardName), cardName + " unaffected by the Library's Hide")
        await ui.tap("Btn_LibraryToggle")
        await waitFor((x) => !x.libraryHidden && !x.libraryFading && x.libraryAlpha === 1, 3000, "library shown")
      }
    }
    /** Text size Large / Extra large (and Normal again): layout rules hold for this card. */
    const sizes = async (cardName: string) => {
      for (const i of [1, 2, 0]) {
        app.optionsCard.set("textSize", i)
        await sleep(1900)
        checkCard(cam, cardName)
        check(!overlapsMenu(cardName), cardName + " clear of the Library menu at text size " + i)
      }
    }
    const audit = async (cardName: string) => {
      checkCard(cam, cardName)
      check(!overlapsMenu(cardName), cardName + " clear of the Library menu")
      await reachAll(cardName)
    }

    // ═══ Job A: EXTEND ═══
    await waitFor((s) => s.initialized === true && s.visibleCard === "safety", 10000, "safety card")
    await sleep(500)
    await ui.tap("Btn_DismissSafety")
    await waitFor((s) => s.visibleCard === "home", 3000, "library menu")
    await sleep(500)
    await reachAll("LibraryCardCard")
    await go("Btn_Lib_Job", "job")
    await audit("JobCard")
    await ui.tap("Btn_ReportSymptom")
    await waitFor((s) => s.visibleCard === "symptoms", 3000, "symptoms")
    await sleep(450)
    await audit("SymptomCard")
    await ui.tap("Btn_Symptom_EXTEND")
    await waitFor((s) => s.visibleCard === "step" && s.activePoint === "TS-4", 3000, "step TS-4")
    await sleep(450)
    await audit("StepCardCard")
    await ui.tap("Key_Enter") // nothing typed: the card says what to do, it does not stay silent
    await sleep(300)
    check(textOf("Result").indexOf("Type the meter reading") >= 0, "Enter with nothing typed explains itself: " + textOf("Result"))
    await hideShow("StepCardCard")
    await ui.enterReading("12.1")
    await waitFor((s) => s.activePoint === "F1:IN", 3000, "F1:IN")

    // Every Library destination, reached and left again.
    await go("Btn_Lib_Report", "report")
    await audit("SummaryCardCard")
    await go("Btn_Lib_Notes", "notes")
    await audit("NotesCardCard")
    await ui.tap("Btn_AddNote")
    await waitFor((s) => s.notesView === "pick", 3000, "picker")
    await sleep(400)
    await audit("NotesCardCard")
    await ui.tap("Btn_NoteCancel")
    await waitFor((s) => s.notesView === "list", 3000, "cancel returns to the list")
    await sleep(300)
    await ui.tap("Btn_AddNote")
    await waitFor((s) => s.notesView === "pick", 3000, "picker")
    await sleep(300)
    await ui.tap("Btn_QuickNote_1")
    await waitFor((s) => s.notes.length === 2 && s.notesView === "list", 3000, "note added")
    await sleep(400)
    await go("Btn_Lib_Options", "options")
    await audit("OptionsCardCard")
    await go("Btn_Lib_Camera", "camera")
    await audit("CameraCardCard")
    await ui.tap("Btn_Snapshot")
    await waitFor((s) => s.captures.length === 1 && s.cameraCardOpen, 6000, "snapshot")
    await ui.tap("Btn_Photo")
    await waitFor((s) => s.captures.length === 2 && s.cameraCardOpen, 6000, "photo")
    ev("photo", mwnpState().captures[1])
    const photo = mwnpState().captures[1]
    check(photo.hasTexture || photo.placeholder === "Photo (device only)", "a photo is an image or the labeled placeholder 'Photo (device only)'")
    await sleep(400)
    await audit("CameraCardCard")
    await ui.tap("CameraThumb")
    await waitFor((s) => s.visibleCard === "viewer", 3000, "photo viewer")
    await sleep(500)
    await audit("PhotoViewerCardCard")
    await ui.tap("Btn_PhotoDelete")
    await waitFor((s) => s.viewer.confirm === true, 3000, "delete confirm")
    await sleep(400)
    check(isEnabled("Btn_PhotoYes") && isEnabled("Btn_PhotoNo"), "the delete confirm has Yes and No")
    await ui.tap("Btn_PhotoNo")
    await waitFor((s) => s.viewer.confirm === false, 3000, "No")
    await ui.tap("Btn_PhotoClose")
    await waitFor((s) => s.visibleCard === "camera", 3000, "viewer closes to the camera card")
    await ui.tap("Btn_CameraClose")
    await waitFor((s) => s.visibleCard === "home", 3000, "camera closes to home (opening the Library closed Options first: one card at a time)")
    await go("Btn_Lib_Job", "step")
    await go("Btn_Lib_Control", "jobcontrol")
    await audit("JobCard")
    await ui.tap("Btn_EndJob")
    await waitFor((s) => s.visibleCard === "confirm", 3000, "end confirm")
    await sleep(450)
    check(isEnabled("Btn_ConfirmYes") && isEnabled("Btn_ConfirmNo"), "the End job confirm has Yes and No")
    await audit("JobConfirmCard")
    await ui.tap("Btn_ConfirmNo")
    await waitFor((s) => cardIs(s.visibleCard, "jobcontrol"), 3000, "No returns")
    await ui.tap("Btn_NewJob")
    await waitFor((s) => s.visibleCard === "confirm", 3000, "new confirm")
    await sleep(450)
    check(isEnabled("Btn_ConfirmYes") && isEnabled("Btn_ConfirmNo"), "the New job confirm has Yes and No")
    await ui.tap("Btn_ConfirmNo")
    await waitFor((s) => cardIs(s.visibleCard, "jobcontrol"), 3000, "No returns again")
    check(mwnpState().jobActive && mwnpState().previousJobs.length === 0, "No on both confirms keeps the job and files nothing")
    await go("Btn_Lib_Job", "step")
    check(mwnpState().activePoint === "F1:IN", "the job resumes at F1 IN")

    // Text sizes and Hide / Show at the step, the Camera card, the report and the Options card.
    await sizes("StepCardCard")
    await go("Btn_Lib_Camera", "camera")
    await sizes("CameraCardCard")
    await hideShow("CameraCardCard")
    await go("Btn_Lib_Notes", "notes")
    await sizes("NotesCardCard")
    await go("Btn_Lib_Options", "options")
    await sizes("OptionsCardCard")
    await hideShow("OptionsCardCard")
    await go("Btn_Lib_Job", "step")

    await ui.enterReading("12.0")
    await waitFor((s) => s.activePoint === "F1:OUT", 3000, "F1:OUT")
    await ui.enterReading("0.0")
    await waitFor((s) => s.visibleCard === "finding", 3000, "Finding")
    await sleep(500)
    await audit("FindingCardCard")
    await hideShow("FindingCardCard")
    await sizes("FindingCardCard")
    await ui.tap("Btn_Retest")
    await waitFor((s) => s.phase === "retest_wait", 3000, "retest wait")
    await sleep(450)
    await audit("StepCardCard")
    for (const b of ["Btn_S1_UP", "Btn_S1_DOWN"]) check(isEnabled(b), b + " backup switch button present")
    await ui.tap("Btn_S1_UP")
    await waitFor((s) => s.phase === "retest", 3000, "retest active")
    await ui.enterReading("12.0")
    await ui.confirmFixed()
    await waitFor((s) => s.visibleCard === "summary", 4000, "Job report")
    await ui.tap("Btn_EndJobNo")
    await sleep(900)
    await audit("SummaryCardCard")
    await hideShow("SummaryCardCard")
    await sizes("SummaryCardCard")
    await ui.tap("Btn_SaveJobLog")
    await sleep(300)
    check(mwnpState().previousJobs.length === 1 && mwnpState().previousJobs[0].status === "Saved copy" && mwnpState().jobActive, "Save files a Saved copy under Previous jobs and the job goes on")
    check(labelOf("Btn_SaveJobLog").indexOf("Saved (this session)") === 0, "Save shows visible feedback ('Saved (this session)'): " + labelOf("Btn_SaveJobLog"))
    // Export is a labeled placeholder: it says what is planned and does nothing else.
    check(labelOf("Btn_ExportReport") === "Export report — coming in v2", "Export placeholder label: " + labelOf("Btn_ExportReport"))
    check(textOf("ExportNote") === "", "no note before the press")
    const beforeExport = JSON.stringify({r: mwnpState().readings.length, n: mwnpState().notes.length, c: mwnpState().captures.length, j: mwnpState().jobLog.length})
    await ui.tap("Btn_ExportReport")
    await sleep(500)
    check(textOf("ExportNote") === "Planned: save to glasses, send to phone, or upload to job history.", "Export shows the planned note: " + textOf("ExportNote"))
    check(JSON.stringify({r: mwnpState().readings.length, n: mwnpState().notes.length, c: mwnpState().captures.length, j: mwnpState().jobLog.length}) === beforeExport, "Export changes nothing (no real export)")
    await audit("SummaryCardCard")
    await go("Btn_Lib_Control", "jobcontrol")
    await ui.tap("Btn_EndJob")
    await waitFor((s) => s.visibleCard === "confirm", 3000, "end confirm")
    await sleep(350)
    await ui.tap("Btn_ConfirmYes")
    let s = await waitFor((x) => x.jobActive === false && x.visibleCard === "report", 3000, "job A ended")
    await sleep(600)
    check(s.previousJobs.length === 2 && s.previousJobs[0].status === "Complete", "Job A is filed as Complete (next to its saved copy)")
    check(textOf("SummaryStatus") === "No job in progress — start one from Job", "the Job report is clean after End job: " + textOf("SummaryStatus"))
    check(s.readings.length === 0 && s.captures.length === 0 && s.notes.length === 0 && Object.keys(s.badges).length === 0, "board and report cleared")
    await audit("SummaryCardCard")
    const archivedA = JSON.stringify(s.previousJobs[0].result)
    check(archivedA.indexOf("restored") >= 0, "Job A's result was kept with the archive: " + archivedA)
    await ui.tap("Btn_PrevJob_0")
    await waitFor((x) => x.viewingPrevious === 0, 3000, "view job A")
    await sleep(600)
    check(textOf("SummaryStatus").indexOf("Complete") >= 0, "Job A's report reads Complete")
    s = mwnpState()
    check(s.summaryRows.length > 0, "Job A's readings are in its archived report")
    await ui.tap("Btn_TabNotes")
    await waitFor((x) => x.reportTab === "notes", 3000, "Job A notes tab")
    await sleep(500)
    let sawNotes = ""
    for (let i = 0; i < 12; i++) if (isEnabled("ReportNote_" + i)) sawNotes += textOf("ReportNote_" + i) + "|"
    for (let g = 0; g < 3 && isEnabled("Btn_ReportNextPage"); g++) {
      await ui.tap("Btn_ReportNextPage")
      await sleep(800)
      for (let i = 0; i < 12; i++) if (isEnabled("ReportNote_" + i)) sawNotes += textOf("ReportNote_" + i) + "|"
    }
    check(sawNotes.indexOf("Fault found") >= 0 && sawNotes.indexOf("Fix confirmed") >= 0, "agent notes: fault found and fix confirmed (archived with Job A)")
    await ui.tap("Btn_TabSummary")
    await waitFor((x) => x.reportTab === "summary", 3000, "Job A summary tab")
    await sleep(500)
    await ui.tap("Btn_BackToCurrent")
    await waitFor((x) => x.viewingPrevious === -1, 3000, "back from job A")

    // ═══ Job B: New job -> RETRACT ═══
    await go("Btn_Lib_Control", "jobcontrol")
    // No job is in progress, so the Job card offers "Start new job" (nothing to lose: no confirmation).
    await ui.tap("Btn_StartJob")
    s = await waitFor((x) => x.visibleCard === "symptoms" && x.previousJobs.length === 2, 3000, "symptom list of job B")
    await sleep(500)
    check(s.readings.length === 0 && s.jobActive, "job B starts empty and in progress, at the symptom list")
    await ui.tap("Btn_Symptom_RETRACT")
    await waitFor((x) => x.visibleCard === "step" && x.activePoint === "TS-5", 3000, "RETRACT starts at TS-5")
    await sleep(450)
    await audit("StepCardCard")
    await ui.enterReading("12.1")
    await waitFor((x) => x.activePoint === "F2:IN", 3000, "F2:IN")
    await ui.enterReading("12.0")
    await waitFor((x) => x.activePoint === "F2:OUT", 3000, "F2:OUT")
    await ui.enterReading("0.0")
    s = await waitFor((x) => x.visibleCard === "finding", 3000, "Finding F2")
    check(s.finding && s.finding.part === "F2", "RETRACT path finds F2 open")
    await sleep(500)
    await audit("FindingCardCard")
    await ui.tap("Btn_Retest")
    await waitFor((x) => x.phase === "retest_wait", 3000, "retest wait B")
    await sleep(400)
    await ui.tap("Btn_S1_DOWN")
    await waitFor((x) => x.phase === "retest", 3000, "retest active B")
    await ui.enterReading("12.0")
    await ui.confirmFixed()
    await waitFor((x) => x.visibleCard === "summary", 4000, "Job B report")
    await ui.tap("Btn_EndJobNo")
    await sleep(800)
    await audit("SummaryCardCard")
    check(textOf("SummaryResult").indexOf("RETRACT restored") >= 0, "Job B result: RETRACT restored: " + textOf("SummaryResult"))
    await go("Btn_Lib_Control", "jobcontrol")
    await ui.tap("Btn_EndJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "end confirm B")
    await sleep(350)
    await ui.tap("Btn_ConfirmYes")
    await waitFor((x) => x.jobActive === false && x.previousJobs.length === 3, 3000, "job B ended")

    // ═══ Job C: New job -> "Neither works" ═══
    await go("Btn_Lib_Control", "jobcontrol")
    await ui.tap("Btn_StartJob") // no job in progress: "Start new job", no confirmation
    s = await waitFor((x) => x.visibleCard === "symptoms" && x.previousJobs.length === 3, 3000, "symptom list of job C")
    await ui.tap("Btn_Symptom_Neither")
    await waitFor((x) => x.visibleCard === "step", 3000, "Neither: first step")
    await sleep(450)
    await audit("StepCardCard")
    const firstPoint = mwnpState().activePoint
    ev("neither first point", firstPoint)
    await ui.enterReading("0.0")
    s = await waitFor((x) => x.visibleCard === "finding", 3000, "Finding (Neither)")
    await sleep(500)
    await audit("FindingCardCard")
    await ui.tap("Btn_Retest")
    await waitFor((x) => x.phase === "retest" || x.phase === "retest_wait", 3000, "retest C")
    await sleep(500)
    if (mwnpState().phase === "retest_wait") {
      await ui.tap("Btn_S1_UP")
      await waitFor((x) => x.phase === "retest", 3000, "retest active C")
    }
    await ui.enterReading("12.0")
    await ui.confirmFixed()
    await waitFor((x) => x.visibleCard === "summary", 4000, "Job C report")
    await ui.tap("Btn_EndJobNo")
    await sleep(800)
    await audit("SummaryCardCard")
    await go("Btn_Lib_Control", "jobcontrol")
    await ui.tap("Btn_EndJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "end confirm C")
    await sleep(350)
    await ui.tap("Btn_ConfirmYes")
    s = await waitFor((x) => x.jobActive === false && x.previousJobs.length === 4, 3000, "job C ended")
    check(s.previousJobs.length === 4, "A's saved copy and the finished jobs A, B, C are listed under Previous jobs")
    await sleep(700)
    // The Summary page may be split over pages (Next page); Previous jobs are at the end of it.
    for (let g = 0; g < 4 && !isEnabled("Btn_PrevJob_3") && isEnabled("Btn_ReportNextPage"); g++) {
      await ui.tap("Btn_ReportNextPage")
      await sleep(900)
    }
    check(isEnabled("PreviousJobsHeading") && isEnabled("Btn_PrevJob_0") && isEnabled("Btn_PrevJob_3"), "Previous jobs lists all four")
    await ui.tap("Btn_PrevJob_2")
    await waitFor((x) => x.viewingPrevious === 2, 3000, "view job A")
    await sleep(600)
    await ui.tap("Btn_BackToCurrent")
    await waitFor((x) => x.viewingPrevious === -1, 3000, "back")
    ev("WORKFLOW PASS", {problems})
  }
}

function labelOf(buttonName: string): string {
  const so = findSceneObjectByName(buttonName)
  for (let i = 0; i < so.getChildrenCount(); i++) {
    if (so.getChild(i).name === "Label") return (so.getChild(i).getComponent("Component.Text") as Text).text
  }
  return ""
}
