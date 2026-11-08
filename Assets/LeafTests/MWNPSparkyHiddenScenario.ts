// Sparky keeps listening while the display is hidden: "show" always works, commands that act on a card show the display
// first, the mic indicator stays visible, a new utterance after one with no final is not swallowed, and S1 up / down by voice.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState} from "./MWNPLeafInteractor"

@component
export class MWNPSparkyHiddenScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    const sparky = (global as any).mwnpSparky
    const app = (global as any).mwnpAssistant
    sparky.setRealClips(false)
    sparky.setAsrEnabled(false)
    await sleep(300)
    const say = async (t: string, ms: number = 600): Promise<void> => {
      sparky.inject("Sparky, " + t)
      await sleep(ms)
    }
    const hidden = (): boolean => mwnpState().display.hidden
    const micOn = (): boolean => {
      const m = findSceneObjectByName("SparkyMic")
      return !!m && m.isEnabledInHierarchy
    }

    expect(micOn(), "mic indicator visible while shown").toBe(true)
    // hide -> the mic stays; show -> back
    await say("hide")
    expect(hidden(), "hide hides").toBe(true)
    await sleep(900)
    expect(micOn(), "the mic indicator stays visible while the display is hidden").toBe(true)
    await say("show card")
    expect(hidden(), "show card restores").toBe(false)

    // next on the shown display; open library
    await say("next")
    expect(mwnpState().stepTitle.indexOf("Step 2 of 5") === 0, "next -> step 2: " + mwnpState().stepTitle).toBe(true)
    await say("open library")
    expect(mwnpState().visibleCard, "open library").toBe("home")

    // hide, then next: auto-shows, then acts
    await say("hide cards")
    expect(hidden(), "hidden again").toBe(true)
    await sleep(2200)
    await say("next", 800)
    expect(hidden(), "next while hidden shows the display first").toBe(false)
    expect(mwnpState().stepTitle.indexOf("Step 3 of 5") === 0, "and then acts: " + mwnpState().stepTitle).toBe(true)

    // open options while hidden -> auto-show + opens
    await say("hide")
    await sleep(2200)
    await say("show options", 800)
    expect(hidden(), "show options auto-shows").toBe(false)
    expect(mwnpState().visibleCard, "and opens Options").toBe("options")

    // A command after one that never got a final must not be swallowed (the real bug: "retest" worked, then "show card" did nothing).
    await say("close")
    await say("hide")
    expect(hidden(), "hidden").toBe(true)
    sparky.inject("Sparky, back", false) // partial only: no final ever arrives
    await sleep(3400)
    sparky.inject("Sparky, show card", false)
    await sleep(600)
    expect(hidden(), "a new utterance after one without a final still acts").toBe(false)

    // S1 by voice, same effect as pinching the model.
    await say("s1 down")
    expect(mwnpState().s1, "S1 down").toBe("DOWN")
    await sleep(2200)
    await say("s1 up")
    expect(mwnpState().s1, "S1 up").toBe("UP")
    ev("SPARKY HIDDEN PASS", {})
  }
}
