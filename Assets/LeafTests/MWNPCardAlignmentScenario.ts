// Card alignment and placement:
//  - every card faces the camera square: its top edge is level in screen space, within 0.5 degrees;
//  - the cabinet fills 55-60% of the frame height and is fully on screen;
//  - the Library chip (the mic indicator beside it) sits just above the cabinet's top-left corner; the Step chip sits just above the top-right
//    corner, right-aligned with the board's edge, and the Step card drops from it over the cabinet's right side; the answer chip (Options >
//    "Show Sparky's answers as text" On) sits just left of the Step chip and its card drops from it (overlap with the cabinet is allowed:
//    "Sparky, hide" clears the cards);
//  - the card is nudged, never the cabinet, so the current step's test point and its highlighted wire stay visible, on all five steps;
//  - the answer card is the Step card's twin (same plate, width and text size, text at least 1.0 cm).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev} from "./MWNPLeafInteractor"
import {findCamera, screenRect} from "./MWNPLayoutCardsScenario"

const MAX_TILT_DEG = 0.5
/** The whole board, frame included (46 cm): its height should fill 55-60% of the frame. */
const BOARD_CM = 46
const BOARD_HALF_CM = 23
/** How far (screen fraction) a chip may be from its corner and still count as "just above / at" it. */
const NEAR = 0.025
const LIBRARY_CHIP_CM = 7.5
const STEP_CHIP_CM = 9.6

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

function fmt(r: R): string {
  return "[" + [r.x0, r.x1, r.y0, r.y1].map((v) => v.toFixed(3)).join(", ") + "]"
}

@component
export class MWNPCardAlignmentScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    // shot = "step1": stop on step 1 with the Step card and the answer card up; "step1_default": the same with the answer option Off (for screenshots).
    const shot = (config && config.get("shot")) || ""
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    const app = (global as any).mwnpAssistant
    const sparky = (global as any).mwnpSparky
    sparky.setRealClips(false)
    sparky.setAsrEnabled(false)
    sparky.askTokenOverride = null
    app.libraryCard.collapse() // the Library shows as its chip while the Step card is open
    app.optionsCard.set("answerText", 1) // the answer card is opt-in (Options > "Show Sparky's answers as text")
    sparky.inject("Sparky, ask why that terminal")
    await sleep(900)
    sparky.setAnswerTextForTest("TS-4 is the terminal that feeds the EXTEND branch from the S1 UP contact, so checking 12 V there confirms if S1 UP contact and wire 2a are good.")
    await sleep(900)
    const cam = findCamera()
    expect(!!cam, "camera found").toBe(true)
    const tanV = Math.tan(cam.fov / 2)
    const tanH = tanV * (cam.aspect > 0.01 ? cam.aspect : 1)

    const cardBox = (name: string): {so: SceneObject; w: number; h: number} => {
      const so = findSceneObjectByName(name)
      const size: vec2 = (so.getComponent("Component.ScriptComponent") as any).size
      return {so, w: size.x, h: size.y}
    }
    const step = cardBox("StepCardCard")
    const ans = cardBox("SparkyAnswerCard")
    const ansChip = cardBox("SparkyAnswerChip")
    const quads: [string, SceneObject, number, number][] = [
      ["Step card", step.so, step.w, step.h],
      ["Answer card", ans.so, ans.w, ans.h],
      ["Answer chip", ansChip.so, ansChip.w, ansChip.h],
      ["Mic chip", findSceneObjectByName("SparkyMic"), 1, 1],
    ]
    for (const [name, so, w, h] of quads) {
      const tilt = topEdgeTiltDeg(cam, so, w, h)
      ev("ALIGN " + name, {tiltDeg: +tilt.toFixed(3), rect: fmt(screenRect(cam, so, w, h))})
      expect(Math.abs(tilt) <= MAX_TILT_DEG, name + " top edge " + tilt.toFixed(2) + " deg from horizontal (max " + MAX_TILT_DEG + ")").toBe(true)
    }
    // The hosts carry no rotation of their own relative to the layout root (no yaw toward the camera, no roll).
    for (const host of [app.stepCard, app.libraryCard, app.jobPanel, app.findingCard, app.summaryCard, app.cameraCard, app.optionsCard, app.notesCard, app.photoViewer, app.schematicPanel]) {
      const e = (host.sceneObject as SceneObject).getTransform().getLocalRotation().toEulerAngles()
      const deg = [e.x, e.y, e.z].map((v) => Math.abs((((v * 180) / Math.PI + 540) % 360) - 180))
      expect(Math.max(...deg) < 0.05, host.sceneObject.name + " host rotation " + deg.map((v) => v.toFixed(2)).join(",")).toBe(true)
    }

    // The cabinet: fully on screen, 55-60% of the frame height.
    const cabSO: SceneObject = app.cabinet.sceneObject
    const board = screenRect(cam, cabSO, BOARD_CM, BOARD_CM)
    const toScreen = (x: number, y: number): vec2 => {
      const sp = cam.worldSpaceToScreenSpace(cabSO.getTransform().getWorldTransform().multiplyPoint(new vec3(x, y, 0)))
      return new vec2(sp.x, sp.y)
    }
    const tl = toScreen(-BOARD_HALF_CM, BOARD_HALF_CM)
    const tr = toScreen(BOARD_HALF_CM, BOARD_HALF_CM)
    const heightFrac = board.y1 - board.y0
    ev("ALIGN cabinet", {board: fmt(board), heightFrac: +heightFrac.toFixed(3), topLeft: [tl.x, tl.y].map((v) => +v.toFixed(3)), topRight: [tr.x, tr.y].map((v) => +v.toFixed(3))})
    expect(board.x0 >= 0 && board.x1 <= 1 && board.y0 >= 0 && board.y1 <= 1, "the cabinet is fully on screen " + fmt(board)).toBe(true)
    expect(heightFrac >= 0.55 && heightFrac <= 0.6, "the cabinet fills 55-60% of the frame height: " + heightFrac.toFixed(3)).toBe(true)

    // Library chip: its left edge on the board's left edge, its bottom just above the board's top edge; the mic indicator beside it.
    const chipSO = findSceneObjectByName("Btn_LibraryChip")
    expect(!!chipSO && chipSO.isEnabledInHierarchy, "the Library chip is showing").toBe(true)
    const chipC = cam.worldSpaceToScreenSpace(chipSO.getTransform().getWorldPosition())
    const chipDist = cam.getSceneObject().getTransform().getWorldPosition().distance(chipSO.getTransform().getWorldPosition())
    const perCmX = 1 / (2 * tanH * chipDist)
    const perCmY = 1 / (2 * tanV * chipDist)
    const libHost = app.libraryCard.sceneObject as SceneObject
    const chipHcm = app.libraryCard.chipHeight * libHost.getTransform().getWorldScale().y
    const chipRect: R = {x0: chipC.x - (LIBRARY_CHIP_CM / 2) * perCmX, x1: chipC.x + (LIBRARY_CHIP_CM / 2) * perCmX, y0: chipC.y - (chipHcm / 2) * perCmY, y1: chipC.y + (chipHcm / 2) * perCmY}
    ev("ALIGN Library chip", {rect: fmt(chipRect)})
    expect(Math.abs(chipRect.x0 - tl.x) <= NEAR, "the Library chip's left edge is on the cabinet's left edge: " + chipRect.x0.toFixed(3) + " vs " + tl.x.toFixed(3)).toBe(true)
    expect(chipRect.y1 <= tl.y && tl.y - chipRect.y1 <= NEAR + 0.01, "the Library chip is just above the cabinet's top edge: chip bottom " + chipRect.y1.toFixed(3) + ", board top " + tl.y.toFixed(3)).toBe(true)
    const mic = screenRect(cam, findSceneObjectByName("SparkyMic"), 1, 1)
    expect(mic.x0 >= chipRect.x1 - 0.005 && Math.abs((mic.y0 + mic.y1) / 2 - (chipRect.y0 + chipRect.y1) / 2) <= 0.02, "the mic indicator is right beside the Library chip: mic " + fmt(mic)).toBe(true)

    // Answer chip (left of the Step chip, checked below): just above the board's top edge; the answer card drops from it, right edges together.
    const ansChipR = screenRect(cam, ansChip.so, ansChip.w, ansChip.h)
    const ansR = screenRect(cam, ans.so, ans.w, ans.h)
    ev("ALIGN answer", {chip: fmt(ansChipR), card: fmt(ansR)})
    expect(ansChipR.y1 <= tr.y && tr.y - ansChipR.y1 <= NEAR + 0.01, "the answer chip is just above the cabinet's top edge: chip bottom " + ansChipR.y1.toFixed(3) + ", board top " + tr.y.toFixed(3)).toBe(true)
    expect(ansR.y0 >= ansChipR.y1 - 0.003 && ansR.y0 - ansChipR.y1 <= 0.04, "the answer card drops straight from its chip: card top " + ansR.y0.toFixed(3) + ", chip bottom " + ansChipR.y1.toFixed(3)).toBe(true)
    expect(Math.abs(ansR.x1 - ansChipR.x1) <= 0.005, "the answer card and its chip share a right edge").toBe(true)
    expect(ansR.x0 < tr.x && ansR.x1 <= 1 && ansR.y1 <= 1, "the answer card runs over the cabinet's right side, inside the display").toBe(true)

    // The Step chip (shown while the Step card is collapsed): just above the top-right corner, right edge on the board's right edge, on the
    // Library chip's row. The answer chip sits just left of it.
    app.stepCard.collapse()
    await sleep(700)
    const stepChipSO = findSceneObjectByName("Btn_StepChip")
    expect(!!stepChipSO && stepChipSO.isEnabledInHierarchy, "the Step chip is showing while the card is collapsed").toBe(true)
    const sc = cam.worldSpaceToScreenSpace(stepChipSO.getTransform().getWorldPosition())
    const stepChipR: R = {x0: sc.x - (STEP_CHIP_CM / 2) * perCmX, x1: sc.x + (STEP_CHIP_CM / 2) * perCmX, y0: sc.y - (chipHcm / 2) * perCmY, y1: sc.y + (chipHcm / 2) * perCmY}
    ev("ALIGN Step chip", {rect: fmt(stepChipR)})
    expect(Math.abs(stepChipR.x1 - tr.x) <= NEAR, "the Step chip's right edge is on the cabinet's right edge: " + stepChipR.x1.toFixed(3) + " vs " + tr.x.toFixed(3)).toBe(true)
    expect(stepChipR.y1 <= tr.y + 0.01 && tr.y - stepChipR.y1 <= NEAR + 0.015, "the Step chip is just above the cabinet's top edge: chip bottom " + stepChipR.y1.toFixed(3) + ", board top " + tr.y.toFixed(3)).toBe(true)
    expect(Math.abs((stepChipR.y0 + stepChipR.y1) / 2 - (chipRect.y0 + chipRect.y1) / 2) <= 0.02, "the Step chip is on the Library chip's row").toBe(true)
    expect(ansChipR.x1 <= stepChipR.x0 + 0.005 && stepChipR.x0 - ansChipR.x1 <= 0.04, "the answer chip sits just left of the Step chip: answer chip right " + ansChipR.x1.toFixed(3) + ", Step chip left " + stepChipR.x0.toFixed(3)).toBe(true)
    app.stepCard.expand()
    await sleep(900)

    // The Step card drops from the Step chip over the right side, right edges together (unless the test point makes it slide).
    const stepR = screenRect(cam, step.so, step.w, step.h)
    const nudge0 = app.cardNudge ? app.cardNudge["StepCard"] : null
    ev("ALIGN step card", {rect: fmt(stepR), nudge: nudge0})
    expect(stepR.y0 >= stepChipR.y1 - 0.003 && stepR.y0 - stepChipR.y1 <= 0.05 || (!!nudge0 && nudge0.dy !== 0), "the Step card drops from the Step chip: card top " + stepR.y0.toFixed(3) + ", chip bottom " + stepChipR.y1.toFixed(3)).toBe(true)
    expect(Math.abs(stepR.x1 - tr.x) <= NEAR || (!!nudge0 && nudge0.dx !== 0), "the Step card's right edge is on the cabinet's right edge unless nudged: " + stepR.x1.toFixed(3) + " vs " + tr.x.toFixed(3)).toBe(true)
    expect(stepR.x0 >= 0 && stepR.x1 <= 1 && stepR.y1 <= 1, "the Step card is inside the display area").toBe(true)

    // The current step's test point and highlighted wire stay visible, on every step: the CARD is nudged (left or down), never the cabinet.
    const cabPos0 = cabSO.getTransform().getWorldPosition()
    const nSteps = (app.agent as any).steps.length
    for (let i = 0; i < nSteps; i++) {
      await sleep(900)
      const r = screenRect(cam, step.so, step.w, step.h)
      const under = (pts: vec2[]): string[] => {
        const out: string[] = []
        for (const p of pts) {
          const sp = toScreen(p.x, p.y)
          if (sp.x >= r.x0 && sp.x <= r.x1 && sp.y >= r.y0 && sp.y <= r.y1) out.push(sp.x.toFixed(3) + "," + sp.y.toFixed(3))
        }
        return out
      }
      const wire: vec2[] = app.cabinet.getFocusWireSamples()
      const pointHidden = under(app.cabinet.getFocusPointSamples())
      const wireHidden = under(wire)
      const point = app.cabinet.activePointId
      const nudge = app.cardNudge ? app.cardNudge["StepCard"] : null
      ev("ALIGN step " + (i + 1), {point, card: fmt(r), nudge, wireSamples: wire.length, wireCovered: wireHidden.length})
      // The test point is never under the card. A long wire may pass under it somewhere (wire 2b runs round the whole board), so the card sits
      // where it covers the least of the wire that any position leaves: what the app reports as its minimum (the screen check may differ by a
      // sample or two from the app's plane projection).
      expect(pointHidden.length, "step " + (i + 1) + ": test point " + point + " is not under the Step card (" + pointHidden.slice(0, 4).join(" ") + ")").toBe(0)
      expect(!!nudge && wireHidden.length <= nudge.wire + 2, "step " + (i + 1) + ": the Step card covers the least wire it can: " + wireHidden.length + " of " + wire.length + " samples (app minimum " + (nudge ? nudge.wire : "?") + ")").toBe(true)
      expect(!!nudge && nudge.point === 0, "step " + (i + 1) + ": a position that clears the test point was found").toBe(true)
      expect(r.x0 >= 0 && r.x1 <= 1 && r.y0 >= 0 && r.y1 <= 1, "step " + (i + 1) + ": the nudged Step card is still inside the display " + fmt(r)).toBe(true)
      expect(cabSO.getTransform().getWorldPosition().distance(cabPos0) < 0.001, "step " + (i + 1) + ": the cabinet did not move").toBe(true)
      if (i === 0 && (shot === "step1" || shot === "step1_default")) {
        // step1_default: the state a person starts in (answer text option Off, no answer card), with the Step card open.
        if (shot === "step1_default") {
          app.optionsCard.set("answerText", 0)
          await sleep(500)
        }
        ev("CARD ALIGNMENT PASS (stopped at step 1)", {})
        return
      }
      if (i < nSteps - 1) {
        app.voiceCommand("next")
        await sleep(500)
      }
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
    ev("CARD ALIGNMENT PASS", {})
  }
}
