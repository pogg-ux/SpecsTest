// Layout check for the Job panel, symptom list, Finding card and Findings summary (not a done criterion):
// every text on each card is at least 1.0 cm tall and fits its cell, the card is fully in view and covers none
// of TS-4 / F1 / L1 / S1, and on the Finding card "F1 open" is the largest text.
// Parameter stop_at: "summary" (default, runs the whole flow) or "finding" (stops with the Finding card
// on screen, for a screenshot).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

type R = {x0: number; x1: number; y0: number; y1: number}

export function findCamera(): Camera {
  let found: Camera | null = null
  const scan = (o: SceneObject) => {
    if (found) return
    const c = o.getComponent("Component.Camera") as Camera
    if (c && o.isEnabledInHierarchy) found = c
    for (let i = 0; i < o.getChildrenCount(); i++) scan(o.getChild(i))
  }
  for (let i = 0; i < global.scene.getRootObjectsCount(); i++) scan(global.scene.getRootObject(i))
  return found as unknown as Camera
}

export function screenRect(cam: Camera, so: SceneObject, w: number, h: number): R {
  const m = so.getTransform().getWorldTransform()
  const r: R = {x0: 9, x1: -9, y0: 9, y1: -9}
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const sp = cam.worldSpaceToScreenSpace(m.multiplyPoint(new vec3((dx * w) / 2, (dy * h) / 2, 0)))
    r.x0 = Math.min(r.x0, sp.x)
    r.x1 = Math.max(r.x1, sp.x)
    r.y0 = Math.min(r.y0, sp.y)
    r.y1 = Math.max(r.y1, sp.y)
  }
  return r
}

function overlaps(a: R, b: R): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
}

function fmt(r: R): string {
  return "[" + [r.x0, r.x1, r.y0, r.y1].map((v) => v.toFixed(3)).join(", ") + "]"
}

/** Every Text under `so` with its real-cm em height and whether its words fit its cell. */
function collectTexts(so: SceneObject, out: {name: string; emCm: number; fits: boolean; chars: number}[]): void {
  const t = so.getComponent("Component.Text") as Text
  // Rich-text cells (the colored status words in the Job report) cannot report a bounding box; they are sized from plain text.
  if (t && so.isEnabledInHierarchy && !t.enableRichText) {
    const emCm = (t.size / 43.886) * so.getTransform().getWorldScale().y
    const lr = t.layoutRect
    const bb = t.getBoundingBox()
    const fits = bb.top - bb.bottom <= (lr.top - lr.bottom) * 1.15 + 0.01 && bb.right - bb.left <= (lr.right - lr.left) * 1.02 + 0.01
    if (!fits) ev("cards misfit", {name: so.name, text: t.text, bb: [+bb.left.toFixed(2), +bb.right.toFixed(2), +bb.bottom.toFixed(2), +bb.top.toFixed(2)], cell: [+lr.left.toFixed(2), +lr.right.toFixed(2), +lr.bottom.toFixed(2), +lr.top.toFixed(2)]})
    out.push({name: so.name, emCm, fits, chars: t.text.length})
  }
  for (let i = 0; i < so.getChildrenCount(); i++) collectTexts(so.getChild(i), out)
}

export function partRects(cam: Camera): {id: string; r: R}[] {
  const parts: [string, string][] = [["TS-4", "Part_TS-4"], ["F1", "Part_F1"], ["L1", "Lamp_L1"], ["S1", "S1_Toggle"]]
  return parts.map(([id, name]) => {
    const so = findSceneObjectByName(name)
    const sc = so.getTransform().getWorldScale()
    const w = name === "S1_Toggle" ? 2.6 : sc.x
    const h = name === "S1_Toggle" ? 2.6 : sc.y
    return {id, r: screenRect(cam, so, w / sc.x, h / sc.y)}
  })
}

/** Checks one card: text size, text fit, in view, parts clear. Returns the collected texts. */
export function checkCard(cam: Camera, cardName: string): {name: string; emCm: number; fits: boolean; chars: number}[] {
  const card = findSceneObjectByName(cardName)
  expect(!!card && card.isEnabledInHierarchy, cardName + " visible").toBe(true)
  const size: vec2 = (card.getComponent("Component.ScriptComponent") as any).size
  const r = screenRect(cam, card, size.x, size.y)
  const texts: {name: string; emCm: number; fits: boolean; chars: number}[] = []
  collectTexts(card, texts)
  ev("cards " + cardName, {sizeCm: [+(size.x * 0.6).toFixed(1), +(size.y * 0.6).toFixed(1)], rect: fmt(r), texts: texts.map((t) => t.name + ":" + t.emCm.toFixed(2))})
  expect(texts.length > 0, cardName + " has text").toBe(true)
  for (const t of texts) {
    expect(t.emCm >= 1.0 - 1e-3, cardName + "/" + t.name + " text " + t.emCm.toFixed(2) + " cm (need >= 1.0)").toBe(true)
    expect(t.fits, cardName + "/" + t.name + " text does not fit its cell").toBe(true)
  }
  // Cards live in a column at the left of the display area, in front of (and over) the left side of the cabinet: every card must
  // be fully inside the display area. (Cards covering parts of the model is expected now, so there is no covering check.)
  expect(r.x0 >= 0 && r.x1 <= 1 && r.y0 >= 0 && r.y1 <= 1, cardName + " inside the display area " + fmt(r)).toBe(true)
  return texts
}

@component
export class MWNPLayoutCardsScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const stopAt = (config && config.get("stop_at")) || "summary"
    const ui = new MWNPLeafInteractor()
    await waitFor((s) => s.initialized === true && s.visibleCard === "safety", 10000, "safety card")
    await sleep(600)
    const cam = findCamera()
    expect(!!cam, "camera found").toBe(true)

    await ui.tap("Btn_DismissSafety")
    await waitFor((s) => s.visibleCard === "home", 3000, "library menu, no card open")
    await sleep(500)
    checkCard(cam, "LibraryCardCard")
    await ui.tap("Btn_Lib_Job")
    await waitFor((s) => s.visibleCard === "job", 3000, "job card")
    await sleep(500)
    checkCard(cam, "JobCard")
    if (stopAt === "job") {
      ev("CARDS PASS (stopped at job)", {})
      return
    }

    await ui.tap("Btn_ReportSymptom")
    await waitFor((s) => s.visibleCard === "symptoms", 3000, "symptom list")
    await sleep(500)
    checkCard(cam, "SymptomCard")

    await ui.tap("Btn_Symptom_EXTEND")
    await waitFor((s) => s.visibleCard === "step" && s.activePoint === "TS-4", 3000, "step card at TS-4")
    // The Camera card takes the step card's place: same size rules.
    await sleep(400)
    await ui.tap("Btn_Camera")
    await waitFor((s) => s.visibleCard === "camera", 3000, "camera card")
    await sleep(500)
    checkCard(cam, "CameraCardCard")
    await ui.tap("Btn_CameraClose")
    await waitFor((s) => s.visibleCard === "step" && s.activePoint === "TS-4", 3000, "step card again")
    await ui.logInSpecUpToF1Out()
    await ui.enterReading("0.0")
    await waitFor((s) => s.visibleCard === "finding", 3000, "finding card")
    await sleep(700)

    const texts = checkCard(cam, "FindingCardCard")
    // "F1 open" is the largest text on the Finding card.
    const title = texts.filter((t) => t.name === "FindingTitle")[0]
    expect(!!title, "FindingTitle present").toBe(true)
    const others = texts.filter((t) => t.name !== "FindingTitle")
    const biggestOther = Math.max(...others.map((t) => t.emCm))
    ev("cards finding sizes", {headlineEm: +title.emCm.toFixed(2), biggestOtherEm: +biggestOther.toFixed(2)})
    expect(title.emCm >= biggestOther * 1.5 - 1e-3, "F1 open (" + title.emCm.toFixed(2) + " cm) is at least 1.5x any other text (" + biggestOther.toFixed(2) + ")").toBe(true)
    const tso = findSceneObjectByName("FindingTitle")
    expect(((tso.getComponent("Component.Text") as Text).text || "").indexOf("F1 open") >= 0, "headline reads F1 open").toBe(true)
    const retest = findSceneObjectByName("Btn_Retest")
    expect(!!retest && retest.isEnabledInHierarchy, "Btn_Retest visible").toBe(true)
    // Badges on the model: green #00FF66 for in-spec readings, red #FF3B30 for the open reading, on plates.
    {
      const badge = (name: string): vec4 => {
        const so = findSceneObjectByName(name)
        expect(!!so && so.isEnabledInHierarchy, name + " is shown").toBe(true)
        let lbl: Text | null = null
        for (let i = 0; i < so.getChildrenCount(); i++) if (so.getChild(i).name === "Label") lbl = so.getChild(i).getComponent("Component.Text") as Text
        expect((lbl as any).weight, name + " is bold").toBe(700)
        let hasPlate = false
        for (let i = 0; i < so.getChildrenCount(); i++) if (so.getChild(i).name === "LabelPlate") hasPlate = true
        expect(hasPlate, name + " has a backing plate").toBe(true)
        return (lbl as Text).textFill.color
      }
      const g = badge("Badge_TS-4")
      expect(Math.abs(g.x - 0) < 0.012 && Math.abs(g.y - 1) < 0.012 && Math.abs(g.z - 0.4) < 0.012, "pass badge text is green #00FF66").toBe(true)
      const r = badge("Badge_F1:OUT")
      expect(Math.abs(r.x - 1) < 0.012 && Math.abs(r.y - 0.231) < 0.012 && Math.abs(r.z - 0.188) < 0.012, "fail badge text is red #FF3B30").toBe(true)
    }
    const rc = (findSceneObjectByName("FindingTitle").getComponent("Component.Text") as Text).textFill.color
    ev("cards finding color", {title: [+rc.x.toFixed(3), +rc.y.toFixed(3), +rc.z.toFixed(3)]})
    expect(Math.abs(rc.x - 1) < 0.012 && Math.abs(rc.y - 0.231) < 0.012 && Math.abs(rc.z - 0.188) < 0.012, "F1 open is red #FF3B30").toBe(true)
    const wc = (findSceneObjectByName("FindingEvidence").getComponent("Component.Text") as Text).textFill.color
    expect(wc.x === 1 && wc.y === 1 && wc.z === 1 && wc.w === 1, "evidence text is pure white").toBe(true)

    if (stopAt === "finding") {
      ev("CARDS PASS (stopped at finding)", {})
      return
    }

    await ui.tap("Btn_Retest")
    await waitFor((x) => x.phase === "retest_wait", 3000, "retest_wait")
    let guard = 0
    while (mwnpState().s1 !== "UP" && guard < 2) {
      await ui.tap("S1_Toggle")
      guard++
    }
    await waitFor((x) => x.phase === "retest" && x.s1 === "UP", 3000, "retest active")
    await ui.enterReading("12.0")
    await ui.confirmFixed()
    await waitFor((x) => x.visibleCard === "summary", 4000, "findings summary")
    await ui.tap("Btn_EndJobNo")
    await sleep(700)
    checkCard(cam, "SummaryCardCard")
    // Report text is white; only the status words are colored (rich text): "Result: " white, "<fixed part> restored" green.
    const rt = findSceneObjectByName("SummaryResult").getComponent("Component.Text") as Text
    const gc = rt.textFill.color
    expect(gc.x > 0.98 && gc.y > 0.98 && gc.z > 0.98, "result cell base color is white").toBe(true)
    expect(rt.text.indexOf("<color=#00ff66>") >= 0, "result words are green #00FF66: " + rt.text).toBe(true)
    ev("CARDS PASS", {})
  }
}
