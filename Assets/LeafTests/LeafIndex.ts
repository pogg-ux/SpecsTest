// LeafIndex.ts — registers the MWNP done-criteria LEAF scenarios (C1..C5). Test-only.

import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {MWNPC1SymptomPathScenario} from "./MWNPC1SymptomPathScenario"
import {MWNPC2ReadingInSpecScenario} from "./MWNPC2ReadingInSpecScenario"
import {MWNPC3FaultFlaggedScenario} from "./MWNPC3FaultFlaggedScenario"
import {MWNPC4NoGuessScenario} from "./MWNPC4NoGuessScenario"
import {MWNPC5FixAndSummaryScenario} from "./MWNPC5FixAndSummaryScenario"
import {MWNPLayoutScenario} from "./MWNPLayoutScenario"
import {MWNPLayoutCardsScenario} from "./MWNPLayoutCardsScenario"

/** LEAF's on-screen output: the log strip camera and the diagnostic report camera (both created lazily by Leaf.lspkg). */
const LEAF_OVERLAY_ROOTS = ["LeafDebugUICamera", "LeafDiagnosticReportCamera"]
/** LEAF creates one child of this object per running scenario and destroys it when the scenario ends. */
const LEAF_SCENARIO_OWNER = "LeafScenarioManager"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {id: "mwnp-c1-symptom-path", typename: MWNPC1SymptomPathScenario.getTypeName()},
    {id: "mwnp-c2-reading-in-spec", typename: MWNPC2ReadingInSpecScenario.getTypeName()},
    {id: "mwnp-c3-fault-flagged", typename: MWNPC3FaultFlaggedScenario.getTypeName()},
    {id: "mwnp-c4-no-guess", typename: MWNPC4NoGuessScenario.getTypeName()},
    {id: "mwnp-c5-fix-and-summary", typename: MWNPC5FixAndSummaryScenario.getTypeName()},
    {id: "mwnp-layout-clear-view", typename: MWNPLayoutScenario.getTypeName()},
    {id: "mwnp-layout-cards", typename: MWNPLayoutCardsScenario.getTypeName(), parameters: {stop_at: "summary"}},
  ]

  private overlays: {[name: string]: SceneObject} = {}

  onAwake() {
    // Test banners and reports show only while a scenario is running, so a normal Preview is clean.
    this.createEvent("UpdateEvent").bind(() => this.gateLeafOverlays())
  }

  private findRoot(name: string): SceneObject | null {
    const cached = this.overlays[name]
    if (cached && !isNull(cached)) return cached
    for (let i = 0; i < global.scene.getRootObjectsCount(); i++) {
      const o = global.scene.getRootObject(i)
      if (o.name === name) {
        this.overlays[name] = o
        return o
      }
    }
    return null
  }

  private gateLeafOverlays(): void {
    const owner = this.findRoot(LEAF_SCENARIO_OWNER)
    const running = !!owner && owner.getChildrenCount() > 0
    for (const name of LEAF_OVERLAY_ROOTS) {
      const so = this.findRoot(name)
      if (so && so.enabled !== running) so.enabled = running
    }
  }
}
