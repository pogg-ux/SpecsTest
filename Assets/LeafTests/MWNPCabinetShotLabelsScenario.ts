// Screenshot state: labels "Always on" (every tag and wire sleeve showing), no card open, S1 up, lamps off.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {prepareShot} from "./MWNPShotKit"

@component
export class MWNPCabinetShotLabelsScenario extends Scenario {
  async run(): Promise<void> {
    const app = await prepareShot(false)
    app.optionsCard.set("labels", 1)
    app.voiceCommand("close")
    await sleep(1200)
  }
}
