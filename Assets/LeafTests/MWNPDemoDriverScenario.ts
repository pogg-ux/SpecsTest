// Demo driver: steps through all 17 demo lines and checks each command ran (and, around hide / show, what is on screen). The Right/Left arrow polling is a thin layer over
// DemoRunner (next/back), which is what this drives; the clips are checked as imported assets, not played. DEMO_DRIVER stays false.
// The presenter's only action is flipping S1 to UP right after "Sparky, retest" (the retest waits for it).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DEMO_DRIVER, DemoRunner} from "../Scripts/DemoDriver"
import {DEMO_CLIPS, DEMO_LINES} from "../Scripts/DemoScript"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

/** The clips in the order the script plays them (tech_15 is not in the script), and the command each line must run. */
const CLIP_ORDER = [1, 2, 3, 17, 4, 5, 18, 6, 7, 8, 11, 12, 13, 9, 10, 14, 16]
const EXPECT: {name: string; arg?: string}[] = [
  {name: "dismiss"},
  {name: "report_symptom"},
  {name: "symptom", arg: "extend"},
  {name: "hide_display"},
  {name: "log", arg: "12.1"},
  {name: "log", arg: "12.0"},
  {name: "show_display"},
  {name: "log", arg: "0"},
  {name: "ask"},
  {name: "ask"},
  {name: "retest"},
  {name: "log", arg: "12.0"},
  {name: "fixed"},
  {name: "note"},
  {name: "save_note"},
  {name: "end_job"},
  {name: "show_labels"},
]

@component
export class MWNPDemoDriverScenario extends Scenario {
  async run(): Promise<void> {
    const N = CLIP_ORDER.length
    // ── Off by default, and the script and clips line up ──
    expect(DEMO_DRIVER, "DEMO_DRIVER is false in the project").toBe(false)
    expect((global as any).mwnpDemo, "nothing runs while DEMO_DRIVER is false").toBe(undefined)
    expect(DEMO_LINES.length, N + " lines").toBe(N)
    expect(DEMO_CLIPS.length, N + " clips").toBe(N)
    expect(EXPECT.length, "one expectation per line").toBe(N)
    for (let i = 0; i < N; i++) {
      const n = CLIP_ORDER[i] < 10 ? "0" + CLIP_ORDER[i] : "" + CLIP_ORDER[i]
      expect(DEMO_LINES[i].clip, "line " + (i + 1) + " clip").toBe("tech_" + n + ".mp3")
      expect(!!DEMO_CLIPS[i], "clip " + n + " imported").toBe(true)
      expect(DEMO_CLIPS[i].name.indexOf("tech_" + n) === 0, "clip " + n + " is " + DEMO_CLIPS[i].name).toBe(true)
      expect(DEMO_LINES[i].command.indexOf("Sparky, ") === 0, "line " + (i + 1) + " starts with the wake word").toBe(true)
    }
    expect(DEMO_LINES.some((l) => l.clip === "tech_15.mp3"), "tech_15 ('yes') is not in the script").toBe(false)

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
      expect(r.cursor, "stops at the end").toBe(N)
      expect(r.next(), "past the end does nothing").toBe(false)
      expect(played.length, "no clip past the end: " + N + " lines + 1 replay").toBe(N + 1)
    }

    // ── All lines through the real app ──
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
    let notesBefore = 0
    let seenFirst120 = false
    const runner = new DemoRunner(DEMO_LINES, (i) => playedClips.push(i), (c, f) => sparky.inject(c, f), (m) => print("[DEMO-TEST] " + m))
    for (let i = 0; i < N; i++) {
      const want = EXPECT[i]
      // "Problem solved?" gets its moment after the passing retest, before "yes fixed".
      if (want.name === "fixed") {
        await waitFor((s) => s.phase === "done", 4000, "retest passed")
        await sleep(2500)
      }
      const before = sparky.acted.length
      if (want.name === "note") notesBefore = mwnpState().notes.length
      runner.next()
      await sleep(want.name === "ask" ? 700 : 900)
      const a = sparky.acted[sparky.acted.length - 1]
      expect(sparky.acted.length > before, "line " + (i + 1) + " '" + DEMO_LINES[i].command + "' ran something").toBe(true)
      expect(a.name + (want.arg !== undefined ? ":" + a.arg : ""), "line " + (i + 1) + " ran " + want.name + " -> " + a.result).toBe(want.name + (want.arg !== undefined ? ":" + want.arg : ""))
      results.push((i + 1) + " " + a.name + (a.arg ? "(" + a.arg + ")" : "") + " -> " + a.result)
      await sleep(300)
      if (want.name === "report_symptom") expect(mwnpState().visibleCard, "report symptom opened the symptom list").toBe("symptoms")
      if (want.name === "symptom") await waitFor((s) => s.visibleCard === "step" && s.activePoint === "TS-4", 3000, "step card at TS-4")
      // Hide / show around the first two readings.
      if (want.name === "hide_display") {
        await waitFor((s) => s.display.hidden === true && s.display.alpha === 0 && s.display.fading === false, 3000, "cards faded out after 'hide'")
        expect(mwnpState().display.alpha, "after 'hide' no card is visible (display alpha 0)").toBe(0)
        expect(mwnpState().activePoint, "still on the first test point").toBe("TS-4")
      }
      if (want.name === "log" && a.arg === "12.1") {
        expect(mwnpState().display.hidden, "the display is still hidden after logging 12.1").toBe(true)
        expect(mwnpState().activePoint, "12.1 advanced the step to F1:IN").toBe("F1:IN")
        expect(mwnpState().badges["TS-4"], "and added the TS-4 badge").toBe("12.1 V ✓")
        const b = findSceneObjectByName("Badge_TS-4")
        expect(!!b && b.isEnabledInHierarchy, "the badge is on the cabinet while the cards are hidden").toBe(true)
        expect(mwnpState().display.labelsHidden === false && mwnpState().display.labelsAlpha === 1, "badges and the wire highlight are not faded").toBe(true)
        expect(mwnpState().labelTags.on, "the component tags stay hidden").toBe(false)
        expect(mwnpState().display.alpha, "no card is visible").toBe(0)
      }
      if (want.name === "log" && a.arg === "12.0" && !seenFirst120) {
        seenFirst120 = true
        expect(mwnpState().display.hidden, "the display is still hidden after logging 12.0").toBe(true)
        expect(mwnpState().activePoint, "12.0 advanced the step to F1:OUT").toBe("F1:OUT")
        expect(mwnpState().badges["F1:IN"], "and added the F1:IN badge").toBe("12.0 V ✓")
        const b = findSceneObjectByName("Badge_F1:IN")
        expect(!!b && b.isEnabledInHierarchy, "the F1:IN badge is on the cabinet while the cards are hidden").toBe(true)
        expect(mwnpState().labelTags.on, "the component tags are still hidden").toBe(false)
      }
      if (want.name === "show_display") {
        await waitFor((s) => s.display.hidden === false && s.display.alpha === 1 && s.display.fading === false, 3000, "cards faded back in after 'show'")
        expect(mwnpState().visibleCard, "after 'show' the Step card is back").toBe("step")
        expect(mwnpState().activePoint, "on the step the readings led to").toBe("F1:OUT")
      }
      if (want.name === "log" && a.arg === "0") await waitFor((s) => s.visibleCard === "finding", 3000, "finding card after the 0 V reading")
      if (want.name === "retest") {
        // The presenter's one action: flip S1 to UP right after the retest starts.
        expect(a.result, "retest started from the finding card").toBe("Retest")
        let g = 0
        while (mwnpState().s1 !== "UP" && g < 2) {
          await ui.tap("S1_Toggle")
          g++
        }
        await waitFor((s) => s.phase === "retest", 3000, "retest active after S1 UP")
      }
      if (want.name === "fixed") {
        expect(a.result, "yes fixed accepted").toBe("Fixed")
        await waitFor((s) => s.visibleCard === "summary", 3000, "summary after yes fixed")
      }
      if (want.name === "note") {
        expect(a.result.indexOf("Note: Replaced F1") === 0, "the note after 'yes fixed' is taken down: " + a.result).toBe(true)
        expect(mwnpState().visibleCard, "the notes card is up").toBe("notes")
      }
      if (want.name === "save_note") {
        expect(a.result, "save note after 'yes fixed' saves it").toBe("Note saved")
        // The notes list also holds the job's own log entries (symptom, fault, fix, "yes fixed"); the dictated note is one more.
        const notes: {source: string; text: string}[] = mwnpState().notes
        expect(notes.length, "saving adds exactly one note").toBe(notesBefore + 1)
        const dictated = notes.filter((n) => n.text === "Replaced F1 half amp fast blow")
        expect(dictated.length === 1 && dictated[0].source === "Tech", "and it is the dictated one, from the tech: " + JSON.stringify(notes[0])).toBe(true)
      }
    }
    expect(playedClips.length, N + " clips played, one per line").toBe(N)
    ev("DEMO DRIVER END STATE", {jobActive: mwnpState().jobActive, card: mwnpState().visibleCard, labels: mwnpState().labelTags.on})
    expect(mwnpState().labelTags.on, "show labels turned the labels on").toBe(true)
    expect(mwnpState().jobActive, "end job closed the job").toBe(false)
    ev("DEMO DRIVER PASS", {lines: results})
  }
}
