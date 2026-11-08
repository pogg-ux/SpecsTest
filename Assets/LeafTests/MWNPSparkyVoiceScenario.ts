// Sparky voice, without a microphone: typed-text injection through global.mwnpSparky.inject().
// Covers the wake word (only phrases that start with it act), next / back / repeat, acting on a PARTIAL with the 2 s dedup
// when the final repeats it, log <spoken number> (exactly as Enter does), undo, and the spoken-number and wire-id helpers.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {parseCommand, parseNumber, resolveWire, wakeSegments} from "../Scripts/MWNPSpeech"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

@component
export class MWNPSparkyVoiceScenario extends Scenario {
  async run(): Promise<void> {
    // ── Pure helpers ──
    expect(parseNumber("twelve point zero"), "twelve point zero").toBe("12.0")
    expect(parseNumber("twelve"), "twelve").toBe("12")
    expect(parseNumber("zero point five"), "zero point five").toBe("0.5")
    expect(parseNumber("eleven point eight"), "eleven point eight").toBe("11.8")
    expect(parseNumber("12.0"), "12.0").toBe("12.0")
    expect(parseNumber("twenty one point five"), "twenty one point five").toBe("21.5")
    expect(parseNumber("banana"), "not a number").toBe(null)
    expect(wakeSegments("Sparky, next. Sparky, back.").join("|"), "two segments after two wake words").toBe("next|back")
    expect(wakeSegments("Spark key, next").join("|"), "'spark key' is accepted").toBe("next")
    expect(wakeSegments("hello sparky next").length, "must START with the wake word").toBe(0)
    expect(wakeSegments("the TV says next").length, "no wake word, no command").toBe(0)
    const logCmd = parseCommand("log twelve point zero")
    expect(!!logCmd && logCmd.arg === "12.0" && logCmd.complete, "log twelve point zero parses").toBe(true)
    const ids = ["0", "1", "2a", "2b", "2c", "3a", "3b", "3c"]
    expect(resolveWire("three b", ids).id, "three b -> 3b").toBe("3b")
    expect(resolveWire("3 bee", ids).id, "3 bee -> 3b").toBe("3b")
    expect(resolveWire("3d", ids).id, "3d is ambiguous (3b or 3c): no guess").toBe(null)
    expect(resolveWire("two", ids).id, "'two' alone is ambiguous").toBe(null)
    expect(resolveWire("zero", ids).id, "zero -> 0").toBe("0")

    // ── In the Lens ──
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    const sparky = (global as any).mwnpSparky
    const app = (global as any).mwnpAssistant
    expect(!!sparky && !!app, "SparkyVoice and Main are running").toBe(true)
    sparky.setAsrEnabled(false) // typed text only: the microphone must not add noise to the test
    await sleep(300)
    const acted = (): number => sparky.acted.length
    const last = (): any => sparky.acted[sparky.acted.length - 1]

    expect(mwnpState().stepTitle.indexOf("Step 1 of 5") === 0, "starts on step 1: " + mwnpState().stepTitle).toBe(true)

    // Only phrases that start with the wake word act.
    let n = acted()
    sparky.inject("hello sparky next")
    sparky.inject("next")
    sparky.inject("the TV says sparkling water")
    expect(acted(), "side talk and phrases without the wake word do nothing").toBe(n)

    // next (final), back
    sparky.inject("Sparky, next.")
    await sleep(500)
    expect(last().name, "next acted").toBe("next")
    expect(mwnpState().stepTitle.indexOf("Step 2 of 5") === 0, "next -> step 2: " + mwnpState().stepTitle).toBe(true)
    expect(mwnpState().activePoint, "next -> F1:IN").toBe("F1:IN")
    expect(mwnpState().readings.length, "next logs nothing").toBe(0)
    sparky.inject("Sparky, back.")
    await sleep(500)
    expect(mwnpState().stepTitle.indexOf("Step 1 of 5") === 0, "back -> step 1: " + mwnpState().stepTitle).toBe(true)
    expect(mwnpState().activePoint, "back -> TS-4").toBe("TS-4")

    // A PARTIAL acts at once; the final that repeats it is ignored (2 s dedup).
    await sleep(2100)
    n = acted()
    sparky.inject("Sparky, next", false)
    expect(acted(), "a partial with a complete command acts without waiting for the final").toBe(n + 1)
    sparky.inject("Sparky, next.", true)
    expect(acted(), "the final repeating it within 2 s is ignored").toBe(n + 1)
    await sleep(400)
    expect(mwnpState().activePoint, "one step forward only").toBe("F1:IN")

    // repeat: re-shows the current step and expands the chip.
    app.stepCard.collapse()
    expect(app.stepCard.isCollapsed, "step card is a chip").toBe(true)
    sparky.inject("Sparky, repeat.")
    await sleep(500)
    expect(!app.stepCard.isCollapsed && app.stepCard.isVisible, "repeat expands the chip").toBe(true)
    expect(mwnpState().activePoint, "repeat stays on the step").toBe("F1:IN")

    // log <spoken number>: like Enter. A partial that is still growing waits ("log twelve" -> "log twelve point zero").
    n = acted()
    sparky.inject("Sparky, log twelve", false)
    expect(acted(), "log twelve (partial) waits for the rest").toBe(n)
    sparky.inject("Sparky, log twelve point zero", true)
    await sleep(600)
    expect(acted(), "the final acts").toBe(n + 1)
    expect(last().name === "log" && last().arg === "12.0", "log 12.0: " + JSON.stringify(last())).toBe(true)
    expect(last().result, "feedback line").toBe("Logged 12.0 V. Say 'undo' to remove.")
    let s = mwnpState()
    expect(s.readings.length, "one reading logged").toBe(1)
    expect(s.readings[0].point + " " + s.readings[0].value, "reading").toBe("F1:IN 12")
    expect(s.readings[0].cls, "classified like Enter").toBe("in_spec")
    expect(s.badges["F1:IN"], "badge on the model").toBe("12.0 V ✓")
    expect(s.activePoint, "advanced to F1:OUT").toBe("F1:OUT")

    // undo: the last reading comes back out.
    await sleep(2100)
    sparky.inject("Sparky, undo")
    await sleep(600)
    expect(last().name, "undo acted").toBe("undo")
    expect(last().result, "undo feedback").toBe("Undone")
    s = mwnpState()
    expect(s.readings.length, "reading removed").toBe(0)
    expect(s.activePoint, "back on F1:IN").toBe("F1:IN")
    expect(s.badges["F1:IN"] === undefined || s.badges["F1:IN"] === "", "badge removed").toBe(true)
    sparky.inject("Sparky, undo")
    await sleep(2100)
    sparky.inject("Sparky, undo")
    expect(last().result, "nothing left to undo").toBe("Nothing to undo")

    // highlight wire (stretch): an id that exists; near misses that are not a clear single match ask.
    sparky.inject("Sparky, highlight wire three b")
    await sleep(300)
    expect(last().result, "highlight 3b").toBe("Highlighting wire 3b")
    sparky.inject("Sparky, highlight wire 3d")
    await sleep(300)
    expect(last().result, "3d is not guessed").toBe("Which wire?")
    // show schematic / close
    sparky.inject("Sparky, show schematic")
    await sleep(500)
    expect(app.schematicPanel.isOpen, "show schematic opens it").toBe(true)
    expect(app.stepCard.isCollapsed, "one card at a time: the step card is its chip").toBe(true)
    sparky.inject("Sparky, close")
    await sleep(500)
    expect(!app.schematicPanel.isOpen, "close closes the schematic").toBe(true)
    expect(!app.stepCard.isCollapsed && app.stepCard.isVisible, "and the step card is back").toBe(true)

    // open library / report / camera
    sparky.inject("Sparky, open library")
    await sleep(500)
    expect(mwnpState().visibleCard, "open library -> no card open, the menu shows").toBe("home")
    expect(app.libraryCard.isMenuVisible, "the Library menu is expanded").toBe(true)
    sparky.inject("Sparky, open report")
    await sleep(600)
    expect(mwnpState().visibleCard === "report" || mwnpState().visibleCard === "summary", "open report: " + mwnpState().visibleCard).toBe(true)
    sparky.inject("Sparky, open camera")
    await sleep(600)
    expect(mwnpState().visibleCard, "open camera").toBe("camera")
    sparky.inject("Sparky, close")
    await sleep(500)
    expect(mwnpState().visibleCard, "close closes the open card").toBe("home")
    sparky.inject("Sparky, open job")
    await sleep(500)
    expect(mwnpState().visibleCard === "jobhome" || mwnpState().visibleCard === "step", "open job: " + mwnpState().visibleCard).toBe(true)
    sparky.inject("Sparky, open options")
    await sleep(500)
    expect(mwnpState().visibleCard, "open options").toBe("options")
    sparky.inject("Sparky, hide cards")
    await sleep(500)
    expect(mwnpState().display.hidden, "hide cards hides the display").toBe(true)
    sparky.inject("Sparky, show cards")
    await sleep(500)
    expect(mwnpState().display.hidden, "show cards shows it").toBe(false)
    sparky.inject("Sparky, fixed")
    await sleep(300)
    expect(mwnpState().visibleCard !== "summary", "fixed does nothing when not asked").toBe(true)
    ev("SPARKY PASS", {acted: sparky.acted.length})
  }
}
