// Geometry lock for the realistic-cabinet work: every point, part box, tag anchor, expected / badge spot, wire route and label must
// equal the recorded baseline (taken from the original primitive cabinet), so highlights, traces and badges still line up.
// Run with no baseline recorded to print the snapshot ([LEAF-MWNP] CABINET SNAPSHOT); paste it into MWNPCabinetBaseline.ts.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {MWNPLeafInteractor, ev} from "./MWNPLeafInteractor"
import {CABINET_BASELINE} from "./MWNPCabinetBaseline"

@component
export class MWNPCabinetLockScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    const app = (global as any).mwnpAssistant
    const snap: string = app.cabinet.geometrySnapshot()
    if (CABINET_BASELINE.length === 0) {
      print("[LEAF-MWNP] CABINET SNAPSHOT " + snap)
      ev("CABINET SNAPSHOT RECORDED", {chars: snap.length})
      return
    }
    const a = JSON.parse(snap)
    const b = JSON.parse(CABINET_BASELINE)
    for (const section of Object.keys(b)) {
      expect(JSON.stringify(a[section]), "cabinet geometry unchanged: " + section).toBe(JSON.stringify(b[section]))
    }
    ev("CABINET LOCK PASS", {sections: Object.keys(b).length})
  }
}
