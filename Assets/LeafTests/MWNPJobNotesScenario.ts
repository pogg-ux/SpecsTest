// End job / New job (each with a Yes / No confirm) and Notes: End job stamps the end time, marks the Job report
// Complete and locks the readings; New job clears readings, badges, outlines and traces, returns to the symptom list and
// keeps the previous report viewable until the first reading of the new job; notes (agent and the technician's, newest
// first) appear on the Notes card and in the Job report. In the Preview, notes are added with the quick picks.

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
    await reach("Btn_Lib_Job", "Btn_Lib_Report", "Btn_Lib_Camera", "Btn_Lib_Notes", "Btn_Lib_Options")
    checkCard(cam, "LibraryCardCard")

    // ── The Job card carries End job and New job ──
    await pick("Btn_Lib_Job", "job")
    checkCard(cam, "JobCard")
    await reach("Btn_ReportSymptom", "Btn_EndJob", "Btn_NewJob")
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
    expect(isEnabled("NotesHeading"), "Notes section in the Job report").toBe(true)
    expect(textOf("ReportNote_0").indexOf("Loose terminal tightened") >= 0 && textOf("ReportNote_0").indexOf("You") >= 0, "report lists the technician's note first: " + textOf("ReportNote_0")).toBe(true)
    expect(textOf("ReportNote_1").indexOf("Agent") >= 0, "and the agent's note: " + textOf("ReportNote_1")).toBe(true)
    expect(textOf("SummaryStatus").indexOf("In progress") >= 0, "status line says in progress: " + textOf("SummaryStatus")).toBe(true)
    checkCard(cam, "SummaryCardCard")

    // ── End job: confirm No, then Yes ──
    await pick("Btn_Lib_Job", "step")
    await pick("Btn_Lib_Job", "jobhome")
    checkCard(cam, "JobOverviewCard")
    await reach("Btn_EndJob", "Btn_NewJob")
    await ui.tap("Btn_EndJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "end confirm")
    await sleep(400)
    checkCard(cam, "JobConfirmCard")
    await reach("Btn_ConfirmYes", "Btn_ConfirmNo")
    await ui.tap("Btn_ConfirmNo")
    s = await waitFor((x) => x.visibleCard === "jobhome", 3000, "No returns to the overview")
    expect(s.jobEnded, "No does not end the job").toBe(false)
    const readingsBefore = s.readings.length
    await ui.tap("Btn_EndJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "end confirm again")
    await sleep(300)
    await ui.tap("Btn_ConfirmYes")
    s = await waitFor((x) => x.jobEnded === true && x.visibleCard === "summary", 3000, "job ended")
    await sleep(600)
    ev("job ended", {endTime: s.endTime, notes: s.notes.map((n: any) => n.text)})
    expect(s.endTime.length > 0, "end time stamped").toBe(true)
    expect(textOf("SummaryStatus").indexOf("Complete") >= 0 && textOf("SummaryStatus").indexOf(s.endTime) >= 0, "report marked Complete with the end time: " + textOf("SummaryStatus")).toBe(true)
    expect(textOf("SummaryResult").length > 0 && textOf("SummaryResult").indexOf("Result:") === 0, "result shown: " + textOf("SummaryResult")).toBe(true)
    expect(s.notes[0].source === "Agent" && s.notes[0].text.indexOf("Job ended") >= 0, "agent note: job ended: " + s.notes[0].text).toBe(true)
    expect(s.phase, "readings locked (job phase is closed)").toBe("summary")
    app.onKey("5")
    app.onEnter()
    expect(mwnpState().readings.length, "no new reading after the job has ended").toBe(readingsBefore)
    expect(mwnpState().entry, "the entry stays empty").toBe("")
    checkCard(cam, "SummaryCardCard")

    // ── New job: confirm; the Job report shows the new job right away, the finished one moves to Previous jobs ──
    const endedEndTime = mwnpState().endTime
    await pick("Btn_Lib_Job", "jobhome")
    await ui.tap("Btn_NewJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "new job confirm")
    await sleep(300)
    await ui.tap("Btn_ConfirmYes")
    s = await waitFor((x) => x.visibleCard === "report", 3000, "the Job report of the new job")
    await sleep(600)
    expect(s.readings.length, "readings cleared").toBe(0)
    expect(Object.keys(s.badges).length, "badges cleared").toBe(0)
    expect(Object.keys(s.outlines).every((k) => s.outlines[k] === "none"), "outlines cleared").toBe(true)
    expect(Object.keys(s.traces).every((k) => s.traces[k] === "hidden"), "traces cleared").toBe(true)
    expect(s.notes.length, "notes cleared").toBe(0)
    expect(s.jobEnded, "not ended").toBe(false)
    expect(s.viewingPrevious, "the report is the new job's").toBe(-1)
    expect(s.summaryRows.length, "new report has no readings").toBe(0)
    expect(textOf("SummaryStatus").indexOf("In progress") >= 0, "status In progress: " + textOf("SummaryStatus")).toBe(true)
    expect(isEnabled("ReportNote_0"), "no notes in the new report").toBe(false)
    expect(s.previousJobs.length, "the finished job is in Previous jobs").toBe(1)
    expect(s.previousJobs[0].endTime, "with its end time").toBe(endedEndTime)
    expect(isEnabled("PreviousJobsHeading"), "Previous jobs section at the bottom").toBe(true)
    const prevLabel = labelOf("Btn_PrevJob_0")
    ev("previous job line", {prevLabel})
    expect(prevLabel.indexOf("Job 1") >= 0 && s.previousJobs[0].result.length > 0 && prevLabel.indexOf(s.previousJobs[0].result) >= 0 && prevLabel.indexOf(endedEndTime) >= 0, "line shows job name, result and end time: " + prevLabel).toBe(true)
    checkCard(cam, "SummaryCardCard")
    await reach("Btn_PrevJob_0")

    // Tap to view the finished job's report, then back.
    await ui.tap("Btn_PrevJob_0")
    s = await waitFor((x) => x.viewingPrevious === 0, 3000, "viewing the previous job")
    await sleep(700)
    expect(textOf("SummaryStatus").indexOf("Previous job") >= 0 && textOf("SummaryStatus").indexOf("Complete") >= 0, "marked as the previous, complete job: " + textOf("SummaryStatus")).toBe(true)
    expect(s.summaryRows.length, "its readings are listed").toBe(readingsBefore)
    expect(isEnabled("ReportNote_0"), "and its notes").toBe(true)
    await reach("Btn_BackToCurrent")
    await ui.tap("Btn_BackToCurrent")
    s = await waitFor((x) => x.viewingPrevious === -1, 3000, "back to the current job")
    await sleep(500)
    expect(textOf("SummaryStatus").indexOf("In progress") >= 0 && mwnpState().summaryRows.length === 0, "the current job's report is back").toBe(true)

    // The new job runs from the symptom list.
    await pick("Btn_Lib_Job", "symptoms")
    checkCard(cam, "SymptomCard")
    await ui.tap("Btn_Symptom_EXTEND")
    await waitFor((x) => x.visibleCard === "step" && x.activePoint === "TS-4", 3000, "new step at TS-4")
    await ui.enterReading("12.1")
    s = await waitFor((x) => x.readings.length === 1, 3000, "first reading of the new job")
    await pick("Btn_Lib_Report", "report")
    await sleep(500)
    s = mwnpState()
    expect(s.summaryRows.length, "new report lists its reading").toBe(1)
    expect(s.previousJobs.length, "previous job still listed").toBe(1)
    expect(textOf("SummaryStatus").indexOf("In progress") >= 0, "new job in progress: " + textOf("SummaryStatus")).toBe(true)

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
    expect(textOf("ReportNote_0").indexOf("ok") >= 0, "edited note is in the report: " + textOf("ReportNote_0")).toBe(true)
    ev("JOB NOTES PASS", {})
  }
}
