// Card alignment: every card faces the camera square (top edge level in screen space, within 0.5 degrees), the Step card sits left of the
// cabinet and the answer card right of it without covering the backplate, and the cabinet (S1 included) stays fully visible.
// Parameter shot: "" (default) or "cards_fixed" (the same checks; the Step card + answer card state is left up for the screenshot).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev} from "./MWNPLeafInteractor"
import {findCamera, partRects, screenRect} from "./MWNPLayoutCardsScenario"

const MAX_TILT_DEG = 0.5
/** The enclosure plus its hinge leaves, centered on the cabinet origin (the board is 46 cm). */
const CABINET_W_CM = 50
const CABINET_H_CM = 46

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
    const quads: [string, SceneObject, number, number][] = [
      ["Step card", step.so, step.w, step.h],
      ["Library card/chip", lib.so, lib.w, lib.h],
      ["Answer card", findSceneObjectByName("SparkyAnswerBack"), 1, 1],
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

    // Layout: the Step card is left of the cabinet, the answer card right of it, neither over the backplate, the cabinet fully on screen.
    const cabSO: SceneObject = app.cabinet.sceneObject
    const cab = screenRect(cam, cabSO, CABINET_W_CM, CABINET_H_CM)
    const stepR = screenRect(cam, step.so, step.w, step.h)
    const ansR = screenRect(cam, findSceneObjectByName("SparkyAnswerBack"), 1, 1)
    ev("ALIGN layout", {cabinet: fmt(cab), step: fmt(stepR), answer: fmt(ansR)})
    expect(cab.x0 >= 0 && cab.x1 <= 1 && cab.y0 >= 0 && cab.y1 <= 1, "the cabinet is fully on screen " + fmt(cab)).toBe(true)
    expect(stepR.x1 <= cab.x0, "the Step card is left of the cabinet " + fmt(stepR) + " vs " + fmt(cab)).toBe(true)
    expect(ansR.x0 >= cab.x1, "the answer card is right of the cabinet " + fmt(ansR) + " vs " + fmt(cab)).toBe(true)
    expect(overlaps(stepR, cab) || overlaps(ansR, cab), "no card over the backplate").toBe(false)
    expect(stepR.x0 >= 0 && ansR.x1 <= 1 && stepR.y0 >= 0 && ansR.y0 >= 0, "both cards inside the display area").toBe(true)
    // S1, TS-4, F1 and L1 are all visible: no card covers them.
    for (const p of partRects(cam)) {
      expect(overlaps(stepR, p.r) || overlaps(ansR, p.r), p.id + " is not covered by a card").toBe(false)
    }

    // Information: how wide each card is against the side bands (cards wider than a band run over the cabinet when open).
    const bandCm = (cab.x0 - 0.03) * 0.579 * 150
    const widths: string[] = []
    for (const [n, c] of [["job", app.jobPanel], ["step", app.stepCard], ["finding", app.findingCard], ["summary", app.summaryCard], ["camera", app.cameraCard], ["options", app.optionsCard], ["notes", app.notesCard], ["viewer", app.photoViewer], ["schematic", app.schematicPanel]] as [string, any][]) {
      widths.push(n + ":" + (Number(c.widthCm) * (c.sceneObject as SceneObject).getTransform().getWorldScale().x).toFixed(1))
    }
    ev("ALIGN card widths (cm) vs left band", {band: +bandCm.toFixed(1), widths: widths.join(" ")})
    ev("CARD ALIGNMENT PASS", {})
  }
}
