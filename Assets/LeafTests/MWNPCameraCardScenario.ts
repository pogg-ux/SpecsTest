// Camera card: opens from the step card, closes back to the same step, a Snapshot attaches to the active test
// point, a Photo attaches (an image or the exact "Photo (device only)" placeholder), and the Job report lists the
// thumbnails right after the test point they belong to.
//
// Not covered (device only): the real device still photo. In the Preview the photo is the camera stream frame if
// the Preview delivers one, else the placeholder; the test reports which.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

/** Step-card state the Camera card must give back untouched. */
function stepSnapshot(): string {
  const s = mwnpState()
  return JSON.stringify({
    visibleCard: s.visibleCard,
    activePoint: s.activePoint,
    stepIndex: s.stepIndex,
    stepTitle: s.stepTitle,
    readout: s.readout,
    phase: s.phase,
    readings: s.readings.length,
  })
}

function isEnabled(name: string): boolean {
  const so = findSceneObjectByName(name)
  return !!so && so.isEnabledInHierarchy
}

function textOf(name: string): string {
  const so = findSceneObjectByName(name)
  return so ? ((so.getComponent("Component.Text") as Text).text || "") : ""
}

/** Number of base64 characters of the texture as JPEG: a blank image encodes tiny, a real picture does not. */
function jpegChars(tex: Texture): Promise<number> {
  return new Promise((resolve) => {
    let done = false
    Base64.encodeTextureAsync(
      tex,
      (s: string) => {
        done = true
        resolve(s.length)
      },
      () => {
        done = true
        resolve(-1)
      },
      CompressionQuality.LowQuality,
      EncodingType.Jpg
    )
    sleep(5000).then(() => {
      if (!done) resolve(-2)
    })
  })
}

@component
export class MWNPCameraCardScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const stopAt = (config && config.get("stop_at")) || ""
    const ui = new MWNPLeafInteractor()
    const app = (global as any).mwnpAssistant
    await ui.startExtendDiagnosis()
    await sleep(500)
    expect(isEnabled("Btn_Camera"), "step card has a Camera button").toBe(true)

    // ── Open / close returns to the same step ──
    const before = stepSnapshot()
    await ui.tap("Btn_Camera")
    let s = await waitFor((x) => x.visibleCard === "camera", 3000, "camera card open")
    expect(s.cameraCardOpen, "camera card visible").toBe(true)
    expect(isEnabled("CameraCardCard"), "CameraCardCard enabled").toBe(true)
    expect(isEnabled("StepCardCard"), "step card hidden while the camera card is open").toBe(false)
    for (const n of ["Btn_Snapshot", "Btn_Photo", "Btn_CameraClose"]) expect(isEnabled(n), n + " present").toBe(true)
    expect(textOf("CameraTarget").indexOf("TS-4") >= 0, "card says it attaches to TS-4: " + textOf("CameraTarget")).toBe(true)
    await ui.tap("Btn_CameraClose")
    s = await waitFor((x) => x.visibleCard === "step", 3000, "back to step card")
    await sleep(500)
    expect(isEnabled("StepCardCard"), "step card is back").toBe(true)
    expect(isEnabled("CameraCardCard"), "camera card closed").toBe(false)
    expect(stepSnapshot(), "same step, same state after Close").toBe(before)

    // ── Snapshot at TS-4 ──
    await ui.tap("Btn_Camera")
    await waitFor((x) => x.visibleCard === "camera", 3000, "camera card open (2)")
    await ui.tap("Btn_Snapshot")
    s = await waitFor((x) => x.captures.length === 1 && x.visibleCard === "camera" && x.cameraCardOpen, 6000, "snapshot taken")
    let c = s.captures[0]
    ev("snapshot", c)
    expect(c.kind, "kind").toBe("snapshot")
    expect(c.pointId, "snapshot attaches to the active test point").toBe("TS-4")
    expect(c.hasTexture, "snapshot has an image").toBe(true)
    const snapTex: Texture = app.captures[0].texture
    expect(snapTex.getWidth() >= 640, "snapshot is at least 640 px wide (" + snapTex.getWidth() + ")").toBe(true)
    const chars = await jpegChars(snapTex)
    ev("snapshot jpeg chars", {chars})
    expect(chars > 15000, "snapshot has real content (" + chars + " base64 chars)").toBe(true)
    expect(app.cameraCard.thumbHasTexture, "thumbnail shows the snapshot").toBe(true)
    expect(isEnabled("CameraThumb"), "thumbnail visible").toBe(true)
    expect(textOf("CameraStatus").indexOf("TS-4") >= 0, "status names the test point: " + textOf("CameraStatus")).toBe(true)

    // ── Photo at TS-4 ──
    await ui.tap("Btn_Photo")
    s = await waitFor((x) => x.captures.length === 2 && x.cameraCardOpen, 6000, "photo taken")
    c = s.captures[1]
    ev("photo", c)
    expect(c.kind, "kind").toBe("photo")
    expect(c.pointId, "photo attaches to TS-4").toBe("TS-4")
    expect(c.hasTexture || c.placeholder === "Photo (device only)", "photo is an image or the exact placeholder: '" + c.placeholder + "'").toBe(true)
    ev("photo result", {image: c.hasTexture, placeholder: c.placeholder})

    if (stopAt === "camera") {
      ev("CAMERA CARD PASS (stopped with the card open)", {})
      return
    }
    await ui.tap("Btn_CameraClose")
    await waitFor((x) => x.visibleCard === "step", 3000, "back to step")

    // ── Second point: F1:IN ──
    await ui.enterReading("12.1")
    await waitFor((x) => x.activePoint === "F1:IN", 3000, "F1:IN active")
    await ui.tap("Btn_Camera")
    await waitFor((x) => x.visibleCard === "camera", 3000, "camera card at F1:IN")
    await ui.tap("Btn_Snapshot")
    s = await waitFor((x) => x.captures.length === 3 && x.cameraCardOpen, 6000, "snapshot at F1:IN")
    expect(s.captures[2].pointId, "third capture attaches to F1:IN").toBe("F1:IN")
    await ui.tap("Btn_CameraClose")
    await waitFor((x) => x.visibleCard === "step" && x.activePoint === "F1:IN", 3000, "back to F1:IN")

    // ── Through the finding and retest to the Job report ──
    await ui.enterReading("12.0")
    await waitFor((x) => x.activePoint === "F1:OUT", 3000, "F1:OUT active")
    await ui.enterReading("0.0")
    await waitFor((x) => x.visibleCard === "finding", 3000, "finding card")
    await sleep(500)
    await ui.tap("Btn_Retest")
    await waitFor((x) => x.phase === "retest_wait", 3000, "retest_wait")
    let guard = 0
    while (mwnpState().s1 !== "UP" && guard < 2) {
      await ui.tap("S1_Toggle")
      guard++
    }
    await waitFor((x) => x.phase === "retest" && x.s1 === "UP", 3000, "retest active")
    await ui.enterReading("12.0")
    s = await waitFor((x) => x.visibleCard === "summary", 4000, "job report")
    await sleep(700)

    expect(textOf("SummaryTitle"), "report title").toBe("Job report")
    expect(s.reportCaptureIds.length, "report lists every capture").toBe(3)
    expect(s.reportTab, "the report opens on the Summary tab").toBe("summary")
    expect((isEnabled("Btn_SaveJobLog") || isEnabled("Btn_ReportNextPage")) && isEnabled("ReadingRow_0"), "Summary page: readings, and Save (or the next page that holds it)").toBe(true)
    expect(isEnabled("ReportCapture_" + s.captures[0].id), "pictures are not on the Summary page").toBe(false)
    await ui.tap("Btn_TabNotes")
    s = await waitFor((x) => x.reportTab === "notes", 3000, "Notes & pictures tab")
    await sleep(600)
    for (const cap of s.captures) {
      expect(isEnabled("ReportCapture_" + cap.id), "ReportCapture_" + cap.id + " on the report").toBe(true)
      expect(isEnabled("ReportCaptureThumb_" + cap.id), "thumbnail " + cap.id).toBe(true)
      expect(textOf("ReportCaptureCaption_" + cap.id).length > 0, "caption " + cap.id).toBe(true)
    }
    // Pictures are listed newest first.
    const order: number[] = []
    const collect = (o: SceneObject) => {
      const m = /^ReportCapture_(\d+)$/.exec(o.name)
      if (m) order.push(parseInt(m[1]))
      for (let i = 0; i < o.getChildrenCount(); i++) collect(o.getChild(i))
    }
    collect(findSceneObjectByName("SummaryCardCard"))
    ev("report picture order", order)
    expect(JSON.stringify(order), "newest first").toBe(JSON.stringify(s.captures.map((c: any) => c.id).reverse()))
    ev("CAMERA CARD PASS", {captures: s.captures.length})
  }
}
