// Screenshot state: cards hidden, S1 up, so only L1 is lit (L2, the lamp S1 does not select, stays off).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {prepareShot} from "./MWNPShotKit"

@component
export class MWNPCabinetShotOnScenario extends Scenario {
  async run(): Promise<void> {
    const app = await prepareShot(true)
    app.cabinet.setS1("UP")
    app.cabinet.setLamp("L1", true)
    app.cabinet.setLamp("L2", false)
    await sleep(500)
    expect(app.cabinet.lampLit["L1"], "S1 UP lights L1").toBe(true)
    expect(app.cabinet.lampLit["L2"], "S1 UP leaves L2 off").toBe(false)
  }
}
