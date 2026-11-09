// Demo driver: steps through all 16 demo lines and checks each command ran. The Right/Left arrow polling is a thin layer over
// DemoRunner (next/back), which is what this drives; the clips are checked as imported assets, not played. DEMO_DRIVER stays false.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DEMO_DRIVER, DemoRunner} from "../Scripts/DemoDriver"
import {DEMO_CLIPS, DEMO_LINES} from "../Scripts/DemoScript"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

/** The command each line must run (SparkyVoice.acted[].name), and what the app shows afterwards. */
const EXPECT: {name: string; arg?: string}[] = [
  {name: "dismiss"},
  {name: "report_symptom"},
  {name: "symptom", arg: "extend"},
  {name: "log", arg: "12.1"},
  {name: "log", arg: "12.0"},
  {name: "log", arg: "0"},
  {name: "ask"},
  {name: "ask"},
  {name: "note"},
  {name: "save_note"},
  {name: "retest"},
  {name: "log", arg: "12.0"},
  {name: "fixed"},
  {name: "end_job"},
  {name: "yes"},
  {name: "show_labels"},
]

@component
export class MWNPDemoDriverScenario extends Scenario {
  async run(): Promise<void> {
    // ── Off by default, and the script and clips line up ──
    expect(DEMO_DRIVER, "DEMO_DRIVER is false in the project").toBe(false)
    expect((global as any).mwnpDemo, "nothing runs while DEMO_DRIVER is false").toBe(undefined)
    expect(DEMO_LINES.length, "16 lines").toBe(16)
    expect(DEMO_CLIPS.length, "16 clips").toBe(16)
    for (let i = 0; i < 16; i++) {
      const n = i + 1 < 10 ? "0" + (i + 1) : "" + (i + 1)
      expect(DEMO_LINES[i].clip, "line " + (i + 1) + " clip").toBe("tech_" + n + ".mp3")
      expect(!!DEMO_CLIPS[i], "clip " + n + " imported").toBe(true)
      expect(DEMO_CLIPS[i].name.indexOf("tech_" + n) === 0, "clip " + n + " is " + DEMO_CLIPS[i].name).toBe(true)
      expect(DEMO_LINES[i].command.indexOf("Sparky, ") === 0, "line " + (i + 1) + " starts with the wake word").toBe(true)
    }
    expect(DEMO_LINES.length === EXPECT.length, "one expectation per line").toBe(true)

    // ── The cursor: forward plays and sends together; back moves without playing; the end stops ──
    {
      const played: number[] = []
      const sent: string[] = []
      const finals: boolean[] = []
      const r = new DemoRunner(DEMO_LINES, (i) => played.push(i), (c, f) => { sent.push(c); finals.push(f) }, () => {})
      expect(r.back(), "back at the start does nothing").toBe(false)
      r.next()
      r.next()
      expect(played.join(",") + " / " + sent.length, "two steps forward play two clips and send two commands").toBe("0,1 / 2")
      expect(sent[0] === DEMO_LINES[0].command && sent[1] === DEMO_LINES[1].command, "each clip goes with its own command").toBe(true)
      expect(finals.every((f) => f === true), "commands are sent as finals").toBe(true)
      r.back()
      expect(played.length + " / " + sent.length, "back plays and sends nothing").toBe("2 / 2")
      r.next()
      expect(played.join(",") + " / " + sent[2], "the step after a back replays that line").toBe("0,1,1 / " + DEMO_LINES[1].command)
      let guard = 0
      while (r.next() && guard < 40) guard++
      expect(r.cursor, "stops at the end").toBe(16)
      expect(r.next(), "past the end does nothing").toBe(false)
      expect(played.length, "no clip past the end: 16 lines + 1 replay").toBe(17)
    }

    // ── All 16 lines through the real app ──
    const ui = new MWNPLeafInteractor()
    await waitFor((s) => s.initialized === true && s.visibleCard === "safety", 10000, "safety card")
    const sparky = (global as any).mwnpSparky
    expect(!!sparky, "SparkyVoice is running").toBe(true)
    sparky.setRealClips(false)
    sparky.setAsrEnabled(false) // what the driver does while it is on: the speakers cannot trigger live ASR
    sparky.askSpeak = false
    sparky.askTokenOverride = null // no network request for the two questions
    await sleep(300)
    const results: string[] = []
    const playedClips: number[] = []
    const runner = new DemoRunner(DEMO_LINES, (i) => playedClips.push(i), (c, f) => sparky.inject(c, f), (m) => print("[DEMO-TEST] " + m))
    for (let i = 0; i < 16; i++) {
      // The presenter's hands. NOT in the demo script: lines 9-10 (the note) replace the Finding card with the Notes card, and
      // "Sparky, retest" only works while the Finding card is showing (MWNPMain voiceCommand "retest"), so before line 11 the
      // Finding card has to be brought back (Job button -> "Back to the finding"). Without it line 11 answers "Nothing to retest yet."
      if (i === 10) {
        await ui.tap("Btn_Lib_Job")
        await waitFor((s) => s.visibleCard === "finding", 3000, "finding card back before 'retest'")
      }
      // Then: flip the switch for the retest, and give "Problem solved?" its moment before "yes fixed".
      if (i === 11) {
        let g = 0
        while (mwnpState().s1 !== "UP" && g < 2) {
          await ui.tap("S1_Toggle")
          g++
        }
        await waitFor((s) => s.phase === "retest", 3000, "retest active")
      }
      if (i === 12) await waitFor((s) => s.phase === "done", 4000, "retest passed")
      if (i === 12) await sleep(2500)
      const before = sparky.acted.length
      runner.next()
      await sleep(i === 6 || i === 7 ? 700 : 900)
      const a = sparky.acted[sparky.acted.length - 1]
      const want = EXPECT[i]
      expect(sparky.acted.length > before, "line " + (i + 1) + " '" + DEMO_LINES[i].command + "' ran something").toBe(true)
      expect(a.name + (want.arg !== undefined ? ":" + a.arg : ""), "line " + (i + 1) + " ran " + want.name + " -> " + a.result).toBe(want.name + (want.arg !== undefined ? ":" + want.arg : ""))
      results.push((i + 1) + " " + a.name + (a.arg ? "(" + a.arg + ")" : "") + " -> " + a.result)
      await sleep(i === 8 ? 800 : 300)
      if (i === 5) await waitFor((s) => s.visibleCard === "finding", 3000, "finding card after the 0 V reading")
      if (i === 1) expect(mwnpState().visibleCard, "report symptom opened the symptom list").toBe("symptoms")
      if (i === 2) await waitFor((s) => s.visibleCard === "step" && s.activePoint === "TS-4", 3000, "step card at TS-4")
    }
    expect(playedClips.length, "16 clips played, one per line").toBe(16)
    expect(mwnpState().jobActive, "end job + yes closed the job").toBe(false)
    expect(mwnpState().labelTags.on, "show labels turned the labels on").toBe(true)
    ev("DEMO DRIVER PASS", {lines: results})
  }
}
