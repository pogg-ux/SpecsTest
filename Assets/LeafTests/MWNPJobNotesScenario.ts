// Job control (Library > Job control) with End job / New job (each with a Yes / No confirm): End job files the report as
// Complete under Previous jobs (readings, notes and pictures with it) and leaves a clean board and an empty Job report;
// New job files a job in progress as Ended early and opens the symptom list; Save (this session) files a snapshot copy
// without ending the job; Notes (agent and the technician's, newest first) appear on the Notes card and in the Job report.
// In the Preview, notes are added with the quick picks.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState, rayReaches, waitFor} from "./MWNPLeafInteractor"
import {checkCard, findCamera} from "./MWNPLayoutCardsScenario"

function isEnabled(name: string): boolean {
  const so = findSceneObjectByName(name)
  return !!so && so.isEnabledInHierarchy
}

function labelOf(buttonName: string): string {
  const so = findSceneObjectByName(buttonName)
  for (let i = 0; i < so.getChildrenCount(); i++) {
    if (so.getChild(i).name === "Label") return (so.getChild(i).getComponent("Component.Text") as Text).text
  }
  return ""
}

function textOf(name: string): string {
  const so = findSceneObjectByName(name)
  return so ? ((so.getComponent("Component.Text") as Text).text || "") : ""
}

@component
export class MWNPJobNotesScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    const app = (global as any).mwnpAssistant
    const cam = findCamera()
    const camPos = cam.getSceneObject().getTransform().getWorldPosition()
    const reach = async (...names: string[]) => {
      for (const n of names) expect(await rayReaches(camPos, n), n + " reachable by mouse ray").toBe("")
    }
    const pick = async (button: string, card: string) => {
      await ui.tap(button)
      await waitFor((s) => s.visibleCard === card, 3000, card)
      await sleep(400)
    }

    await waitFor((s) => s.initialized === true && s.visibleCard === "safety", 10000, "safety card")
    await sleep(500)
    await ui.tap("Btn_DismissSafety")
    await waitFor((s) => s.visibleCard === "home", 3000, "library menu")
    await sleep(500)
    await reach("Btn_Lib_Job", "Btn_Lib_Control", "Btn_Lib_Report", "Btn_Lib_Camera", "Btn_Lib_Notes", "Btn_Lib_Options")
    checkCard(cam, "LibraryCardCard")

    // ── The Job card no longer carries End job / New job (they live on Job control) ──
    await pick("Btn_Lib_Job", "job")
    checkCard(cam, "JobCard")
    expect(isEnabled("Btn_EndJob") || isEnabled("Btn_NewJob"), "no End job / New job on the Job card").toBe(false)
    await reach("Btn_ReportSymptom")
    await ui.tap("Btn_ReportSymptom")
    await waitFor((s) => s.visibleCard === "symptoms", 3000, "symptoms")
    await ui.tap("Btn_Symptom_EXTEND")
    let s = await waitFor((x) => x.visibleCard === "step" && x.activePoint === "TS-4", 3000, "step at TS-4")
    await ui.enterReading("12.1")
    await waitFor((x) => x.activePoint === "F1:IN", 3000, "F1:IN")

    // ── Agent note at "symptom reported" ──
    s = mwnpState()
    ev("notes after symptom", s.notes)
    expect(s.notes.length, "one agent note so far").toBe(1)
    expect(s.notes[0].source, "marked Agent").toBe("Agent")
    expect(s.notes[0].text.indexOf("Symptom reported: EXTEND doesn't work") >= 0, "worded from the netlist symptom: " + s.notes[0].text).toBe(true)

    // ── Notes card: add a quick-pick note; newest first ──
    await pick("Btn_Lib_Notes", "notes")
    checkCard(cam, "NotesCardCard")
    expect(textOf("NoteMeta_0").indexOf("Agent") >= 0, "the Agent note is marked: " + textOf("NoteMeta_0")).toBe(true)
    await reach("Btn_AddNote")
    await ui.tap("Btn_AddNote")
    await waitFor((x) => x.notesView === "pick", 3000, "quick picks")
    await sleep(400)
    checkCard(cam, "NotesCardCard")
    await reach("Btn_QuickNote_0", "Btn_QuickNote_1", "Btn_QuickNote_4", "Btn_NoteCancel")
    await ui.tap("Btn_QuickNote_1")
    s = await waitFor((x) => x.notes.length === 2 && x.notesView === "list", 3000, "note added")
    await sleep(500)
    expect(s.notes[0].text, "newest first").toBe("Loose terminal tightened")
    expect(s.notes[0].source, "marked You").toBe("You")
    expect(textOf("NoteText_0"), "card shows it first").toBe("Loose terminal tightened")
    expect(textOf("NoteMeta_0").indexOf("You") >= 0, "card marks it You").toBe(true)
    expect(textOf("NoteText_1").indexOf("Symptom reported") >= 0, "the agent note is second").toBe(true)

    // ── Notes appear in the Job report ──
    await pick("Btn_Lib_Report", "report")
    await sleep(400)
    expect(textOf("SummaryStatus").indexOf("In progress") >= 0, "status line says in progress: " + textOf("SummaryStatus")).toBe(true)
    await ui.tap("Btn_TabNotes")
    await waitFor((x) => x.reportTab === "notes", 3000, "Notes & pictures tab")
    await sleep(500)
    expect(isEnabled("NotesHeading"), "Notes section in the Job report").toBe(true)
    expect(textOf("ReportNote_0").indexOf("Loose terminal tightened") >= 0 && textOf("ReportNote_0").indexOf("You") >= 0, "report lists the technician's note first: " + textOf("ReportNote_0")).toBe(true)
    expect(textOf("ReportNote_1").indexOf("Agent") >= 0, "and the agent's note: " + textOf("ReportNote_1")).toBe(true)
    checkCard(cam, "SummaryCardCard")


    // ── Job control: its own Library entry; pressing Job twice no longer opens anything ──
    await pick("Btn_Lib_Job", "step")
    await ui.tap("Btn_Lib_Job")
    await sleep(500)
    expect(mwnpState().visibleCard, "Job pressed twice stays on the step card").toBe("step")
    expect(isEnabled("JobControlCard") || isEnabled("JobOverviewCard"), "no hidden overview card").toBe(false)
    await pick("Btn_Lib_Control", "jobcontrol")
    checkCard(cam, "JobControlCard")
    expect(textOf("JobControlStatus"), "status line").toBe("Status: In progress")
    await reach("Btn_EndJob", "Btn_NewJob")
    const libBox = findSceneObjectByName("LibraryCardCard")
    expect(!!libBox && libBox.isEnabledInHierarchy, "Library stays up beside Job control").toBe(true)

    // End job: No keeps the job, Yes files it and clears everything.
    await ui.tap("Btn_EndJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "end confirm")
    await sleep(400)
    checkCard(cam, "JobConfirmCard")
    await reach("Btn_ConfirmYes", "Btn_ConfirmNo")
    await ui.tap("Btn_ConfirmNo")
    s = await waitFor((x) => x.visibleCard === "jobcontrol", 3000, "No returns to Job control")
    expect(s.jobActive, "No does not end the job").toBe(true)
    expect(s.previousJobs.length, "nothing filed").toBe(0)
    const readingsBefore = s.readings.length
    const notesBefore = s.notes.length
    await ui.tap("Btn_EndJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "end confirm again")
    await sleep(300)
    await ui.tap("Btn_ConfirmYes")
    s = await waitFor((x) => x.jobActive === false && x.visibleCard === "report", 3000, "job ended: clean Job report")
    await sleep(600)
    ev("job ended", {endTime: s.endTime, previous: s.previousJobs})
    expect(s.endTime.length > 0, "end time stamped").toBe(true)
    expect(s.previousJobs.length, "the report is filed under Previous jobs").toBe(1)
    expect(s.previousJobs[0].status, "as Complete").toBe("Complete")
    expect(s.previousJobs[0].endTime, "with the end time").toBe(s.endTime)
    expect(textOf("SummaryStatus"), "clean report says so").toBe("No job in progress — start one from Job")
    expect(isEnabled("Btn_SaveJobLog") || isEnabled("SummaryResult") || isEnabled("ReadingsHeading"), "no job content on the clean report").toBe(false)
    expect(s.readings.length === 0 && s.summaryRows.length === 0 && s.captures.length === 0 && s.notes.length === 0, "readings, pictures and notes cleared from the board").toBe(true)
    expect(Object.keys(s.badges).length, "badges cleared").toBe(0)
    expect(Object.keys(s.outlines).every((k) => s.outlines[k] === "none"), "outlines cleared").toBe(true)
    expect(Object.keys(s.traces).every((k) => s.traces[k] === "hidden"), "traces cleared").toBe(true)
    const prevLabel = labelOf("Btn_PrevJob_0")
    expect(prevLabel.indexOf("Job 1") >= 0 && prevLabel.indexOf("Complete") >= 0 && prevLabel.indexOf(s.endTime) >= 0, "Previous jobs line shows name, status and end time: " + prevLabel).toBe(true)
    checkCard(cam, "SummaryCardCard")
    app.onKey("5")
    app.onEnter()
    expect(mwnpState().readings.length, "no reading without a job").toBe(0)

    // The archived report is viewable read-only, with its readings, notes and pictures.
    await ui.tap("Btn_PrevJob_0")
    s = await waitFor((x) => x.viewingPrevious === 0, 3000, "viewing the filed job")
    await sleep(700)
    expect(textOf("SummaryStatus").indexOf("Previous job") >= 0 && textOf("SummaryStatus").indexOf("Complete") >= 0, "marked Complete: " + textOf("SummaryStatus")).toBe(true)
    expect(s.summaryRows.length, "its readings are listed").toBe(readingsBefore)
    expect(isEnabled("Btn_SaveJobLog"), "read-only: no Save").toBe(false)
    await ui.tap("Btn_TabNotes")
    await waitFor((x) => x.reportTab === "notes", 3000, "filed job: notes tab")
    await sleep(500)
    expect(isEnabled("ReportNote_0"), "its notes went with it").toBe(true)
    const archivedNotes: string[] = []
    for (let i = 0; i < notesBefore + 1; i++) if (isEnabled("ReportNote_" + i)) archivedNotes.push(textOf("ReportNote_" + i))
    expect(archivedNotes.some((t) => t.indexOf("Job ended") >= 0) && archivedNotes.some((t) => t.indexOf("Loose terminal tightened") >= 0), "including the technician's note and the agent's Job ended note: " + archivedNotes.join(" | ")).toBe(true)
    await ui.tap("Btn_TabSummary")
    await waitFor((x) => x.reportTab === "summary", 3000, "filed job: summary tab")
    await sleep(500)
    await reach("Btn_BackToCurrent")
    await ui.tap("Btn_BackToCurrent")
    s = await waitFor((x) => x.viewingPrevious === -1, 3000, "back to the current (empty) report")
    await sleep(500)
    expect(textOf("SummaryStatus"), "the clean report is back").toBe("No job in progress — start one from Job")

    // With no job: the Job card offers Start new job; Job control says No job and has no End job.
    await pick("Btn_Lib_Job", "job")
    checkCard(cam, "JobCard")
    expect(textOf("NoJobText"), "Job card says no job").toBe("No job in progress.")
    expect(isEnabled("Btn_StartJob") && !isEnabled("Btn_ReportSymptom"), "Start new job instead of Report symptom").toBe(true)
    await pick("Btn_Lib_Control", "jobcontrol")
    expect(textOf("JobControlStatus"), "status No job").toBe("Status: No job")
    expect(isEnabled("Btn_EndJob"), "nothing to end").toBe(false)
    await reach("Btn_NewJob")

    // ── New job with no job: no archive, clean job at the symptom list ──
    await ui.tap("Btn_NewJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "new job confirm (no job)")
    await sleep(300)
    await ui.tap("Btn_ConfirmYes")
    s = await waitFor((x) => x.visibleCard === "symptoms" && x.jobActive === true, 3000, "symptom list of the new job")
    await sleep(500)
    expect(s.previousJobs.length, "nothing archived when there was no job").toBe(1)
    checkCard(cam, "SymptomCard")

    // ── New job while a job is in progress: filed first as Ended early ──
    await ui.tap("Btn_Symptom_EXTEND")
    await waitFor((x) => x.visibleCard === "step" && x.activePoint === "TS-4", 3000, "step at TS-4 (job 2)")
    await ui.enterReading("12.1")
    s = await waitFor((x) => x.readings.length === 1, 3000, "reading of job 2")
    await pick("Btn_Lib_Control", "jobcontrol")
    expect(textOf("JobControlStatus"), "status In progress").toBe("Status: In progress")
    await ui.tap("Btn_NewJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "new job confirm (in progress)")
    await sleep(300)
    await ui.tap("Btn_ConfirmNo")
    s = await waitFor((x) => x.visibleCard === "jobcontrol", 3000, "No returns")
    expect(s.previousJobs.length === 1 && s.readings.length === 1, "No keeps the job").toBe(true)
    await ui.tap("Btn_NewJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "new job confirm again")
    await sleep(300)
    await ui.tap("Btn_ConfirmYes")
    s = await waitFor((x) => x.visibleCard === "symptoms" && x.previousJobs.length === 2, 3000, "clean job at the symptom list")
    await sleep(500)
    expect(s.previousJobs[0].status, "the job in progress was filed as Ended early").toBe("Ended early")
    expect(s.readings.length === 0 && Object.keys(s.badges).length === 0 && s.notes.length === 0, "board is clean").toBe(true)
    await pick("Btn_Lib_Report", "report")
    await sleep(400)
    expect(textOf("SummaryStatus").indexOf("In progress") >= 0, "the new job's report: " + textOf("SummaryStatus")).toBe(true)
    expect(labelOf("Btn_PrevJob_0").indexOf("Ended early") >= 0, "Previous jobs line says Ended early: " + labelOf("Btn_PrevJob_0")).toBe(true)
    checkCard(cam, "SummaryCardCard")
    await ui.tap("Btn_PrevJob_0")
    s = await waitFor((x) => x.viewingPrevious === 0, 3000, "viewing the Ended early job")
    await sleep(600)
    expect(textOf("SummaryStatus").indexOf("Ended early") >= 0, "marked Ended early: " + textOf("SummaryStatus")).toBe(true)
    expect(s.summaryRows.length, "with its reading").toBe(1)
    await ui.tap("Btn_BackToCurrent")
    await waitFor((x) => x.viewingPrevious === -1, 3000, "back to current")
    await sleep(500)

    // ── Save (this session): a snapshot copy in Previous jobs, the job goes on ──
    await pick("Btn_Lib_Job", "symptoms")
    await ui.tap("Btn_Symptom_EXTEND")
    await waitFor((x) => x.visibleCard === "step" && x.activePoint === "TS-4", 3000, "step at TS-4 (job 3)")
    await ui.enterReading("12.1")
    s = await waitFor((x) => x.readings.length === 1, 3000, "first reading of job 3")
    await pick("Btn_Lib_Report", "report")
    await sleep(500)
    expect(mwnpState().previousJobs.length, "two filed so far").toBe(2)
    await reach("Btn_SaveJobLog")
    await ui.tap("Btn_SaveJobLog")
    s = await waitFor((x) => x.previousJobs.length === 3, 3000, "saved copy filed")
    await sleep(500)
    expect(s.previousJobs[0].status, "as Saved copy").toBe("Saved copy")
    expect(s.jobActive && s.readings.length === 1, "the job is still in progress").toBe(true)
    expect(labelOf("Btn_SaveJobLog").indexOf("Saved (this session)") === 0, "Save shows feedback: " + labelOf("Btn_SaveJobLog")).toBe(true)
    expect(labelOf("Btn_PrevJob_0").indexOf("Saved copy") >= 0, "Previous jobs lists the copy: " + labelOf("Btn_PrevJob_0")).toBe(true)
    expect(textOf("SummaryStatus").indexOf("In progress") >= 0, "current report still In progress").toBe(true)
    await ui.tap("Btn_PrevJob_0")
    s = await waitFor((x) => x.viewingPrevious === 0, 3000, "viewing the saved copy")
    await sleep(600)
    expect(textOf("SummaryStatus").indexOf("Saved copy") >= 0, "marked Saved copy: " + textOf("SummaryStatus")).toBe(true)
    expect(s.summaryRows.length, "with the reading logged so far").toBe(1)
    await ui.tap("Btn_BackToCurrent")
    await waitFor((x) => x.viewingPrevious === -1, 3000, "back to current")
    await sleep(500)


    // ── Notes: "Other" free text ──
    await pick("Btn_Lib_Notes", "notes")
    await ui.tap("Btn_AddNote")
    await waitFor((x) => x.notesView === "pick", 3000, "quick picks")
    await sleep(400)
    await reach("Btn_OtherNote")
    expect(isEnabled("Btn_OtherNote"), "the picker has Other").toBe(true)
    await ui.tap("Btn_OtherNote")
    await waitFor((x) => x.notesView === "other", 3000, "Other: text entry")
    await sleep(400)
    checkCard(cam, "NotesCardCard")
    await reach("Btn_OtherAdd", "Btn_NoteCancel")
    // Typed text: the same handler the computer keyboard's key presses reach in the Preview.
    for (const k of [Keys.H, Keys.I, Keys.Space, Keys.Three]) app.notesCard.onKey(k)
    await sleep(200)
    expect(textOf("OtherText").indexOf("hi 3") >= 0, "typed text shows: " + textOf("OtherText")).toBe(true)
    app.notesCard.onKey(Keys.Backspace)
    await ui.tap("Btn_OtherAdd")
    s = await waitFor((x) => x.notes.length === 2 && x.notesView === "list", 3000, "typed note added")
    expect(s.notes[0].text, "typed free text added (trimmed)").toBe("hi")
    expect(s.notes[0].source, "by You").toBe("You")
    // Nothing typed: the editable placeholder, and the card says so.
    await ui.tap("Btn_AddNote")
    await waitFor((x) => x.notesView === "pick", 3000, "picker again")
    await sleep(300)
    await ui.tap("Btn_OtherNote")
    await waitFor((x) => x.notesView === "other", 3000, "Other again")
    await sleep(300)
    await ui.tap("Btn_OtherAdd")
    s = await waitFor((x) => x.notes.length === 3 && x.notesView === "list", 3000, "placeholder added")
    await sleep(500)
    expect(s.notes[0].text, "placeholder text").toBe("Other — (type on device)")
    expect(s.notesPlaceholders, "marked as a placeholder").toBe(1)
    expect(textOf("NoteStatus").indexOf("not available in the Preview") >= 0, "the card says so: " + textOf("NoteStatus")).toBe(true)
    checkCard(cam, "NotesCardCard")
    // Editable: replace the placeholder text.
    await reach("Btn_EditNote_0")
    await ui.tap("Btn_EditNote_0")
    await waitFor((x) => x.notesView === "other", 3000, "edit")
    await sleep(300)
    for (const k of [Keys.O, Keys.K]) app.notesCard.onKey(k)
    await ui.tap("Btn_OtherAdd")
    s = await waitFor((x) => x.notesView === "list" && x.notesPlaceholders === 0, 3000, "placeholder edited")
    expect(s.notes[0].text, "edited text replaces the placeholder").toBe("ok")
    expect(s.notes.length, "no extra note").toBe(3)
    await pick("Btn_Lib_Report", "report")
    await sleep(500)
    await ui.tap("Btn_TabNotes")
    await waitFor((x) => x.reportTab === "notes", 3000, "notes tab")
    await sleep(500)
    expect(textOf("ReportNote_0").indexOf("ok") >= 0, "edited note is in the report: " + textOf("ReportNote_0")).toBe(true)
    ev("JOB NOTES PASS", {})
  }
}
