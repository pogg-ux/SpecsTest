// The answer card under the mic indicator: ask with no token (no request is made), leave the card up for a screenshot.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor} from "./MWNPLeafInteractor"

@component
export class MWNPSparkyAskCardScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    const sparky = (global as any).mwnpSparky
    sparky.setRealClips(false)
    sparky.setAsrEnabled(false)
    sparky.askTokenOverride = null
    sparky.inject("Sparky, ask why that terminal")
    await sleep(800)
    expect(sparky.answerVisible, "answer card visible").toBe(true)
    expect(sparky.answerText, "no connection sentence").toBe("Live answers need a connection.")
    sparky.setAnswerTextForTest("TS-4 is the terminal that feeds the EXTEND branch from the S1 UP contact, so checking 12 V there confirms if S1 UP contact and wire 2a are good.")
  }
}
