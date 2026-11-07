// Photo viewer: tapping a snapshot / photo thumbnail (Camera card or Job report) opens it large on the Photo viewer card
// with its test point and time; Previous / Next walk this job's pictures; Delete (Yes / No) removes a picture from the log,
// the report and the thumbnails; Close returns to where the viewer was opened. Pictures of previous jobs are view-only.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
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

@component
export class MWNPPhotoViewerScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    const app = (global as any).mwnpAssistant
    const cam = findCamera()
    const camPos = cam.getSceneObject().getTransform().getWorldPosition()
    const reach = async (...names: string[]) => {
      for (const n of names) expect(await rayReaches(camPos, n), n + " reachable by mouse ray").toBe("")
    }
    const ids = (): number[] => mwnpState().captures.map((c: any) => c.id)
    const snapshot = async () => {
      const n = mwnpState().captures.length
      await ui.tap("Btn_Snapshot")
      await waitFor((x) => x.captures.length === n + 1 && x.cameraCardOpen, 6000, "snapshot " + (n + 1))
    }

    // ── Three snapshots: one at TS-4, two at F1 IN ──
    await ui.startExtendDiagnosis()
    await ui.tap("Btn_Camera")
    await waitFor((x) => x.visibleCard === "camera", 3000, "camera")
    await snapshot()
    await ui.tap("Btn_CameraClose")
    await waitFor((x) => x.visibleCard === "step", 3000, "step")
    await ui.enterReading("12.1")
    await waitFor((x) => x.activePoint === "F1:IN", 3000, "F1:IN")
    await ui.tap("Btn_Camera")
    await waitFor((x) => x.visibleCard === "camera", 3000, "camera again")
    await snapshot()
    await snapshot()
    const all = ids()
    expect(all.length, "three pictures").toBe(3)
    await sleep(500)

    // ── Open from the Camera card's thumbnail ──
    await reach("CameraThumb")
    await ui.tap("CameraThumb")
    let s = await waitFor((x) => x.visibleCard === "viewer", 3000, "photo viewer")
    await sleep(500)
    expect(s.viewer.id, "opens the picture the thumbnail shows (the latest)").toBe(all[2])
    expect(s.viewer.index + 1 + " of 3", "position").toBe("3 of 3")
    expect(textOf("PhotoViewerCount"), "position shown").toBe("3 of 3")
    expect(textOf("PhotoViewerPoint"), "test point shown").toBe("Test point: F1 IN")
    expect(textOf("PhotoViewerTime"), "time shown").toBe("Time: " + app.captures[2].time)
    expect(isEnabled("PhotoViewerImage"), "large image shown").toBe(true)
    const img = findSceneObjectByName("PhotoViewerImage").getTransform().getWorldScale()
    const thumb = (app.cameraCard.sceneObject as SceneObject).getTransform().getWorldScale()
    expect(img.x > thumb.x * 10, "the picture is large (" + img.x.toFixed(1) + " cm wide)").toBe(true)
    checkCard(cam, "PhotoViewerCardCard")
    const lib = screenRect(cam, findSceneObjectByName("LibraryCardCard"), (findSceneObjectByName("LibraryCardCard").getComponent("Component.ScriptComponent") as any).size.x, (findSceneObjectByName("LibraryCardCard").getComponent("Component.ScriptComponent") as any).size.y)
    const vw = findSceneObjectByName("PhotoViewerCardCard")
    const vsz = (vw.getComponent("Component.ScriptComponent") as any).size
    const vr = screenRect(cam, vw, vsz.x, vsz.y)
    expect(!findSceneObjectByName("LibraryCardCard").isEnabledInHierarchy || !(lib.x0 < vr.x1 && vr.x0 < lib.x1 && lib.y0 < vr.y1 && vr.y0 < lib.y1), "viewer clear of the Library menu (which collapses to its chip while a card is open)").toBe(true)
    await reach("Btn_PhotoPrev", "Btn_PhotoNext", "Btn_PhotoDelete", "Btn_PhotoClose")

    // ── Previous / Next ──
    await ui.tap("Btn_PhotoPrev")
    s = await waitFor((x) => x.viewer.id === all[1], 3000, "previous picture")
    expect(textOf("PhotoViewerCount")).toBe("2 of 3")
    await ui.tap("Btn_PhotoNext")
    s = await waitFor((x) => x.viewer.id === all[2], 3000, "next picture")
    await ui.tap("Btn_PhotoNext")
    s = await waitFor((x) => x.viewer.id === all[0], 3000, "next wraps to the first picture")
    await sleep(300)
    expect(textOf("PhotoViewerPoint"), "the first picture is from TS-4").toBe("Test point: TS-4")
    expect(textOf("PhotoViewerCount")).toBe("1 of 3")

    // ── Delete: No keeps it, Yes removes it ──
    await ui.tap("Btn_PhotoDelete")
    s = await waitFor((x) => x.viewer.confirm === true, 3000, "delete confirm")
    await sleep(400)
    checkCard(cam, "PhotoViewerCardCard")
    await reach("Btn_PhotoYes", "Btn_PhotoNo")
    await ui.tap("Btn_PhotoNo")
    s = await waitFor((x) => x.viewer.confirm === false && x.visibleCard === "viewer", 3000, "No keeps the picture")
    expect(s.captures.length, "still three pictures").toBe(3)
    await ui.tap("Btn_PhotoDelete")
    await waitFor((x) => x.viewer.confirm === true, 3000, "delete confirm again")
    await sleep(300)
    await ui.tap("Btn_PhotoYes")
    s = await waitFor((x) => x.captures.length === 2 && x.viewer.confirm === false, 3000, "picture deleted")
    await sleep(400)
    expect(ids().indexOf(all[0]) < 0, "removed from the log").toBe(true)
    expect(s.viewer.id, "the viewer moves to a remaining picture").toBe(all[1])
    expect(textOf("PhotoViewerCount")).toBe("1 of 2")

    // ── Close returns to the Camera card, whose thumbnail follows the latest remaining picture ──
    await ui.tap("Btn_PhotoClose")
    s = await waitFor((x) => x.visibleCard === "camera", 3000, "back on the Camera card")
    await sleep(400)
    expect(app.cameraCard.thumbCaptureId, "thumbnail shows the latest remaining picture").toBe(all[2])

    // ── Job report thumbnails ──
    await ui.tap("Btn_Lib_Report")
    await waitFor((x) => x.visibleCard === "report", 3000, "report")
    await sleep(600)
    await ui.tap("Btn_TabNotes")
    await waitFor((x) => x.reportTab === "notes", 3000, "Notes & pictures tab")
    await sleep(600)
    expect(isEnabled("ReportCaptureThumb_" + all[0]), "deleted picture is gone from the report").toBe(false)
    for (const id of [all[1], all[2]]) expect(isEnabled("ReportCaptureThumb_" + id), "report thumbnail " + id).toBe(true)
    await reach("ReportCaptureThumb_" + all[1])
    await ui.tap("ReportCaptureThumb_" + all[1])
    s = await waitFor((x) => x.visibleCard === "viewer", 3000, "viewer from the report")
    await sleep(400)
    expect(s.viewer.id, "opens the tapped picture").toBe(all[1])
    expect(s.viewer.returnTo, "remembers the report").toBe("report")
    expect(textOf("PhotoViewerPoint"), "test point shown").toBe("Test point: F1 IN")
    await ui.tap("Btn_PhotoDelete")
    await waitFor((x) => x.viewer.confirm === true, 3000, "delete confirm (report)")
    await sleep(300)
    await ui.tap("Btn_PhotoYes")
    s = await waitFor((x) => x.captures.length === 1, 3000, "deleted from the viewer opened on the report")
    await ui.tap("Btn_PhotoClose")
    s = await waitFor((x) => x.visibleCard === "report", 3000, "close returns to the report")
    await sleep(600)
    expect(s.reportTab, "and to the Notes & pictures tab it was opened from").toBe("notes")
    expect(isEnabled("ReportCaptureThumb_" + all[1]), "gone from the report thumbnails").toBe(false)
    expect(isEnabled("ReportCaptureThumb_" + all[2]), "the remaining one stays").toBe(true)
    expect(s.summaryRows.length, "readings unaffected").toBe(1)

    // ── Previous jobs' pictures are view-only ──
    await ui.tap("Btn_Lib_Control")
    await waitFor((x) => cardIs(x.visibleCard, "jobcontrol"), 3000, "Job control")
    await sleep(300)
    await ui.tap("Btn_EndJob")
    await waitFor((x) => x.visibleCard === "confirm", 3000, "confirm")
    await sleep(300)
    await ui.tap("Btn_ConfirmYes")
    s = await waitFor((x) => x.visibleCard === "report" && x.previousJobs.length === 1, 3000, "clean report after End job")
    await sleep(500)
    expect(s.captures.length, "the board has no pictures (they went with the archive)").toBe(0)
    await ui.tap("Btn_PrevJob_0")
    s = await waitFor((x) => x.viewingPrevious === 0, 3000, "previous job report")
    await sleep(700)
    await ui.tap("Btn_TabNotes")
    await waitFor((x) => x.reportTab === "notes", 3000, "previous job: Notes & pictures tab")
    await sleep(600)
    expect(isEnabled("ReportCaptureThumb_" + all[2]), "its picture is listed").toBe(true)
    await ui.tap("ReportCaptureThumb_" + all[2])
    s = await waitFor((x) => x.visibleCard === "viewer", 3000, "viewer on a previous job's picture")
    await sleep(500)
    expect(s.viewer.previousJob, "marked as a previous job's picture").toBe(0)
    expect(textOf("PhotoViewerCount"), "view only").toBe("Previous job: view only")
    for (const n of ["Btn_PhotoPrev", "Btn_PhotoNext", "Btn_PhotoDelete"]) expect(isEnabled(n), n + " not offered").toBe(false)
    expect(textOf("PhotoViewerPoint"), "test point shown").toBe("Test point: F1 IN")
    checkCard(cam, "PhotoViewerCardCard")
    await ui.tap("Btn_PhotoClose")
    s = await waitFor((x) => x.visibleCard === "report" && x.viewingPrevious === 0, 3000, "close returns to the previous job's report")
    ev("PHOTO VIEWER PASS", {})
  }
}
