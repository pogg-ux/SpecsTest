// Screenshot state: cards hidden, S1 up, lamps off (clean view of the cabinet).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {prepareShot} from "./MWNPShotKit"

@component
export class MWNPCabinetShotScenario extends Scenario {
  async run(): Promise<void> {
    await prepareShot(true)
  }
}
