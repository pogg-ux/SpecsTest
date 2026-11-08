// Screenshot state: cards hidden, S1 down, both lamps lit.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {prepareShot} from "./MWNPShotKit"

@component
export class MWNPCabinetShotOnScenario extends Scenario {
  async run(): Promise<void> {
    const app = await prepareShot(true)
    app.cabinet.setS1("DOWN")
    app.cabinet.setLamp("L1", true)
    app.cabinet.setLamp("L2", true)
    await sleep(500)
  }
}
