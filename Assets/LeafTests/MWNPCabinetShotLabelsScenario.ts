// Screenshot state: labels "Always on" (every tag and wire sleeve showing), no card open, Library menu closed, S1 up, lamps off.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {prepareShot} from "./MWNPShotKit"

@component
export class MWNPCabinetShotLabelsScenario extends Scenario {
  async run(): Promise<void> {
    const app = await prepareShot(false)
    app.optionsCard.set("labels", 1)
    app.voiceCommand("close")
    // "close" re-opens the Library menu: collapse it again so only its chip is left.
    app.libraryCard.collapse()
    await sleep(1200)
    // No wire sleeve may overlap an ID tag (or a tag's leader line).
    const boxes: {name: string; cx: number; cy: number; w: number; h: number}[] = app.partTags.labelBoxes()
    const isSleeve = (n: string): boolean => n.indexOf("WireLabel_") === 0 || n.indexOf("WireEnd_") === 0
    const isTag = (n: string): boolean => n.indexOf("Tag_") === 0 || n.indexOf("TagLeader_") === 0
    const hits: string[] = []
    for (const s of boxes.filter((b) => isSleeve(b.name))) {
      for (const t of boxes.filter((b) => isTag(b.name))) {
        if (Math.abs(s.cx - t.cx) < (s.w + t.w) / 2 && Math.abs(s.cy - t.cy) < (s.h + t.h) / 2) hits.push(s.name + " x " + t.name)
      }
    }
    expect(hits.join("; "), "no wire sleeve under a tag").toBe("")
    // The S1 tag sits right beside the toggle: no gap wider than 1.5 cm and no overlap with the L1 / L2 tags.
    const s1 = boxes.filter((b) => b.name === "Tag_S1")[0]
    expect(!!s1, "S1 tag exists").toBe(true)
    expect(s1.cx - s1.w / 2 - -9.2 < 1.5, "S1 tag within 1.5 cm of the toggle plate").toBe(true)
    for (const id of ["Tag_L1", "Tag_L2"]) {
      const l = boxes.filter((b) => b.name === id)[0]
      const overlap = Math.abs(s1.cx - l.cx) < (s1.w + l.w) / 2 && Math.abs(s1.cy - l.cy) < (s1.h + l.h) / 2
      expect(overlap, "S1 tag clear of " + id).toBe(false)
    }
  }
}
