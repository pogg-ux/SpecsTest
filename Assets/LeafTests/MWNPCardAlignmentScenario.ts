// Card alignment: every card faces the camera square (top edge level in screen space, within 0.5 degrees), the Step card sits left of the
// cabinet and the answer card right of it without covering the backplate, and the cabinet (S1 included) stays fully visible.
// Parameter shot: "" (default) or "cards_fixed" (the same checks; the Step card + answer card state is left up for the screenshot).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev} from "./MWNPLeafInteractor"
import {findCamera, partRects, screenRect} from "./MWNPLayoutCardsScenario"

const MAX_TILT_DEG = 0.5
/** The backplate (44 cm: the 46 cm board less its 1 cm frame). Cards may overlap the frame and hinge leaves, never the plate or a part. */
const BACKPLATE_CM = 44
/** The whole board, frame included (46 cm): its height should fill about 40% of the frame. */
const BOARD_CM = 46

type R = {x0: number; x1: number; y0: number; y1: number}

/** The tilt (degrees) of a quad's top edge in screen pixels (the screen is not square), positive = slopes down to the right. */
export function topEdgeTiltDeg(cam: Camera, so: SceneObject, w: number, h: number): number {
  const m = so.getTransform().getWorldTransform()
  const a = cam.worldSpaceToScreenSpace(m.multiplyPoint(new vec3(-w / 2, h / 2, 0)))
  const b = cam.worldSpaceToScreenSpace(m.multiplyPoint(new vec3(w / 2, h / 2, 0)))
  const aspect = cam.aspect > 0.01 ? cam.aspect : 1
  // Screen space is y-down 0..1.
  return (Math.atan2(b.y - a.y, (b.x - a.x) * aspect) * 180) / Math.PI
}

function overlaps(a: R, b: R): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
}

function fmt(r: R): string {
  return "[" + [r.x0, r.x1, r.y0, r.y1].map((v) => v.toFixed(3)).join(", ") + "]"
}

@component
export class MWNPCardAlignmentScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    const app = (global as any).mwnpAssistant
    const sparky = (global as any).mwnpSparky
    sparky.setRealClips(false)
    sparky.setAsrEnabled(false)
    sparky.askTokenOverride = null
    sparky.inject("Sparky, ask why that terminal")
    await sleep(900)
    sparky.setAnswerTextForTest("TS-4 is the terminal that feeds the EXTEND branch from the S1 UP contact, so checking 12 V there confirms if S1 UP contact and wire 2a are good.")
    await sleep(700)
    const cam = findCamera()
    expect(!!cam, "camera found").toBe(true)

    // Quads to check: [name, object, width, height] in the object's own units.
    const cardBox = (name: string): {so: SceneObject; w: number; h: number} => {
      const so = findSceneObjectByName(name)
      const size: vec2 = (so.getComponent("Component.ScriptComponent") as any).size
      return {so, w: size.x, h: size.y}
    }
    const step = cardBox("StepCardCard")
    const lib = cardBox("LibraryCardCard")
    const ans = cardBox("SparkyAnswerCard")
    const quads: [string, SceneObject, number, number][] = [
      ["Step card", step.so, step.w, step.h],
      ["Library card/chip", lib.so, lib.w, lib.h],
      ["Answer card", ans.so, ans.w, ans.h],
      ["Mic chip", findSceneObjectByName("SparkyMic"), 1, 1],
    ]
    for (const [name, so, w, h] of quads) {
      const tilt = topEdgeTiltDeg(cam, so, w, h)
      ev("ALIGN " + name, {tiltDeg: +tilt.toFixed(3), rect: fmt(screenRect(cam, so, w, h))})
      expect(Math.abs(tilt) <= MAX_TILT_DEG, name + " top edge " + tilt.toFixed(2) + " deg from horizontal (max " + MAX_TILT_DEG + ")").toBe(true)
    }
    // The hosts themselves carry no rotation of their own relative to the layout root (no yaw toward the camera, no roll).
    for (const host of [app.stepCard, app.libraryCard, app.jobPanel, app.findingCard, app.summaryCard, app.cameraCard, app.optionsCard, app.notesCard, app.photoViewer, app.schematicPanel]) {
      const q = (host.sceneObject as SceneObject).getTransform().getLocalRotation()
      const e = q.toEulerAngles()
      const deg = [e.x, e.y, e.z].map((v) => Math.abs((((v * 180) / Math.PI + 540) % 360) - 180))
      expect(Math.max(...deg) < 0.05, host.sceneObject.name + " host rotation " + deg.map((v) => v.toFixed(2)).join(",")).toBe(true)
    }

    // Layout: the Step card is left of the cabinet, the answer card right of it, neither over the backplate or any part, both centered
    // vertically on the cabinet, the cabinet fully on screen and about 40% of the frame height.
    const cabSO: SceneObject = app.cabinet.sceneObject
    const board = screenRect(cam, cabSO, BOARD_CM, BOARD_CM)
    const plate = screenRect(cam, cabSO, BACKPLATE_CM, BACKPLATE_CM)
    const stepR = screenRect(cam, step.so, step.w, step.h)
    const ansR = screenRect(cam, ans.so, ans.w, ans.h)
    ev("ALIGN layout", {board: fmt(board), backplate: fmt(plate), step: fmt(stepR), answer: fmt(ansR)})
    expect(board.x0 >= 0 && board.x1 <= 1 && board.y0 >= 0 && board.y1 <= 1, "the cabinet is fully on screen " + fmt(board)).toBe(true)
    const heightFrac = board.y1 - board.y0
    expect(heightFrac > 0.38 && heightFrac < 0.46, "the cabinet fills about 40% of the frame height: " + heightFrac.toFixed(3)).toBe(true)
    expect(stepR.x1 <= plate.x0, "the Step card is left of the backplate " + fmt(stepR) + " vs " + fmt(plate)).toBe(true)
    expect(ansR.x0 >= plate.x1, "the answer card is right of the backplate " + fmt(ansR) + " vs " + fmt(plate)).toBe(true)
    expect(overlaps(stepR, plate) || overlaps(ansR, plate), "no card over the backplate").toBe(false)
    expect(stepR.x0 >= 0 && ansR.x1 <= 1 && stepR.y0 >= 0 && ansR.y0 >= 0 && stepR.y1 <= 1 && ansR.y1 <= 1, "both cards inside the display area").toBe(true)
    const cy = (board.y0 + board.y1) / 2
    expect(Math.abs((stepR.y0 + stepR.y1) / 2 - cy) < 0.01, "the Step card is centered vertically on the cabinet: " + ((stepR.y0 + stepR.y1) / 2).toFixed(3) + " vs " + cy.toFixed(3)).toBe(true)
    expect(Math.abs((ansR.y0 + ansR.y1) / 2 - cy) < 0.01, "the answer card is centered vertically on the cabinet: " + ((ansR.y0 + ansR.y1) / 2).toFixed(3) + " vs " + cy.toFixed(3)).toBe(true)
    // No part is covered by a card: S1, TS-4, F1, L1, and every part rectangle the cabinet reports.
    for (const p of partRects(cam)) {
      expect(overlaps(stepR, p.r) || overlaps(ansR, p.r), p.id + " is not covered by a card").toBe(false)
    }
    // The answer card is the Step card's twin: same plate fill, same real width, same real text size (at least 1.0 cm).
    const fill = (so: SceneObject): vec4 => (((so.getComponent("Component.ScriptComponent") as any).roundedRectangle as any).backgroundColor as vec4)
    const fs = fill(step.so)
    const fa = fill(ans.so)
    expect([fs.x, fs.y, fs.z, fs.w].map((v) => v.toFixed(2)).join(",") === [fa.x, fa.y, fa.z, fa.w].map((v) => v.toFixed(2)).join(","), "answer card plate fill matches the Step card").toBe(true)
    const realW = (c: {so: SceneObject; w: number}): number => c.w * c.so.getTransform().getWorldScale().x
    expect(Math.abs(realW(step) - realW(ans)) < 0.05, "answer card is as wide as the Step card: " + realW(ans).toFixed(2) + " vs " + realW(step).toFixed(2) + " cm").toBe(true)
    const emOf = (name: string): number => {
      const so = findSceneObjectByName(name)
      return ((so.getComponent("Component.Text") as Text).size / 43.886) * so.getTransform().getWorldScale().y
    }
    const stepEm = emOf("StepQuestion")
    const ansEm = emOf("AnswerText")
    expect(Math.abs(stepEm - ansEm) < 0.02 && ansEm >= 1.0 - 1e-3, "answer text is as tall as the Step card's: " + ansEm.toFixed(2) + " vs " + stepEm.toFixed(2) + " cm (>= 1.0)").toBe(true)

    // Information: how wide each card is against the side bands (cards wider than a band run over the cabinet when open).
    const bandCm = (plate.x0 - 0.03) * 0.579 * 140
    const widths: string[] = []
    for (const [n, c] of [["job", app.jobPanel], ["step", app.stepCard], ["finding", app.findingCard], ["summary", app.summaryCard], ["camera", app.cameraCard], ["options", app.optionsCard], ["notes", app.notesCard], ["viewer", app.photoViewer], ["schematic", app.schematicPanel]] as [string, any][]) {
      widths.push(n + ":" + (Number(c.widthCm) * (c.sceneObject as SceneObject).getTransform().getWorldScale().x).toFixed(1))
    }
    ev("ALIGN card widths (cm) vs left band", {band: +bandCm.toFixed(1), widths: widths.join(" ")})
    ev("CARD ALIGNMENT PASS", {})
  }
}
