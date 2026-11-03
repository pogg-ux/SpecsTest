// Job report tabs and pages: "Summary" and "Notes & pictures" tabs; ALL notes (newest first) and ALL pictures are on the second
// tab; when a page is still too tall it is split over pages with Previous page / Next page buttons and nothing is cut; every
// page stays inside the view and clear of the key parts.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState, rayReaches, waitFor} from "./MWNPLeafInteractor"
import {checkCard, findCamera} from "./MWNPLayoutCardsScenario"

function isEnabled(name: string): boolean {
  const so = findSceneObjectByName(name)
  return !!so && so.isEnabledInHierarchy
}

function textOf(name: string): string {
  const so = findSceneObjectByName(name)
  return so ? ((so.getComponent("Component.Text") as Text).text || "") : ""
}

@component
export class MWNPReportPagesScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    const app = (global as any).mwnpAssistant
    const cam = findCamera()
    const camPos = cam.getSceneObject().getTransform().getWorldPosition()
    const reach = async (...names: string[]) => {
      for (const n of names) expect(await rayReaches(camPos, n), n + " reachable by mouse ray").toBe("")
    }

    await ui.startExtendDiagnosis()
    await ui.enterReading("12.1")
    await waitFor((x) => x.activePoint === "F1:IN", 3000, "F1:IN")

    // A snapshot and plenty of notes.
    await ui.tap("Btn_Camera")
    await waitFor((x) => x.visibleCard === "camera", 3000, "camera")
    await ui.tap("Btn_Snapshot")
    await waitFor((x) => x.captures.length === 1 && x.cameraCardOpen, 6000, "snapshot")
    await ui.tap("Btn_CameraClose")
    await waitFor((x) => x.visibleCard === "step", 3000, "step")
    await ui.tap("Btn_Lib_Notes")
    await waitFor((x) => x.visibleCard === "notes", 3000, "notes")
    const picks = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1]
    for (const q of picks) {
      await ui.tap("Btn_AddNote")
      await waitFor((x) => x.notesView === "pick", 3000, "picker")
      await sleep(250)
      await ui.tap("Btn_QuickNote_" + q)
      await waitFor((x) => x.notesView === "list", 3000, "note added")
      await sleep(200)
    }
    const total = mwnpState().notes.length
    expect(total, "eighteen notes (seventeen quick picks and the agent's symptom note)").toBe(18)

    // ── Summary tab first; its content is the job, not the notes ──
    await ui.tap("Btn_Lib_Report")
    let s = await waitFor((x) => x.visibleCard === "report", 3000, "report")
    await sleep(600)
    expect(s.reportTab, "opens on Summary").toBe("summary")
    expect(isEnabled("Btn_TabSummary") && isEnabled("Btn_TabNotes"), "both tabs present").toBe(true)
    expect(isEnabled("SummaryJob") && isEnabled("SummaryResult") && isEnabled("Btn_SaveJobLog") && isEnabled("Btn_ExportReport"), "Summary page content").toBe(true)
    expect(isEnabled("ReportNote_0") || isEnabled("NotesHeading"), "no notes on the Summary page").toBe(false)
    checkCard(cam, "SummaryCardCard")
    await reach("Btn_TabSummary", "Btn_TabNotes", "Btn_SaveJobLog", "Btn_ExportReport")

    // ── Notes & pictures: all notes across pages, newest first, nothing cut ──
    await ui.tap("Btn_TabNotes")
    s = await waitFor((x) => x.reportTab === "notes", 3000, "notes tab")
    await sleep(700)
    ev("report pages", {pages: s.reportPages})
    expect(s.reportPages > 1, "eighteen notes and a picture need more than one page (" + s.reportPages + ")").toBe(true)
    await reach("Btn_ReportNextPage", "Btn_ReportPrevPage")
    const seen: string[] = []
    const picturesSeen: boolean[] = []
    for (let p = 0; p < s.reportPages; p++) {
      s = mwnpState()
      expect(s.reportPage, "on page " + (p + 1)).toBe(p)
      expect(textOf("ReportPageInfo"), "page indicator").toBe("Page " + (p + 1) + " of " + s.reportPages)
      checkCard(cam, "SummaryCardCard")
      for (let i = 0; i < total; i++) if (isEnabled("ReportNote_" + i)) seen.push(textOf("ReportNote_" + i))
      picturesSeen.push(isEnabled("ReportCaptureThumb_" + s.captures[0].id))
      if (p < s.reportPages - 1) {
        await ui.tap("Btn_ReportNextPage")
        await waitFor((x) => x.reportPage === p + 1, 3000, "next page")
        await sleep(600)
      }
    }
    expect(seen.length, "every note is on some page (" + seen.length + " of " + total + ")").toBe(total)
    const expectedOrder = mwnpState().notes.map((n: any) => n.time + " · " + n.source + " — " + n.text)
    expect(JSON.stringify(seen), "notes run newest first across the pages").toBe(JSON.stringify(expectedOrder))
    expect(picturesSeen.filter((v) => v).length, "the picture is on exactly one page").toBe(1)

    // Previous page and wrap-around.
    await ui.tap("Btn_ReportNextPage")
    s = await waitFor((x) => x.reportPage === 0, 3000, "next wraps to the first page")
    await sleep(500)
    await ui.tap("Btn_ReportPrevPage")
    s = await waitFor((x) => x.reportPage === s.reportPages - 1, 3000, "previous wraps to the last page")
    await sleep(500)

    // ── Tapping a thumbnail still opens the Photo viewer; Close returns to this tab and page ──
    const picPage = picturesSeen.indexOf(true)
    while (mwnpState().reportPage !== picPage) {
      await ui.tap("Btn_ReportNextPage")
      await sleep(700)
    }
    const picId = mwnpState().captures[0].id
    await ui.tap("ReportCaptureThumb_" + picId)
    await waitFor((x) => x.visibleCard === "viewer", 3000, "viewer")
    await sleep(400)
    await ui.tap("Btn_PhotoClose")
    s = await waitFor((x) => x.visibleCard === "report", 3000, "back on the report")
    await sleep(600)
    expect(s.reportTab, "back on Notes & pictures").toBe("notes")

    // ── End job files the whole report (all notes, the picture); it pages the same way, read-only ──
    await ui.tap("Btn_Lib_Control")
    await waitFor((x) => x.visibleCard === "jobcontrol", 3000, "Job control")
    await sleep(300)
    await ui.tap("Btn_EndJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "end confirm")
    await sleep(300)
    await ui.tap("Btn_ConfirmYes")
    s = await waitFor((x) => x.visibleCard === "report" && x.jobActive === false, 3000, "clean report after End job")
    await sleep(600)
    expect(s.reportTab, "the clean report opens on Summary").toBe("summary")
    expect(textOf("SummaryStatus"), "clean report").toBe("No job in progress — start one from Job")
    checkCard(cam, "SummaryCardCard")
    await ui.tap("Btn_TabNotes")
    await waitFor((x) => x.reportTab === "notes", 3000, "clean report: notes tab")
    await sleep(600)
    expect(isEnabled("NoteEmpty") && isEnabled("PictureEmpty"), "the clean report has no notes or pictures").toBe(true)
    await ui.tap("Btn_TabSummary")
    await waitFor((x) => x.reportTab === "summary", 3000, "clean report: summary tab")
    await sleep(500)
    await ui.tap("Btn_PrevJob_0")
    s = await waitFor((x) => x.viewingPrevious === 0, 3000, "filed report")
    await sleep(600)
    await ui.tap("Btn_TabNotes")
    await waitFor((x) => x.reportTab === "notes", 3000, "filed report: notes tab")
    await sleep(700)
    s = mwnpState()
    expect(s.reportPages > 1, "the filed report is paged too (" + s.reportPages + ")").toBe(true)
    let filedNotes = 0
    let filedPics = 0
    for (let p = 0; p < s.reportPages; p++) {
      checkCard(cam, "SummaryCardCard")
      for (let i = 0; i < total + 1; i++) if (isEnabled("ReportNote_" + i)) filedNotes++
      if (isEnabled("ReportCaptureThumb_" + picId)) filedPics++
      if (p < s.reportPages - 1) {
        await ui.tap("Btn_ReportNextPage")
        await sleep(700)
      }
    }
    expect(filedNotes, "all " + (total + 1) + " notes (the 18 plus the Job ended note) went with the filed report").toBe(total + 1)
    expect(filedPics, "and its picture").toBe(1)
    await ui.tap("Btn_Lib_Camera")
    await waitFor((x) => x.visibleCard === "camera", 3000, "camera")
    await ui.tap("Btn_CameraClose")
    await sleep(500)
    await ui.tap("Btn_Lib_Report")
    await waitFor((x) => x.visibleCard === "report", 3000, "report")
    await sleep(600)

    // ── Text size: still paged, still in view ──
    app.optionsCard.set("textSize", 2)
    await sleep(2200)
    s = mwnpState()
    ev("pages at Extra large", {pages: s.reportPages})
    for (let p = 0; p < s.reportPages; p++) {
      checkCard(cam, "SummaryCardCard")
      if (p < s.reportPages - 1) {
        await ui.tap("Btn_ReportNextPage")
        await sleep(900)
      }
    }
    app.optionsCard.set("textSize", 0)
    await sleep(1500)
    ev("REPORT PAGES PASS", {})
  }
}
