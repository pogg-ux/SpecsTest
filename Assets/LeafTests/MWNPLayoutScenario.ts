// Layout check (not a done criterion): with the step card and schematic panel open in front of
// the cabinet, TS-4, F1, L1 and S1 stay fully clear of every card in the camera view, both
// cards stay inside the view, and the schematic sits above the step card without overlapping it.
// Leaves the schematic open so a preview screenshot shows the full layout.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, waitFor} from "./MWNPLeafInteractor"

type R = {x0: number; x1: number; y0: number; y1: number}

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

    // Safety notice: fully in view and roughly centered horizontally.
    {
      const so = findSceneObjectByName("SafetyNoticeCard")
      expect(!!so && so.isEnabledInHierarchy, "safety notice visible").toBe(true)
      const size: vec2 = (so.getComponent("Component.ScriptComponent") as any).size
      const r = screenRect(cam0, so, size.x, size.y)
      ev("layout notice", {size: [size.x, size.y], rect: fmt(r)})
      expect(r.x0 >= 0.02 && r.x1 <= 0.98 && r.y0 >= 0.02 && r.y1 <= 0.98, "safety notice inside view " + fmt(r)).toBe(true)
      expect(Math.abs((r.x0 + r.x1) / 2 - 0.5) < 0.05, "safety notice centered " + fmt(r)).toBe(true)
    }

    // ID tags: text em height ≥ 1.5 cm in world space.
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
        expect(emCm >= 1.5 - 1e-3, t.name + " text " + emCm.toFixed(2) + " cm").toBe(true)
      }
      ev("layout tags", {checked: tags.getChildrenCount()})
    }

    await ui.startExtendDiagnosis()

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
    await sleep(300) // let the cards finish laying out

    const app = (global as any).mwnpAssistant

    // LEAF's own banner is visible while this scenario runs (the gate hides it otherwise).
    {
      const ov = findSceneObjectByName("LeafDebugUICamera")
      expect(!!ov && ov.enabled, "LEAF banner shown while a test runs").toBe(true)
    }

    // Step card text: at least 1.0 cm tall in real units, and every cell holds the words it was given.
    {
      const names = ["Reasoning", "PathCitation", "StepTitle", "StepQuestion", "StepCitation", "Expected", "Readout"]
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
    for (const name of ["StepCardCard", "SchematicCard"]) {
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
    expect(cards.SchematicCard.y1 <= cards.StepCardCard.y0, "schematic above step card").toBe(true)
    expect(overlaps(cards.SchematicCard, cards.StepCardCard), "schematic overlaps step card").toBe(false)

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
