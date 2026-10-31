// LeafIndex.ts — registers the MWNP done-criteria LEAF scenarios (C1..C5). Test-only.

import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {MWNPC1SymptomPathScenario} from "./MWNPC1SymptomPathScenario"
import {MWNPC2ReadingInSpecScenario} from "./MWNPC2ReadingInSpecScenario"
import {MWNPC3FaultFlaggedScenario} from "./MWNPC3FaultFlaggedScenario"
import {MWNPC4NoGuessScenario} from "./MWNPC4NoGuessScenario"
import {MWNPC5FixAndSummaryScenario} from "./MWNPC5FixAndSummaryScenario"
import {MWNPLayoutScenario} from "./MWNPLayoutScenario"

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
  ]
}
