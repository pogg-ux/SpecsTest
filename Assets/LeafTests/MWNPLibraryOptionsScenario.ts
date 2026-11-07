// Docked Library menu + Options: the menu sits at the upper left (clear of TS-4 / F1 / L1 / S1 / PS1's label, in view,
// clear of every other card), opens every card and returns, collapses to a "Library" tab and expands again independently
// of the main Hide, each card keeps its state while away, every Options toggle changes what it says (and does it), and
// labels stay up with the cards hidden when set to "Always on". Every control visited is also checked to be the first
// thing a mouse ray reaches (Interactive Preview).
// Parameter stop_at: "" (all), "start" (stops right after the safety notice, menu expanded, no card), "midjob"
// (stops at step 2 with the menu expanded, for screenshots), "optionscard", "options".

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState, rayReaches, waitFor} from "./MWNPLeafInteractor"
import {checkCard, findCamera, partRects, screenRect} from "./MWNPLayoutCardsScenario"

type R = {x0: number; x1: number; y0: number; y1: number}

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

function stepSnapshot(): string {
  const s = mwnpState()
  return JSON.stringify({visibleCard: s.visibleCard, activePoint: s.activePoint, stepIndex: s.stepIndex, stepTitle: s.stepTitle, readout: s.readout, phase: s.phase, readings: s.readings.length})
}

function cardRect(cam: Camera, cardName: string): R {
  const card = findSceneObjectByName(cardName)
  const size: vec2 = (card.getComponent("Component.ScriptComponent") as any).size
  return screenRect(cam, card, size.x, size.y)
}

function overlaps(a: R, b: R): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
}

/** Screen rect of the printed label of a part tag (its Text bounding box). */
function tagRect(cam: Camera, tagName: string): R | null {
  const tag = findSceneObjectByName(tagName)
  if (!tag) return null
  for (let i = 0; i < tag.getChildrenCount(); i++) {
    const ch = tag.getChild(i)
    const t = ch.getComponent("Component.Text") as Text
    if (!t) continue
    const bb = t.getBoundingBox()
    const m = ch.getTransform().getWorldTransform()
    const r: R = {x0: 9, x1: -9, y0: 9, y1: -9}
    for (const [x, y] of [[bb.left, bb.bottom], [bb.right, bb.bottom], [bb.right, bb.top], [bb.left, bb.top]]) {
      const sp = cam.worldSpaceToScreenSpace(m.multiplyPoint(new vec3(x, y, 0)))
      r.x0 = Math.min(r.x0, sp.x)
      r.x1 = Math.max(r.x1, sp.x)
      r.y0 = Math.min(r.y0, sp.y)
      r.y1 = Math.max(r.y1, sp.y)
    }
    return r
  }
  return null
}

@component
export class MWNPLibraryOptionsScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const stopAt = (config && config.get("stop_at")) || ""
    const ui = new MWNPLeafInteractor()
    const app = (global as any).mwnpAssistant
    const cam = findCamera()
    const camPos = cam.getSceneObject().getTransform().getWorldPosition()

    /** Every control must be the first thing a mouse ray reaches. */
    const reach = async (...names: string[]) => {
      for (const n of names) {
        const why = await rayReaches(camPos, n)
        expect(why, n + " reachable by mouse ray").toBe("")
      }
    }
    /** The open card must not overlap the docked menu. */
    const clearOfMenu = (cardName: string) => {
      const a = cardRect(cam, "LibraryCardCard")
      const b = cardRect(cam, cardName)
      expect(overlaps(a, b), cardName + " clear of the Library menu").toBe(false)
    }
    const pick = async (button: string, card: string) => {
      await ui.tap(button)
      await waitFor((s) => s.visibleCard === card, 3000, card + " card")
      await sleep(350)
    }

    // ── Start: after the safety notice the menu is docked and expanded, no card is open ──
    await waitFor((s) => s.initialized === true && s.visibleCard === "safety", 10000, "safety card")
    await sleep(500)
    await reach("Btn_DismissSafety")
    await ui.tap("Btn_DismissSafety")
    let s = await waitFor((x) => x.visibleCard === "home", 3000, "home: menu only")
    await sleep(600)
    expect(s.libraryOpen && !s.libraryCollapsed, "Library menu expanded at start").toBe(true)
    for (const n of ["JobCard", "SymptomCard", "StepCardCard", "FindingCardCard", "SummaryCardCard", "CameraCardCard", "OptionsCardCard"]) {
      expect(isEnabled(n), n + " closed at start").toBe(false)
    }
    for (const n of ["Btn_LibraryToggle", "Btn_Lib_Job", "Btn_Lib_Control", "Btn_Lib_Report", "Btn_Lib_Camera", "Btn_Lib_Options"]) expect(isEnabled(n), n + " present").toBe(true)

    // Docked at the upper left, over the cabinet's top-left corner: in view, clear of the key parts and PS1's label.
    checkCard(cam, "LibraryCardCard")
    const menu = cardRect(cam, "LibraryCardCard")
    const trainer = findSceneObjectByName("MWNPTrainer")
    const half = (trainer.getComponent("Component.ScriptComponent") as any).getBoardHalfSize() as vec2
    const corner = cam.worldSpaceToScreenSpace(trainer.getTransform().getWorldTransform().multiplyPoint(new vec3(-half.x, half.y, 0)))
    ev("library dock", {menu: [menu.x0, menu.x1, menu.y0, menu.y1].map((v) => +v.toFixed(3)), cabinetTopLeft: [+corner.x.toFixed(3), +corner.y.toFixed(3)]})
    expect(menu.x0 < corner.x + 0.1 && menu.x1 > corner.x - 0.02 && menu.y0 < corner.y + 0.02, "menu is at the cabinet's top-left corner").toBe(true)
    expect(menu.x1 < 0.5, "menu is in the left half of the view (x1 " + menu.x1.toFixed(3) + ")").toBe(true)
    const ps1 = tagRect(cam, "Tag_PS1")
    expect(!!ps1, "PS1 label found").toBe(true)
    if (ps1) expect(overlaps(menu, ps1), "menu clear of PS1's label").toBe(false)
    await reach("Btn_LibraryToggle", "Btn_Lib_Job", "Btn_Lib_Control", "Btn_Lib_Report", "Btn_Lib_Camera", "Btn_Lib_Options", "Btn_DisplayToggle")
    // The Library's Hide / Show is the same button as the main one: label, size, style, and its place just outside the
    // card's top corner (flush with the corner's side, 1.0 above the top edge), clear of the key parts and PS1's label.
    {
      const sty = (name: string) => {
        const b = findSceneObjectByName(name)
        let t: Text | null = null
        let lblSO: SceneObject = b
        for (let i = 0; i < b.getChildrenCount(); i++) {
          if (b.getChild(i).name === "Label") {
            lblSO = b.getChild(i)
            t = lblSO.getComponent("Component.Text") as Text
          }
        }
        const btn = b.getComponent("Component.ScriptComponent") as any
        const ws = b.getTransform().getWorldScale()
        return {text: (t as Text).text, em: ((t as Text).size / 43.886) * lblSO.getTransform().getWorldScale().y, weight: (t as any).weight, color: (t as Text).textFill.color, w: btn.size.x * ws.x, h: btn.size.y * ws.y}
      }
      const lib = sty("Btn_LibraryToggle")
      const main = sty("Btn_DisplayToggle")
      ev("hide buttons", {lib: {text: lib.text, em: lib.em, w: lib.w, h: lib.h}, main: {text: main.text, em: main.em, w: main.w, h: main.h}})
      expect(lib.text, "Library button label").toBe("Hide")
      expect(main.text, "main button label").toBe("Hide")
      expect(Math.abs(lib.em - main.em) < 0.01 && lib.weight === main.weight, "same text size and weight").toBe(true)
      expect(Math.abs(lib.color.x - main.color.x) + Math.abs(lib.color.y - main.color.y) + Math.abs(lib.color.z - main.color.z) < 0.01, "same text color").toBe(true)
      expect(Math.abs(lib.w - main.w) < 0.05 && Math.abs(lib.h - main.h) < 0.05, "same button size (" + lib.w.toFixed(2) + "x" + lib.h.toFixed(2) + " vs " + main.w.toFixed(2) + "x" + main.h.toFixed(2) + " cm)").toBe(true)

      // Placement: in the card host's own units the button sits at (W/2 - w/2, h/2 + 1.0) = flush with the card's right edge, 1.0 above its top.
      const place = (btnName: string, hostName: string, width: number) => {
        const host = findSceneObjectByName(hostName).getTransform()
        const b = findSceneObjectByName(btnName).getTransform().getWorldPosition()
        const local = host.getInvertedWorldTransform().multiplyPoint(b)
        return {x: local.x, y: local.y, expectX: width / 2 - 4, expectY: 1.8 + 1.0}
      }
      const pl = place("Btn_LibraryToggle", "LibraryCard", app.libraryCard.menuWidth)
      const pm = place("Btn_DisplayToggle", "StepCard", 32)
      ev("hide button placement", {library: pl, main: pm})
      // (Placement is checked on screen below: each Hide button sits inside the top-right corner of its card's header.)
      const btnRect = (name: string): R => {
        const so = findSceneObjectByName(name)
        const sz = (so.getComponent("Component.ScriptComponent") as any).size
        return screenRect(cam, so, sz.x, sz.y)
      }
      const libCard = cardRect(cam, "LibraryCardCard")
      const libBtn = btnRect("Btn_LibraryToggle")
      expect(libBtn.y0 >= libCard.y0 - 0.002 && libBtn.y1 <= libCard.y0 + (libCard.y1 - libCard.y0) * 0.2, "Library button sits in the Library card's header").toBe(true)
      expect(libBtn.x1 <= libCard.x1 + 0.002 && libCard.x1 - libBtn.x1 < 0.04, "Library button is at the card's top-right corner").toBe(true)
      for (const [name, r] of [["Library button", libBtn], ["main button", btnRect("Btn_DisplayToggle")]] as [string, R][]) {
        expect(r.x0 >= 0 && r.x1 <= 1 && r.y0 >= 0 && r.y1 <= 1, name + " in view").toBe(true)
        for (const p of partRects(cam)) expect(overlaps(p.r, r), name + " covers " + p.id).toBe(false)
        if (ps1) expect(overlaps(ps1, r), name + " covers PS1's label").toBe(false)
      }
    }
    if (stopAt === "start") {
      ev("LIBRARY OPTIONS PASS (stopped at the start state)", {})
      return
    }

    // ── Library Hide / Show: same fade and states as the main one; the button stays in place ──
    // The button itself (the tap helper waits longer than the fade, so the fade is sampled through the same call the button makes).
    await ui.tap("Btn_LibraryToggle")
    await waitFor((x) => x.libraryHidden && !x.libraryFading && x.libraryAlpha === 0, 3000, "library hidden by its button")
    expect(labelOf("Btn_LibraryToggle"), "button says Show").toBe("Show")
    await ui.tap("Btn_LibraryToggle")
    await waitFor((x) => !x.libraryHidden && !x.libraryFading && x.libraryAlpha === 1, 3000, "library shown by its button")
    expect(labelOf("Btn_LibraryToggle"), "button says Hide").toBe("Hide")
    const libBtnPos = findSceneObjectByName("Btn_LibraryToggle").getTransform().getWorldPosition()
    app.setLibraryHidden(true)
    const fadeSamples: number[] = []
    const t0 = getTime()
    while (getTime() - t0 < 1.5) {
      const d = mwnpState()
      fadeSamples.push(+d.libraryAlpha.toFixed(2))
      if (d.libraryHidden && !d.libraryFading && d.libraryAlpha === 0) break
      await sleep(15)
    }
    ev("library fade samples", fadeSamples)
    s = await waitFor((x) => x.libraryHidden && !x.libraryFading && x.libraryAlpha === 0, 3000, "library hidden")
    expect(labelOf("Btn_LibraryToggle"), "button says Show while hidden").toBe("Show")
    for (const n of ["Btn_Lib_Job", "Btn_Lib_Control", "Btn_Lib_Report", "Btn_Lib_Camera", "Btn_Lib_Options"]) expect(isEnabled(n), n + " hidden").toBe(false)
    expect(isEnabled("Btn_LibraryToggle"), "Show button stays").toBe(true)
    expect(findSceneObjectByName("Btn_LibraryToggle").getTransform().getWorldPosition().distance(libBtnPos) < 0.01, "Show button stays in the same spot").toBe(true)
    expect(isEnabled("Btn_DisplayToggle") && !mwnpState().display.hidden, "the main Hide is unaffected").toBe(true)
    await reach("Btn_LibraryToggle")
    if (stopAt === "bothhidden") {
      await ui.tap("Btn_LibraryToggle")
      await waitFor((x) => !x.libraryHidden && !x.libraryFading && x.libraryAlpha === 1, 3000, "library shown (setup)")
      await ui.tap("Btn_Lib_Job")
      await waitFor((x) => x.visibleCard === "job", 3000, "job card (setup)")
      await sleep(400)
      await ui.tap("Btn_LibraryToggle")
      await ui.tap("Btn_DisplayToggle")
      await waitFor((x) => x.display.hidden && !x.display.fading && x.display.alpha === 0 && x.libraryHidden && !x.libraryFading, 3000, "both hidden")
      expect(isEnabled("Btn_DisplayToggle") && isEnabled("Btn_LibraryToggle"), "both buttons stay").toBe(true)
      ev("LIBRARY OPTIONS PASS (stopped with both sides hidden)", {})
      return
    }
    await ui.tap("Btn_LibraryToggle")
    await waitFor((x) => !x.libraryHidden && !x.libraryFading && x.libraryAlpha === 1, 3000, "library shown")
    expect(labelOf("Btn_LibraryToggle"), "button says Hide again").toBe("Hide")
    for (const n of ["Btn_Lib_Job", "Btn_Lib_Control", "Btn_Lib_Report", "Btn_Lib_Camera", "Btn_Lib_Options"]) expect(isEnabled(n), n + " back").toBe(true)
    expect(fadeSamples.filter((v) => v > 0.02 && v < 0.98).length >= 3, "it fades, not a pop: " + fadeSamples.join(",")).toBe(true)

    // ── Job card and symptom list from the menu; leaving and returning keeps each ──
    await pick("Btn_Lib_Job", "job")
    checkCard(cam, "JobCard")
    clearOfMenu("JobCard")
    expect(isEnabled("Btn_LibraryToggle"), "menu stays while a card is open").toBe(true)
    await reach("Btn_ReportSymptom")
    await ui.tap("Btn_ReportSymptom")
    await waitFor((x) => x.visibleCard === "symptoms", 3000, "symptoms")
    await sleep(350)
    clearOfMenu("SymptomCard")
    await pick("Btn_Lib_Options", "options")
    expect(isEnabled("SymptomCard"), "symptom list hidden while Options shows").toBe(false)
    await pick("Btn_Lib_Job", "symptoms")
    expect(isEnabled("Btn_Symptom_EXTEND"), "symptom list is back").toBe(true)
    await ui.tap("Btn_Symptom_EXTEND")
    await waitFor((x) => x.visibleCard === "step" && x.activePoint === "TS-4", 3000, "step at TS-4")
    await sleep(350)
    clearOfMenu("StepCardCard")
    await ui.enterReading("12.1")
    await waitFor((x) => x.activePoint === "F1:IN", 3000, "F1:IN active")
    await ui.tap("Key_1")
    const before = stepSnapshot()
    await reach("Btn_Camera", "Btn_Schematic", "Key_Enter")
    if (stopAt === "midjob") {
      ev("LIBRARY OPTIONS PASS (stopped mid-job)", {})
      return
    }

    // Job report (partial) from the menu, then back to the same step.
    await pick("Btn_Lib_Report", "report")
    expect(textOf("SummaryTitle"), "report title").toBe("Job report")
    expect(mwnpState().summaryRows.length, "report lists the reading so far").toBe(1)
    expect(textOf("SummaryResult").indexOf("in progress") >= 0, "partial report says in progress").toBe(true)
    checkCard(cam, "SummaryCardCard")
    clearOfMenu("SummaryCardCard")
    await reach("Btn_SaveJobLog")
    await pick("Btn_Lib_Job", "step")
    expect(stepSnapshot(), "Job resumes the same step with the same entry").toBe(before)

    // Camera from the step card closes back to the step; from the menu it closes back to where it came from.
    await ui.tap("Btn_Camera")
    await waitFor((x) => x.visibleCard === "camera", 3000, "camera from the step card")
    await sleep(350)
    clearOfMenu("CameraCardCard")
    await ui.tap("Btn_CameraClose")
    await waitFor((x) => x.visibleCard === "step", 3000, "close returns to the step")
    expect(stepSnapshot(), "same step after the camera").toBe(before)
    await pick("Btn_Lib_Camera", "camera")
    expect(textOf("CameraTarget").indexOf("F1") >= 0, "camera card names F1 IN: " + textOf("CameraTarget")).toBe(true)
    await reach("Btn_Snapshot", "Btn_Photo", "Btn_CameraClose")
    await ui.tap("Btn_Snapshot")
    s = await waitFor((x) => x.captures.length === 1 && x.cameraCardOpen, 6000, "snapshot from the menu")
    expect(s.captures[0].pointId, "snapshot attaches to F1:IN").toBe("F1:IN")
    await ui.tap("Btn_CameraClose")
    await waitFor((x) => x.visibleCard === "step", 3000, "close returns to the step (opened from the menu over the step)")
    expect(stepSnapshot(), "same step after the camera from the menu").toBe(before)
    await pick("Btn_Lib_Options", "options")
    await pick("Btn_Lib_Camera", "camera")
    expect(app.cameraCard.thumbHasTexture, "camera card kept its thumbnail").toBe(true)
    await ui.tap("Btn_CameraClose")
    await waitFor((x) => x.visibleCard === "options", 3000, "close returns to Options")
    await sleep(300)

    // ── Options: defaults and each toggle says what it does ──
    checkCard(cam, "OptionsCardCard")
    clearOfMenu("OptionsCardCard")
    await reach("Opt_Labels", "Opt_HideButton", "Opt_CardStyle", "Opt_TextSize", "Opt_Schematic")
    const expectLabels = (m: {[k: string]: string}) => {
      for (const k of Object.keys(m)) expect(labelOf(k), k + " says").toBe(m[k])
    }
    expectLabels({Opt_Labels: "Labels: Always on", Opt_HideButton: "Hide button: Cards only", Opt_CardStyle: "Card style: Translucent", Opt_TextSize: "Text size: Normal", Opt_Schematic: "Schematic: Normal"})
    if (stopAt === "optionscard") {
      ev("LIBRARY OPTIONS PASS (stopped with the options card open)", {})
      return
    }

    const plateAlpha = (): number => {
      const so = findSceneObjectByName("OptionsCardCard")
      const rr = (so.getComponent("Component.ScriptComponent") as any).roundedRectangle
      return rr.backgroundColor.w
    }
    expect(Math.abs(plateAlpha() - 0.9) < 0.01, "translucent plate alpha 0.9, got " + plateAlpha()).toBe(true)
    await ui.tap("Opt_CardStyle")
    expect(labelOf("Opt_CardStyle"), "style toggle text").toBe("Card style: Opaque")
    expect(mwnpState().options.cardStyle, "state").toBe("Opaque")
    expect(Math.abs(plateAlpha() - 1) < 0.01, "opaque plate alpha 1, got " + plateAlpha()).toBe(true)
    expect(Math.abs((findSceneObjectByName("LibraryCardCard").getComponent("Component.ScriptComponent") as any).roundedRectangle.backgroundColor.w - 1) < 0.01, "the menu follows the card style").toBe(true)
    await ui.tap("Opt_CardStyle")
    expect(labelOf("Opt_CardStyle"), "style toggle text back").toBe("Card style: Translucent")
    expect(Math.abs(plateAlpha() - 0.9) < 0.01, "translucent again").toBe(true)

    await ui.tap("Opt_Labels")
    expect(labelOf("Opt_Labels"), "labels toggle text").toBe("Labels: Hide with cards")
    expect(mwnpState().options.labels).toBe("Hide with cards")
    await ui.tap("Opt_Labels")
    expect(labelOf("Opt_Labels")).toBe("Labels: Always on")
    await ui.tap("Opt_HideButton")
    expect(labelOf("Opt_HideButton"), "hide button toggle text").toBe("Hide button: Everything")
    expect(mwnpState().options.hideButton).toBe("Everything")
    await ui.tap("Opt_HideButton")
    expect(labelOf("Opt_HideButton")).toBe("Hide button: Cards only")

    // Text size: Large and Extra large grow the text, and cards stay in view, clear of the parts and of the menu.
    const em = (n: string): number => {
      const so = findSceneObjectByName(n)
      return ((so.getComponent("Component.Text") as Text).size / 43.886) * so.getTransform().getWorldScale().y
    }
    const tabEm = (): number => {
      const tab = findSceneObjectByName("Btn_Lib_Job")
      for (let i = 0; i < tab.getChildrenCount(); i++) {
        const ch = tab.getChild(i)
        if (ch.name === "Label") return ((ch.getComponent("Component.Text") as Text).size / 43.886) * ch.getTransform().getWorldScale().y
      }
      return 0
    }
    const em0 = em("OptionsTitle")
    const menuEm = tabEm()
    await ui.tap("Opt_TextSize")
    expect(labelOf("Opt_TextSize"), "size toggle text").toBe("Text size: Large")
    await sleep(500)
    const em1 = em("OptionsTitle")
    ev("text size", {normal: em0, large: em1})
    expect(em1 > em0 * 1.15, "Large text is bigger (" + em0.toFixed(2) + " -> " + em1.toFixed(2) + " cm)").toBe(true)
    checkCard(cam, "OptionsCardCard")
    clearOfMenu("OptionsCardCard")
    await ui.tap("Opt_TextSize")
    expect(labelOf("Opt_TextSize")).toBe("Text size: Extra large")
    await sleep(500)
    const em2 = em("OptionsTitle")
    expect(em2 > em1 * 1.1, "Extra large text is bigger still (" + em2.toFixed(2) + " cm)").toBe(true)
    checkCard(cam, "OptionsCardCard")
    clearOfMenu("OptionsCardCard")
    expect(Math.abs(tabEm() - menuEm) < 0.01, "the menu keeps its compact size").toBe(true)
    checkCard(cam, "LibraryCardCard")
    await pick("Btn_Lib_Job", "step")
    await sleep(500)
    checkCard(cam, "StepCardCard")
    clearOfMenu("StepCardCard")
    await pick("Btn_Lib_Report", "report")
    await sleep(1800) // a tall card steps down through the text sizes until it fits the view
    checkCard(cam, "SummaryCardCard")
    clearOfMenu("SummaryCardCard")
    ev("applied factors", mwnpState().options.appliedFactors)

    // Schematic: Enlarged is wider on screen and still inside the view.
    await pick("Btn_Lib_Options", "options")
    await ui.tap("Opt_TextSize") // back to Normal
    expect(labelOf("Opt_TextSize"), "size cycles back").toBe("Text size: Normal")
    await pick("Btn_Lib_Job", "step")
    await ui.tap("Btn_Schematic")
    await waitFor((x) => x.schematicOpen, 3000, "schematic open")
    await sleep(600)
    const w0 = (() => {
      const r = cardRect(cam, "SchematicCard")
      return r.x1 - r.x0
    })()
    await pick("Btn_Lib_Options", "options")
    await ui.tap("Opt_Schematic")
    expect(labelOf("Opt_Schematic"), "schematic toggle text").toBe("Schematic: Enlarged")
    await ui.tap("Btn_Lib_Job")
    await waitFor((x) => x.visibleCard === "step" && x.schematicOpen, 3000, "step with the schematic reopened")
    await sleep(600)
    const r2 = cardRect(cam, "SchematicCard")
    ev("schematic width", {normal: +w0.toFixed(3), enlarged: +(r2.x1 - r2.x0).toFixed(3), rect: [r2.x0, r2.x1, r2.y0, r2.y1].map((v) => +v.toFixed(3))})
    expect(r2.x1 - r2.x0 > w0 * 1.1, "enlarged schematic is wider on screen (" + w0.toFixed(3) + " -> " + (r2.x1 - r2.x0).toFixed(3) + ")").toBe(true)
    expect(r2.x0 >= 0 && r2.x1 <= 1 && r2.y0 >= 0 && r2.y1 <= 1, "enlarged schematic inside the view").toBe(true)
    await ui.tap("Btn_Schematic")
    await waitFor((x) => !x.schematicOpen, 3000, "schematic closed")
    if (stopAt === "options") {
      ev("LIBRARY OPTIONS PASS (stopped mid-job)", {})
      return
    }

    // ── The main Hide never hides the menu; labels stay up with the cards hidden (Always on) ──
    const labelsUp = (up: boolean, why: string) => {
      for (const n of ["Badge_TS-4", "Tag_TS-3"]) expect(isEnabled(n), n + (up ? " visible " : " hidden ") + why).toBe(up)
      expect(app.cabinet.overlayOpacity, "overlays " + why).toBe(up ? 1 : 0)
    }
    const hideAndCheck = async (labelsStay: boolean, why: string) => {
      await ui.tap("Btn_DisplayToggle")
      await waitFor((x) => x.display.hidden && !x.display.fading && x.display.alpha === 0, 3000, "cards hidden " + why)
      expect(isEnabled("StepCardCard"), "cards hidden " + why).toBe(false)
      expect(isEnabled("Btn_LibraryToggle") && isEnabled("Btn_Lib_Job"), "the menu stays " + why).toBe(true)
      expect(mwnpState().libraryHidden, "menu state untouched " + why).toBe(false)
      labelsUp(labelsStay, why)
      expect(mwnpState().display.labelsHidden, "labelsHidden " + why).toBe(!labelsStay)
      await ui.tap("Btn_DisplayToggle")
      await waitFor((x) => !x.display.hidden && !x.display.fading && x.display.alpha === 1 && x.display.labelsAlpha === 1, 3000, "shown " + why)
      expect(isEnabled("StepCardCard"), "cards back " + why).toBe(true)
      labelsUp(true, "after show " + why)
    }
    const setOption = async (button: string, expectText: string) => {
      await pick("Btn_Lib_Options", "options")
      await ui.tap(button)
      expect(labelOf(button), button + " says").toBe(expectText)
      await pick("Btn_Lib_Job", "step")
      await sleep(300)
    }
    expect(isEnabled("StepCardCard"), "step card showing").toBe(true)
    labelsUp(true, "to start")
    await hideAndCheck(true, "(Labels Always on, Hide button Cards only)")
    await setOption("Opt_Labels", "Labels: Hide with cards")
    await hideAndCheck(false, "(Labels Hide with cards)")
    await setOption("Opt_Labels", "Labels: Always on")
    await setOption("Opt_HideButton", "Hide button: Everything")
    await hideAndCheck(false, "(Hide button Everything)")
    await setOption("Opt_HideButton", "Hide button: Cards only")
    await hideAndCheck(true, "(back to defaults)")

    // A hidden Library also survives the main Hide, with its Show button in place.
    await ui.tap("Btn_LibraryToggle")
    await waitFor((x) => x.libraryHidden && !x.libraryFading && x.libraryAlpha === 0, 3000, "library hidden")
    await ui.tap("Btn_DisplayToggle")
    await waitFor((x) => x.display.hidden && !x.display.fading && x.display.alpha === 0, 3000, "cards hidden with the Library hidden")
    expect(isEnabled("Btn_LibraryToggle") && isEnabled("Btn_DisplayToggle"), "both Show buttons stay").toBe(true)
    await ui.tap("Btn_DisplayToggle")
    await waitFor((x) => !x.display.hidden && !x.display.fading && x.display.alpha === 1, 3000, "shown")
    await ui.tap("Btn_LibraryToggle")
    await waitFor((x) => !x.libraryHidden && !x.libraryFading && x.libraryAlpha === 1, 3000, "library shown")
    ev("LIBRARY OPTIONS PASS", {})
  }
}
