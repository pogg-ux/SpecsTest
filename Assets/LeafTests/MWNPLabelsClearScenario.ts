// With every label on: no label overlaps another label, none sits outside the backplate (clipped), no label covers a key spot
// (probe points, L1, S1), and no wire sleeve sits behind or under a part. Prints every violation.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {findSceneObjectByName} from "Leaf.lspkg/Utils/common/Utils"
import {ev} from "./MWNPLeafInteractor"
import {prepareShot} from "./MWNPShotKit"

interface Box {
  name: string
  cx: number
  cy: number
  w: number
  h: number
}

@component
export class MWNPLabelsClearScenario extends Scenario {
  async run(): Promise<void> {
    const app = await prepareShot(false)
    app.optionsCard.set("labels", 1)
    await sleep(800)
    const cab = findSceneObjectByName("MWNPTrainer").getComponent("Component.ScriptComponent") as any
    const boxes = (findSceneObjectByName("PartTags").getComponent("Component.ScriptComponent") as any).labelBoxes() as Box[]
    const keys = cab.getKeyAreas() as {id: string; cx: number; cy: number; w: number; h: number}[]
    const parts = cab.getPartRects() as {id: string; cx: number; cy: number; w: number; h: number}[]
    const overlap = (a: Box, b: Box, pad: number = 0): boolean => Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 + pad && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2 + pad
    const bad: string[] = []
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i], boxes[j], 0.05)) bad.push(boxes[i].name + " overlaps " + boxes[j].name)
    }
    for (const b of boxes) {
      if (Math.abs(b.cx) + b.w / 2 > 22 || Math.abs(b.cy) + b.h / 2 > 22) bad.push(b.name + " is outside the backplate (clipped)")
      for (const k of keys) if (overlap(b, {name: k.id, cx: k.cx, cy: k.cy, w: k.w, h: k.h})) bad.push(b.name + " covers " + k.id)
      if (b.name.indexOf("WireLabel_") === 0 || b.name.indexOf("WireEnd_") === 0) {
        for (const p of parts) if (overlap(b, {name: p.id, cx: p.cx, cy: p.cy, w: p.w, h: p.h})) bad.push(b.name + " sits on part " + p.id)
      }
    }
    ev("LABELS CLEAR", {labels: boxes.length, violations: bad})
    for (const b of bad) print("[LABELS] " + b)
    expect(bad.length, "label violations: " + bad.join("; ")).toBe(0)
  }
}
