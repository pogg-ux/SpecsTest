// Screenshot state: normal view (cards and labels), step 1.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {prepareShot} from "./MWNPShotKit"

@component
export class MWNPCabinetShotFullScenario extends Scenario {
  async run(): Promise<void> {
    await prepareShot(false)
  }
}
