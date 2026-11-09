// Fuzzy command matching: misheard command phrases still run, ordinary speech does nothing, close commands are asked about,
// and numbers are never guessed (a reading that is not a clean number is read back and logged only after "Sparky, yes").
// Typed-text injection through global.mwnpSparky.inject(text, isFinal), no microphone, no speech output.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {COMMAND_CONFIDENCE, interpret, speakNumber, wakeSegments} from "../Scripts/MWNPSpeech"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

@component
export class MWNPVoiceFuzzyScenario extends Scenario {
  async run(): Promise<void> {
    // ── The wake word as live ASR writes it (the log showed "Spargi" for "Sparky") ──
    for (const w of ["Sporky", "Spargi", "Spargi.", "sparkey", "sparkie", "sparki", "Spark e", "spark he", "sparks", "parky", "sporty", "spunky"]) {
      expect(wakeSegments(w + ", report symptom").join("|"), "wake word '" + w + "'").toBe("report symptom")
    }
    expect(wakeSegments("Spargi. Spargi. Confirm.").join("|"), "a repeated 'Spargi' splits like a repeated 'Sparky'").toBe("|confirm")
    for (const w of ["sports", "party", "spooky", "sparkle", "sparrow"]) {
      expect(wakeSegments(w + ", report symptom").length, "'" + w + "' is not the wake word").toBe(0)
    }

    // ── Misheard variants: each must be a fuzzy match to the right command, at or above the threshold ──
    const variants: {[command: string]: string[]} = {
      report_symptom: ["report simptom", "report symtom", "reporting symptom"],
      dismiss: ["understud", "under stood", "understand"],
      show_labels: ["show label", "show lables", "sho labels"],
      clear_labels: ["cleer", "klear"],
      next: ["nekst", "nexxt"],
      undo: ["undue", "un do", "undoo"],
      fixed: ["yes fixt", "yes fix ed"],
    }
    for (const command of Object.keys(variants)) {
      for (const heard of variants[command]) {
        const it = interpret(heard)
        expect(it.kind + " " + (it.cmd ? it.cmd.name : "-"), "'" + heard + "' -> " + command + " (score " + it.score.toFixed(2) + ")").toBe("fuzzy " + command)
        expect(it.score >= COMMAND_CONFIDENCE - 1e-9, "'" + heard + "' scores at least the threshold: " + it.score.toFixed(2)).toBe(true)
      }
    }
    expect(COMMAND_CONFIDENCE, "the threshold starts at 0.8").toBe(0.8)
    expect(interpret("next").kind, "an exact phrase is exact, not fuzzy").toBe("exact")
    expect(interpret("report symptom").score, "exact score").toBe(1)

    // ── Ordinary speech must not trigger anything ──
    for (const t of ["the weather is nice today", "I need a coffee", "turn it up a bit", "thanks", "good morning", "hello", "text me later", "pack the bags", "nest", "nice", "sports", "party", "play some music", "okay sure thing"]) {
      const it = interpret(t)
      expect(it.kind + " " + it.score.toFixed(2), "'" + t + "' is not a command").toBe("none " + it.score.toFixed(2))
    }

    // ── Numbers are never fuzzy ──
    expect(interpret("s2 up").kind, "s2 is not s1").toBe("none")
    expect(interpret("log twelve point one").kind, "a clean reading is exact").toBe("exact")
    expect(interpret("log twelve point one volts").kind, "a clean reading with 'volts' is exact").toBe("exact")
    let it = interpret("log twelve point oh")
    expect(it.kind + " " + it.value, "'oh' is read back, not guessed").toBe("confirm_log 12.0")
    it = interpret("log to point five")
    expect(it.kind + " " + it.value, "'to' is read back, not guessed").toBe("confirm_log 2.5")
    it = interpret("lock twelve point one")
    expect(it.kind + " " + it.value, "a misheard 'log' is read back").toBe("confirm_log 12.1")
    expect(interpret("log banana").kind, "no number: nothing to read back").toBe("unclear_log")
    expect(interpret("log twelve point").kind, "an unfinished number is not a number").toBe("unclear_log")
    expect(interpret("lock banana").kind, "a misheard 'log' without a number does nothing").toBe("none")
    expect(speakNumber("12.1"), "readback").toBe("Twelve point one")
    expect(speakNumber("0.5"), "readback").toBe("Zero point five")
    expect(speakNumber("21.5"), "readback").toBe("Twenty one point five")
    expect(speakNumber("120.5"), "readback").toBe("One two zero point five")

    // ── Two close commands: ask, do not guess (a catalog with two phrases one letter apart) ──
    const two = [
      {name: "alpha", arg: "", phrase: "fuse replaced"},
      {name: "beta", arg: "", phrase: "fuse replacer"},
    ]
    const amb = interpret("fuse replacek", two)
    expect(amb.kind, "two commands equally close").toBe("ambiguous")
    expect(amb.options.slice().sort().join(" | "), "both are offered").toBe("fuse replaced | fuse replacer")

    // ── In the Lens ──
    const ui = new MWNPLeafInteractor()
    await waitFor((s) => s.initialized === true && s.visibleCard === "safety", 10000, "safety card")
    await ui.tap("Btn_DismissSafety")
    await waitFor((s) => s.visibleCard === "home", 3000, "library menu, no card open")
    const sparky = (global as any).mwnpSparky
    expect(!!sparky, "SparkyVoice is running").toBe(true)
    sparky.setRealClips(false)
    sparky.setAsrEnabled(false)
    sparky.askSpeak = false // no text-to-speech request from this test
    await sleep(300)
    const last = (): any => sparky.acted[sparky.acted.length - 1]
    const lastSpoken = (): string => sparky.spoken[sparky.spoken.length - 1]

    // A misheard command runs.
    await ui.tap("Btn_Lib_Job")
    await waitFor((s) => s.visibleCard === "job", 3000, "job card")
    let n = sparky.acted.length
    // "Sporky" (a wake-word mishearing) + an exact command.
    sparky.inject("Sporky, report symptom")
    await sleep(500)
    expect(last().name, "'Sporky, report symptom' ran report_symptom").toBe("report_symptom")
    expect(mwnpState().visibleCard, "and opened the symptom picker").toBe("symptoms")
    expect(sparky.acted.length, "once").toBe(n + 1)
    await sleep(2100)
    sparky.inject("Sparky, close")
    await sleep(500)
    expect(mwnpState().visibleCard, "closed -> library menu").toBe("home")
    // "Spargi" (heard live for "Sparky") + a misheard command.
    await sleep(2100)
    sparky.inject("Spargi, report simptom")
    await sleep(500)
    expect(last().name, "'Spargi, report simptom' ran report_symptom").toBe("report_symptom")
    expect(mwnpState().visibleCard, "and opened the symptom picker again").toBe("symptoms")
    await ui.tap("Btn_Symptom_EXTEND")
    await waitFor((s) => s.visibleCard === "step" && s.activePoint === "TS-4", 3000, "step card at TS-4")

    // Ordinary speech after the wake word: nothing runs, Sparky says "Say again?".
    n = sparky.acted.length
    const said = sparky.spoken.length
    sparky.inject("Sparky, the weather is nice today")
    await sleep(400)
    expect(sparky.acted.length, "ordinary speech runs nothing").toBe(n)
    expect(sparky.spoken.length, "Sparky asked once").toBe(said + 1)
    expect(lastSpoken(), "Sparky asks to repeat").toBe("Say again?")
    expect(mwnpState().activePoint, "the step did not move").toBe("TS-4")

    // Misheard next / back run.
    await sleep(2100)
    sparky.inject("Sparky, nekst")
    await sleep(500)
    expect(last().name, "'nekst' ran next").toBe("next")
    expect(mwnpState().activePoint, "next -> F1:IN").toBe("F1:IN")
    await sleep(2100)
    sparky.inject("Sparky, go bak")
    await sleep(500)
    expect(last().name, "'go bak' ran back").toBe("back")
    expect(mwnpState().activePoint, "back -> TS-4").toBe("TS-4")

    // A reading that is not a clean number is read back; nothing is logged until "Sparky, yes".
    await sleep(2100)
    sparky.inject("Sparky, log twelve point oh")
    await sleep(500)
    expect(last().name + " " + last().arg, "readback asked").toBe("log_confirm 12.0")
    expect(lastSpoken(), "Sparky reads the value back").toBe("Twelve point zero. Log it?")
    expect(mwnpState().readings.length, "nothing is logged yet").toBe(0)
    sparky.inject("Sparky, no")
    await sleep(400)
    expect(last().result, "'no' drops it").toBe("Not logged")
    expect(mwnpState().readings.length, "still nothing logged").toBe(0)
    await sleep(2100)
    sparky.inject("Sparky, log twelve point oh")
    await sleep(500)
    expect(mwnpState().readings.length, "asked again, still nothing logged").toBe(0)
    sparky.inject("Sparky, yes")
    await sleep(700)
    expect(last().name + " " + last().arg, "'yes' logs the confirmed value").toBe("log 12.0")
    expect(mwnpState().readings.length, "one reading logged").toBe(1)
    await sleep(2100)
    sparky.inject("Sparky, yes")
    await sleep(400)
    expect(mwnpState().readings.length, "a second 'yes' logs nothing more").toBe(1)

    // No usable number: Sparky asks for it again and logs nothing.
    await sleep(2100)
    n = sparky.acted.length
    sparky.inject("Sparky, log banana")
    await sleep(400)
    expect(sparky.acted.length, "'log banana' runs nothing").toBe(n)
    expect(lastSpoken(), "Sparky asks for the reading again").toBe("Say the reading again.")
    ev("VOICE FUZZY PASS", {acted: sparky.acted.length, spoken: sparky.spoken.length})
  }
}
