// The answer card: closed by default (Options > "Show Sparky's answers as text" is Off, Sparky only speaks); opens when the option is On
// and closes again when it goes Off. Ask with no token (no request is made), leave the card up for a screenshot.

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
    const app = (global as any).mwnpAssistant
    expect(app.showAnswerText, "the answer text option starts Off").toBe(false)
    sparky.inject("Sparky, ask why that terminal")
    await sleep(800)
    expect(sparky.answerText, "no connection sentence").toBe("Live answers need a connection.")
    expect(sparky.answerVisible, "the answer card stays closed by default").toBe(false)

    // Option On: the card opens as before.
    app.optionsCard.set("answerText", 1)
    expect(app.showAnswerText, "the option is On").toBe(true)
    expect(sparky.answerVisible, "turning the option On does not open an old answer").toBe(false)
    await sleep(2200) // the same question within 2 s would be ignored as a repeat
    sparky.askState = "idle"
    sparky.inject("Sparky, ask why that terminal")
    await sleep(800)
    expect(sparky.answerVisible, "answer card visible when the option is On").toBe(true)
    expect(sparky.answerText, "no connection sentence").toBe("Live answers need a connection.")

    // Option Off again: an open card closes.
    app.optionsCard.set("answerText", 0)
    await sleep(200)
    expect(sparky.answerVisible, "turning the option Off closes the card").toBe(false)
    app.optionsCard.set("answerText", 1)
    sparky.setAnswerTextForTest("TS-4 is the terminal that feeds the EXTEND branch from the S1 UP contact, so checking 12 V there confirms if S1 UP contact and wire 2a are good.")
  }
}
