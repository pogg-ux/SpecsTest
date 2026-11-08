// Layout check (not a done criterion): with the step card and schematic panel open in front of
// the cabinet, TS-4, F1, L1 and S1 stay fully clear of every card in the camera view, both
// cards stay inside the view, and the schematic sits above the step card without overlapping it.
// Leaves the schematic open so a preview screenshot shows the full layout.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

type R = {x0: number; x1: number; y0: number; y1: number}

function textOf(name: string): Text {
  return findSceneObjectByName(name).getComponent("Component.Text") as Text
}

function findCamera(): Camera {
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

/** Screen rect (0..1, y down) of a local-space rectangle (cx,cy,±w/2,±h/2) on an object. */
function screenRect(cam: Camera, so: SceneObject, w: number, h: number, z: number = 0): R {
  const m = so.getTransform().getWorldTransform()
  const r: R = {x0: 9, x1: -9, y0: 9, y1: -9}
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const wp = m.multiplyPoint(new vec3((dx * w) / 2, (dy * h) / 2, z))
    const sp = cam.worldSpaceToScreenSpace(wp)
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


function near(c: vec4, r: number, g: number, b: number, tol: number = 0.012): boolean {
  return Math.abs(c.x - r) < tol && Math.abs(c.y - g) < tol && Math.abs(c.z - b) < tol && c.w > 0.98
}

function colorStr(c: vec4): string {
  return "(" + c.x.toFixed(3) + "," + c.y.toFixed(3) + "," + c.z.toFixed(3) + "," + c.w.toFixed(3) + ")"
}


/** Every label printed on the model: the "Tag_*" and "WireLabel_*" objects (plus the board note) under PartTags. */
function modelLabels(): SceneObject[] {
  const root = findSceneObjectByName("PartTags")
  const out: SceneObject[] = []
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const c = root.getChild(i)
    if (c.name.indexOf("Tag_") === 0 || c.name.indexOf("WireLabel_") === 0 || c.name === "BoardNote") out.push(c)
  }
  return out
}

function childNamed(so: SceneObject, name: string): SceneObject | null {
  for (let i = 0; i < so.getChildrenCount(); i++) if (so.getChild(i).name === name) return so.getChild(i)
  return null
}

/** Checks one label's style: bold text on a 90% smoke-gray plate with a thin bright edge (wire number labels are cream wire sleeves with dark text). Returns its text color. */
function checkLabelStyle(so: SceneObject): vec4 {
  const lbl = childNamed(so, "Label")
  const plate = childNamed(so, "LabelPlate")
  expect(!!lbl && !!plate, so.name + " has a text and a backing plate").toBe(true)
  const t = (lbl as SceneObject).getComponent("Component.Text") as Text
  expect((t as any).weight, so.name + " text is bold").toBe(700)
  expect(t.renderOrder >= 10, so.name + " text draws on top (renderOrder " + t.renderOrder + ")").toBe(true)
  expect(t.outlineSettings.enabled, so.name + " has no blurring outline").toBe(false)
  const rr = (plate as SceneObject).getComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
  const fill = rr.backgroundColor
  const sleeve = so.name.indexOf("WireLabel_") === 0
  if (sleeve) expect(fill.w >= 0.99 && fill.x >= 0.9 && fill.y >= 0.85 && fill.z >= 0.6 && fill.z <= 0.9, so.name + " plate is a cream sleeve: " + colorStr(fill)).toBe(true)
  else expect(fill.w >= 0.85 && fill.x <= 0.2, so.name + " plate is dark smoke-gray at 90%: " + colorStr(fill)).toBe(true)
  expect(rr.border, so.name + " plate has an edge").toBe(true)
  const e = rr.borderColor
  if (!sleeve) expect(Math.max(e.x, e.y, e.z) >= 0.85 && e.w >= 0.99, so.name + " plate edge is bright: " + colorStr(e)).toBe(true)
  expect(rr.opacity, so.name + " plate fully opaque (not faded)").toBe(1)
  return t.textFill.color
}

function fmt(r: R): string {
  return "[" + [r.x0, r.x1, r.y0, r.y1].map((v) => v.toFixed(3)).join(", ") + "]"
}

@component
export class MWNPLayoutScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    await waitFor((s) => s.initialized === true && s.visibleCard === "safety", 10000, "safety card")
    await sleep(600) // let the start-pose anchoring (re-run at 0.25 s) settle
    const cam0 = findCamera()
    ;(global as any).mwnpAssistant.optionsCard.set("labels", 1) // "Always on": this scenario checks every label's style and position, so none may fade

    // Safety notice: fully in view, in the upper right (the approved position), above the cabinet and clear of it.
    {
      const so = findSceneObjectByName("SafetyNoticeCard")
      expect(!!so && so.isEnabledInHierarchy, "safety notice visible").toBe(true)
      const size: vec2 = (so.getComponent("Component.ScriptComponent") as any).size
      const r = screenRect(cam0, so, size.x, size.y)
      ev("layout notice", {size: [size.x, size.y], rect: fmt(r)})
      expect(r.x0 >= 0.02 && r.x1 <= 0.98 && r.y0 >= 0.02 && r.y1 <= 0.98, "safety notice inside view " + fmt(r)).toBe(true)
      expect((r.x0 + r.x1) / 2 > 0.5, "safety notice is on the right side of the view " + fmt(r)).toBe(true)
      const trainer0 = findSceneObjectByName("MWNPTrainer")
      const half0 = (trainer0.getComponent("Component.ScriptComponent") as any).getBoardHalfSize() as vec2
      const topRight = cam0.worldSpaceToScreenSpace(trainer0.getTransform().getWorldTransform().multiplyPoint(new vec3(half0.x, half0.y, 0)))
      expect(r.y1 <= topRight.y + 0.005, "safety notice sits above the cabinet's top edge (notice bottom " + r.y1.toFixed(3) + ", cabinet top " + topRight.y.toFixed(3) + ")").toBe(true)
    }

    // Start state: every label is idle, so every label is full-brightness pure white (never dimmed), bold, on a plate.
    {
      const labels = modelLabels()
      expect(labels.length >= 20, "found the model's labels: " + labels.length).toBe(true)
      for (const so of labels) {
        const c = checkLabelStyle(so)
        if (so.name.indexOf("WireLabel_") === 0) expect(Math.max(c.x, c.y, c.z) <= 0.2 && c.w === 1, so.name + " sleeve text is dark: " + colorStr(c)).toBe(true)
        else expect(c.x === 1 && c.y === 1 && c.z === 1 && c.w === 1, so.name + " is pure white at full brightness: " + colorStr(c)).toBe(true)
      }
      // Terminal labels are printed on TS-1..TS-5: white bold text on a dark plate, one per terminal.
      for (const id of ["TS-1", "TS-2", "TS-3", "TS-4", "TS-5"]) {
        expect(!!findSceneObjectByName("Tag_" + id), "terminal label " + id + " exists").toBe(true)
      }
      ev("layout labels", {count: labels.length})
    }

    // ID tags: text em height >= 1.0 cm in world space (the cabinet is scaled to fit the frame; 1.0 cm is the minimum for any label).
    {
      const tags = findSceneObjectByName("PartTags")
      for (let i = 0; i < tags.getChildrenCount(); i++) {
        const t = tags.getChild(i)
        if (t.name.indexOf("Tag_") !== 0) continue
        let label: Text | null = null
        for (let c = 0; c < t.getChildrenCount(); c++) {
          if (t.getChild(c).name === "Label") label = t.getChild(c).getComponent("Component.Text") as Text
        }
        expect(!!label, t.name + " has a label").toBe(true)
        if (!label) continue
        const emCm = (label.size / 43.886) * t.getTransform().getWorldScale().y
        expect(emCm >= 1.0 - 1e-3, t.name + " text " + emCm.toFixed(2) + " cm").toBe(true)
      }
      ev("layout tags", {checked: tags.getChildrenCount()})
    }

    await ui.startExtendDiagnosis()

    // Symptom picked: the active label (TS-4) and the labels on the path (F1, L1) are amber #FFB800 with an amber
    // edge; every other label stays white at full brightness.
    {
      for (const so of modelLabels()) {
        if (so.name.indexOf("Tag_") !== 0) continue
        const id = so.name.substring(4)
        const c = checkLabelStyle(so)
        const lit = id === "TS-4" || id === "F1" || id === "L1"
        if (lit) expect(near(c, 1, 0.722, 0), so.name + " is amber #FFB800: " + colorStr(c)).toBe(true)
        else expect(c.x === 1 && c.y === 1 && c.z === 1 && c.w === 1, so.name + " stays white: " + colorStr(c)).toBe(true)
        if (lit) {
          const rr = (childNamed(so, "LabelPlate") as SceneObject).getComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
          expect(near(rr.borderColor, 1, 0.722, 0), so.name + " edge is amber: " + colorStr(rr.borderColor)).toBe(true)
        }
      }
      const expected = findSceneObjectByName("ExpectedTag")
      const ec = checkLabelStyle(expected)
      expect(ec.x === 1 && ec.y === 1 && ec.z === 1, "expected tag text is white: " + colorStr(ec)).toBe(true)
    }

    // Labels stay off the spots the technician reaches (probe points, L1 lamp, S1 toggle).
    {
      const trainer1 = findSceneObjectByName("MWNPTrainer")
      const keys = (trainer1.getComponent("Component.ScriptComponent") as any).getKeyAreas() as {id: string; cx: number; cy: number; w: number; h: number}[]
      const boxes = (findSceneObjectByName("PartTags").getComponent("Component.ScriptComponent") as any).labelBoxes() as {name: string; cx: number; cy: number; w: number; h: number}[]
      let clashes: string[] = []
      for (const b of boxes) {
        for (const k of keys) {
          const ox = Math.abs(b.cx - k.cx) < (b.w + k.w) / 2
          const oy = Math.abs(b.cy - k.cy) < (b.h + k.h) / 2
          if (ox && oy) clashes.push(b.name + " covers " + k.id)
        }
      }
      ev("layout label keys", {labels: boxes.length, keyAreas: keys.length, clashes})
      expect(clashes.length === 0, "labels cover key areas: " + clashes.join("; ")).toBe(true)
    }

    // Wires and traces: every segment inside the 46 × 46 backboard (cabinet-local).
    {
      const trainer = findSceneObjectByName("MWNPTrainer")
      const half = (trainer.getComponent("Component.ScriptComponent") as any).getBoardHalfSize() as vec2
      let segs = 0
      for (let i = 0; i < trainer.getChildrenCount(); i++) {
        const w = trainer.getChild(i)
        if (w.name.indexOf("Wire_") !== 0 && w.name.indexOf("Trace_") !== 0) continue
        for (let k = 0; k < w.getChildrenCount(); k++) {
          const seg = w.getChild(k).getTransform()
          const p = seg.getLocalPosition()
          const s = seg.getLocalScale()
          segs++
          const inside = Math.abs(p.x) + s.x / 2 <= half.x && Math.abs(p.y) + s.y / 2 <= half.y
          expect(inside, w.name + "/" + w.getChild(k).name + " inside board").toBe(true)
        }
      }
      ev("layout wires", {segments: segs})
      expect(segs > 0, "wire segments found").toBe(true)
    }
    await ui.tap("Btn_Schematic")
    await waitFor((s) => s.schematicOpen === true, 3000, "schematic open")
    // One card at a time: while the schematic is open the step card is its chip.
    expect(((global as any).mwnpAssistant.stepCard as any).isCollapsed, "step card shrinks to its chip while the schematic is open").toBe(true)
    await sleep(300) // let the cards finish laying out

    const app = (global as any).mwnpAssistant

    // LEAF's own banner is visible while this scenario runs (the gate hides it otherwise).
    {
      const ov = findSceneObjectByName("LeafDebugUICamera")
      expect(!!ov && ov.enabled, "LEAF banner shown while a test runs").toBe(true)
    }

    // Step card text: at least 1.0 cm tall in real units, and every cell holds the words it was given.
    {
      // The reasoning line is behind the card's More button, and the readout lives on the Log reading keypad card: open More first.
      await ui.tap("Btn_More")
      await sleep(500)
      const names = ["Reasoning", "PathCitation", "StepTitle", "StepQuestion", "StepCitation", "Expected"]
      for (const name of names) {
        const so = findSceneObjectByName(name)
        expect(!!so && so.isEnabledInHierarchy, name + " visible").toBe(true)
        const t = so.getComponent("Component.Text") as Text
        const emCm = (t.size / 43.886) * so.getTransform().getWorldScale().y
        const lr = t.layoutRect
        const bb = t.getBoundingBox()
        const cellH = lr.top - lr.bottom
        const cellW = lr.right - lr.left
        const bbH = bb.top - bb.bottom
        const bbW = bb.right - bb.left
        ev("layout text", {name, emCm: +emCm.toFixed(2), text: t.text.length, cellH: +cellH.toFixed(2), bbH: +bbH.toFixed(2), cellW: +cellW.toFixed(2), bbW: +bbW.toFixed(2)})
        expect(emCm >= 1.0 - 1e-3, name + " text " + emCm.toFixed(2) + " cm (need >= 1.0)").toBe(true)
        expect(bbH <= cellH * 1.15 + 0.01, name + " text taller than its cell: " + bbH.toFixed(2) + " > " + cellH.toFixed(2)).toBe(true)
        expect(bbW <= cellW * 1.02 + 0.01, name + " text wider than its cell: " + bbW.toFixed(2) + " > " + cellW.toFixed(2)).toBe(true)
        if (name === "Reasoning") {
          const nlines = Math.round(bbH / (t.size / 43.886 * 1.0))
          ev("layout reasoning", {text: t.text.replace(/\n/g, " | "), approxLines: nlines})
        }
      }
    }

    // Number pad: keys about 3 cm, digits bold and at least 1.2 cm tall; retest-only switch row is not shown yet.
    {
      expect(mwnpState().switchRow, "switch row is hidden outside the retest step").toBe(false)
      await ui.tap("Btn_LogReading") // the keys are on the Log reading card
      await sleep(500)
      for (const k of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
        const so = findSceneObjectByName("Key_" + k)
        const btn = so.getComponent(Button.getTypeName()) as Button
        const ws = so.getTransform().getWorldScale()
        const wCm = btn.size.x * ws.x
        let label: Text | null = null
        for (let i = 0; i < so.getChildrenCount(); i++) if (so.getChild(i).name === "Label") label = so.getChild(i).getComponent("Component.Text") as Text
        expect(!!label, "Key_" + k + " has a label").toBe(true)
        const lt = label as Text
        const emCm = (lt.size / 43.886) * lt.getSceneObject().getTransform().getWorldScale().y
        if (k === "5") ev("layout key", {widthCm: +wCm.toFixed(2), digitEmCm: +emCm.toFixed(2), weight: (lt as any).weight})
        expect(wCm >= 3.2 && wCm <= 3.9, "Key_" + k + " is " + wCm.toFixed(2) + " cm wide (large keys, about 3.5)").toBe(true)
        expect(emCm >= 1.2 - 1e-3, "Key_" + k + " digit " + emCm.toFixed(2) + " cm (need >= 1.2)").toBe(true)
        expect((lt as any).weight, "Key_" + k + " digit is bold").toBe(700)
      }
      await ui.tap("Btn_KeypadCancel") // back to the step card
      await sleep(500)
    }

    // Vivid colors: pure white card text, #FFB800 amber, orange trace, brighter wires, thicker trace, opaque cards.
    {
      for (const n of ["Reasoning", "StepQuestion", "StepCitation", "StepTitle"]) {
        const c = textOf(n).textFill.color
        expect(near(c, 1, 1, 1), n + " is pure white: " + colorStr(c)).toBe(true)
      }
      const amber = textOf("PathCitation").textFill.color
      expect(near(amber, 1, 0.722, 0), "PathCitation is amber #FFB800: " + colorStr(amber)).toBe(true)
      const trainer0 = findSceneObjectByName("MWNPTrainer")
      const tcomp = trainer0.getComponent("Component.ScriptComponent") as any
      expect(tcomp.traceThicknessCm >= 0.7, "trace lines are thick: " + tcomp.traceThicknessCm + " cm").toBe(true)
      const seg = findSceneObjectByName("Trace_2b_3").getChild(0).getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      const tc = seg.mainMaterial.mainPass.baseColor
      // Not the current step's wire: orange #FF8C00 at 30% opacity (premultiplied).
      expect((Math.abs(tc.x - 0.3) < 0.03 && Math.abs(tc.y - 0.165) < 0.03 && tc.z < 0.03), "dimmed active trace is orange #FF8C00 at 30%: " + colorStr(tc)).toBe(true)
      let wireSeg: RenderMeshVisual | null = null
      for (let i = 0; i < trainer0.getChildrenCount(); i++) {
        const w = trainer0.getChild(i)
        if (w.name.indexOf("Wire_2b_") === 0 && w.getChildrenCount() > 0) wireSeg = w.getChild(0).getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      }
      const wc = (wireSeg as RenderMeshVisual).mainMaterial.mainPass.baseColor
      // Dimmed body opacity: 30% (the original rule), or the cabinet's wireBodyAlpha with the realistic look (round wires, default 70%).
      const cabScript = trainer0.getComponent("Component.ScriptComponent") as any
      const bodyAlpha = cabScript && cabScript.realisticLook && cabScript.vertexMaterial ? cabScript.wireBodyAlpha : 0.3
      expect(Math.abs(wc.x - bodyAlpha) < 0.04 && Math.abs(wc.y - 0.16 * bodyAlpha) < 0.03, "supply wires are red at " + Math.round(bodyAlpha * 100) + "% (dimmed, not the current step's wire): " + colorStr(wc)).toBe(true)
      const plate = findSceneObjectByName("StepCardCard").getComponent("Component.ScriptComponent") as any
      const fillA = plate && plate.roundedRectangle ? plate.roundedRectangle.backgroundColor.w : 0
      ev("layout colors", {traceThicknessCm: tcomp.traceThicknessCm, traceColor: colorStr(tc), wireColor: colorStr(wc), cardFillAlpha: +fillA.toFixed(2)})
      expect(fillA >= 0.85, "cards are nearly opaque: fill alpha " + fillA.toFixed(2)).toBe(true)
    }

    // Schematic: cropped to the active path, with a thick bright wire.
    {
      const sp = app.schematicPanel
      const full = 1335
      const cw = sp.cropRect.x1 - sp.cropRect.x0
      ev("layout schematic", {wire: sp.highlightedWire, crop: sp.cropName, cropW: cw, thickPx: +sp.highlightThickPx.toFixed(1), thickCm: +sp.highlightThickCm.toFixed(2)})
      expect(sp.cropName === "extend", "schematic cropped to the EXTEND path, got " + sp.cropName).toBe(true)
      expect(cw <= full * 0.5, "crop is zoomed in (" + cw + " px of " + full + ")").toBe(true)
      expect(sp.highlightThickPx >= 12, "highlight is >= 3x the 4 px wire: " + sp.highlightThickPx).toBe(true)
      expect(sp.highlightThickCm >= 0.4, "highlight >= 0.4 cm thick: " + sp.highlightThickCm).toBe(true)
      const c = sp.highlightColor
      expect(Math.max(c.x, c.y, c.z) >= 0.99 && c.w >= 0.99, "highlight is full-brightness").toBe(true)
      // Large labels over the drawing: >= 0.8 cm, not stretched by the image's scale, shown for this crop.
      for (const text of ["TS-4", "F1 0.5 A FB", "L1", "2a", "2b", "2c"]) {
        const lso = findSceneObjectByName("SchematicLabel_" + text)
        expect(!!lso && lso.isEnabledInHierarchy, "schematic label " + text + " shown").toBe(true)
        const lt = lso.getComponent("Component.Text") as Text
        const ws = lso.getTransform().getWorldScale()
        const emCm = (lt.size / 43.886) * ws.y
        ev("layout label", {text, emCm: +emCm.toFixed(2), scale: [+ws.x.toFixed(3), +ws.y.toFixed(3)]})
        const imgW = findSceneObjectByName("SchematicImage").getTransform().getWorldScale()
        const rootS = findSceneObjectByName("SchematicLabels").getTransform().getLocalScale()
        const imgL = findSceneObjectByName("SchematicImage").getTransform().getLocalScale()
        ev("layout label chain", {imgWorld: [+imgW.x.toFixed(3), +imgW.y.toFixed(3)], imgLocal: [+imgL.x.toFixed(3), +imgL.y.toFixed(3)], rootLocal: [+rootS.x.toFixed(4), +rootS.y.toFixed(4)]})
        expect(emCm >= 0.8 - 1e-3, "label " + text + " is " + emCm.toFixed(2) + " cm (need >= 0.8)").toBe(true)
        expect(Math.abs(ws.x - ws.y) <= 0.03 * ws.y, "label " + text + " is stretched: " + ws.x + " x " + ws.y).toBe(true)
      }
      const original = sp.highlightedWire
      for (const w of ["2a", "2b", "2c"]) {
        sp.highlight(w)
        const core = findSceneObjectByName("WireCore0")
        expect(!!core && core.isEnabledInHierarchy, "highlight bar shown for wire " + w).toBe(true)
        expect(sp.cropName === "extend", "wire " + w + " stays in the EXTEND crop").toBe(true)
      }
      sp.highlight(original)
    }

    const cam = findCamera()
    expect(!!cam, "camera found").toBe(true)

    const cards: {[n: string]: R} = {}
    for (const name of ["SchematicCard"]) {
      const so = findSceneObjectByName(name)
      expect(!!so && so.isEnabledInHierarchy, name + " visible").toBe(true)
      const plate = so.getComponent("Component.ScriptComponent") as any
      const size: vec2 = plate.size
      cards[name] = screenRect(cam, so, size.x, size.y)
      ev("layout card", {name, size: [size.x, size.y], rect: fmt(cards[name])})
      const r = cards[name]
      expect(r.x0 >= 0 && r.x1 <= 1 && r.y0 >= 0 && r.y1 <= 1, name + " inside view " + fmt(r)).toBe(true)
    }
    // Every large label sits inside the schematic card on screen.
    for (const text of ["TS-4", "F1 0.5 A FB", "L1", "2a", "2b", "2c"]) {
      const lso = findSceneObjectByName("SchematicLabel_" + text)
      const sp2 = cam.worldSpaceToScreenSpace(lso.getTransform().getWorldPosition())
      const sc = cards.SchematicCard
      expect(sp2.x > sc.x0 && sp2.x < sc.x1 && sp2.y > sc.y0 && sp2.y < sc.y1, "label " + text + " inside the schematic card").toBe(true)
    }

    // Key parts: box parts use their scale as size; lamps/S1 use their outline size from the cabinet.
    const parts: [string, string][] = [["TS-4", "Part_TS-4"], ["F1", "Part_F1"], ["L1", "Lamp_L1"], ["S1", "S1_Toggle"]]
    for (const [id, objName] of parts) {
      const so = findSceneObjectByName(objName)
      expect(!!so, objName + " exists").toBe(true)
      const sc = so.getTransform().getWorldScale()
      // S1_Toggle is unit-scale; use its 2.6 cm pinch target as the clear zone.
      const w = objName === "S1_Toggle" ? 2.6 : sc.x
      const h = objName === "S1_Toggle" ? 2.6 : sc.y
      const pr = screenRect(cam, so, w / sc.x, h / sc.y)
      ev("layout part", {id, rect: fmt(pr)})
      for (const cn of Object.keys(cards)) {
        expect(overlaps(pr, cards[cn]), id + " covered by " + cn).toBe(false)
      }
    }
    // Longest state: the amber "no guess" message grows the card downward; it must still fit the view,
    // its text must fit its cell, and the key parts must stay clear.
    {
      const long = (app.amberTemplate as string).replace("{value}", "6.0")
      app.stepCard.setResult(long, "amber")
      await sleep(500)
      const so = findSceneObjectByName("StepCardCard")
      const size: vec2 = (so.getComponent("Component.ScriptComponent") as any).size
      const r = screenRect(cam, so, size.x, size.y)
      ev("layout amber", {size: [+size.x.toFixed(1), +size.y.toFixed(1)], rect: fmt(r)})
      expect(r.x0 >= 0 && r.x1 <= 1 && r.y0 >= 0 && r.y1 <= 1, "step card with the amber message inside view " + fmt(r)).toBe(true)
      expect(overlaps(cards.SchematicCard, r), "schematic overlaps the grown step card").toBe(false)
      const rso = findSceneObjectByName("Result")
      const rt = rso.getComponent("Component.Text") as Text
      const emCm = (rt.size / 43.886) * rso.getTransform().getWorldScale().y
      const bb = rt.getBoundingBox()
      const lr = rt.layoutRect
      ev("layout result", {emCm: +emCm.toFixed(2), chars: rt.text.length, cellH: +(lr.top - lr.bottom).toFixed(2), bbH: +(bb.top - bb.bottom).toFixed(2)})
      expect(emCm >= 1.0 - 1e-3, "Result text " + emCm.toFixed(2) + " cm").toBe(true)
      expect(bb.top - bb.bottom <= (lr.top - lr.bottom) * 1.15 + 0.01, "amber message fits its cell").toBe(true)
      for (const [id, objName] of parts) {
        const po = findSceneObjectByName(objName)
        const sc = po.getTransform().getWorldScale()
        const w = objName === "S1_Toggle" ? 2.6 : sc.x
        const h = objName === "S1_Toggle" ? 2.6 : sc.y
        expect(overlaps(screenRect(cam, po, w / sc.x, h / sc.y), r), id + " covered by the grown step card").toBe(false)
      }
      app.stepCard.setResult("", "")
    }
    ev("LAYOUT PASS", {})
  }
}
