// Layout check (not a done criterion): with the step card and schematic panel open in front of
// the cabinet, TS-4, F1, L1 and S1 stay fully clear of every card in the camera view, both
// cards stay inside the view, and the schematic sits above the step card without overlapping it.
// Leaves the schematic open so a preview screenshot shows the full layout.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
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
    await ui.startExtendDiagnosis()
    await ui.tap("Btn_Schematic")
    await waitFor((s) => s.schematicOpen === true, 3000, "schematic open")

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
    ev("LAYOUT PASS", {})
  }
}
