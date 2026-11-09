// Sparky keeps listening while the display is hidden: "show" always works, commands that act on a card show the display
// first (log / next / back / repeat / undo run with the cards hidden instead), the mic indicator stays visible, a new utterance after
// one with no final is not swallowed, S1 up / down by voice, and readings by voice while hidden (badges stay, tags stay hidden, a finding shows).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

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
    let s0: any = null
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

    // hide, then next: runs with the cards hidden (the display is NOT shown); a command that opens a card still shows it
    await say("hide cards")
    expect(hidden(), "hidden again").toBe(true)
    await sleep(2200)
    await say("next", 800)
    expect(hidden(), "next while hidden does not show the display").toBe(true)
    expect(mwnpState().stepTitle.indexOf("Step 3 of 5") === 0, "and it acts: " + mwnpState().stepTitle).toBe(true)

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
    await sleep(1600) // a partial "show" waits ~1 s for the text to settle (it also starts "show labels"); "back" no longer un-hides the display
    expect(hidden(), "a new utterance after one without a final still acts").toBe(false)

    // S1 by voice, same effect as pinching the model.
    await say("s1 down")
    expect(mwnpState().s1, "S1 down").toBe("DOWN")
    await sleep(2200)
    await say("s1 up")
    expect(mwnpState().s1, "S1 up").toBe("UP")

    // ── Readings by voice with the cards hidden ──
    // The scenario is on step 2 of 5 (F1:IN) here. While hidden: log / undo / next / back / repeat run without showing the cards, the reading badge and the
    // step's wire highlight stay on the cabinet, the component tags stay hidden; a finding shows the display.
    await sleep(2200)
    await say("hide", 900)
    await waitFor((s) => s.display.hidden === true && s.display.alpha === 0 && s.display.fading === false, 3000, "cards faded out")
    expect(mwnpState().labelTags.on, "hide turned the component tags off").toBe(false)
    const point = mwnpState().activePoint
    expect(point, "on F1:IN (step 2)").toBe("F1:IN")
    const before = mwnpState().readings.length
    await say("log twelve point zero", 900)
    s0 = mwnpState()
    expect(s0.display.hidden, "log while hidden does not show the display").toBe(true)
    expect(s0.display.alpha, "the cards stay invisible").toBe(0)
    expect(s0.readings.length, "the reading is logged").toBe(before + 1)
    expect(s0.badges[point], "and its badge is set").toBe("12.0 V ✓")
    const badge = findSceneObjectByName("Badge_" + point)
    expect(!!badge && badge.isEnabledInHierarchy, "the badge is on the cabinet while the cards are hidden").toBe(true)
    expect(s0.display.labelsHidden === false && s0.display.labelsAlpha === 1, "badges and the wire highlight are not faded: " + JSON.stringify(s0.display)).toBe(true)
    expect(s0.labelTags.on, "the component tags stay hidden after the step changed").toBe(false)
    await sleep(2200)
    await say("undo", 800)
    expect(mwnpState().display.hidden, "undo while hidden does not show the display").toBe(true)
    expect(mwnpState().readings.length, "undo removed the reading").toBe(before)
    await sleep(300)
    await say("back", 800)
    expect(mwnpState().display.hidden, "back while hidden does not show the display").toBe(true)
    expect(mwnpState().stepTitle.indexOf("Step 1 of 5") === 0, "and acts: " + mwnpState().stepTitle).toBe(true)
    await say("repeat", 800)
    expect(mwnpState().display.hidden, "repeat while hidden does not show the display").toBe(true)
    await say("next", 800)
    expect(mwnpState().display.hidden, "next while hidden does not show the display").toBe(true)
    expect(mwnpState().labelTags.on, "the tags are still hidden").toBe(false)
    // A command that opens a card shows the display, as before.
    await sleep(2200)
    await say("open library", 800)
    expect(hidden(), "open library while hidden shows the display").toBe(false)
    await say("close", 800)
    // A finding shows the display, so the tech never misses it.
    await sleep(2200)
    await say("hide", 900)
    expect(hidden(), "hidden for the finding").toBe(true)
    await say("log zero", 1000)
    s0 = mwnpState()
    expect(s0.visibleCard, "a 0 V reading raises the finding").toBe("finding")
    expect(s0.display.hidden, "and the finding shows the display").toBe(false)
    ev("SPARKY HIDDEN PASS", {})
  }
}
