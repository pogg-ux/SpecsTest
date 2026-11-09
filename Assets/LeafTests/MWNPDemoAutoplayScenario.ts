// Demo autoplay: the hold array and intro are as specified, the timing logic waits for the clip / Sparky's speech and then holds,
// P-again stops it, and a full run (holds shortened to 0.2 s) plays all 17 lines in order with S1 flipped after "retest".
// DEMO_DRIVER stays false: the autoplay class is driven directly, with the real app and SparkyVoice but no clips and no keys.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DEMO_DRIVER, DemoAutoplay, DemoRunner} from "../Scripts/DemoDriver"
import {DEMO_HOLD_SEC, DEMO_INTRO_HOLD_SEC, DEMO_LINES} from "../Scripts/DemoScript"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

/** The command each line must run, in order (SparkyVoice.acted[].name). */
const NAMES = ["dismiss", "report_symptom", "symptom", "hide_display", "log", "log", "show_display", "log", "ask", "ask", "retest", "log", "fixed", "note", "save_note", "end_job", "show_labels"]

@component
export class MWNPDemoAutoplayScenario extends Scenario {
  async run(): Promise<void> {
    // ── The numbers ──
    expect(DEMO_DRIVER, "DEMO_DRIVER is false in the project").toBe(false)
    expect(DEMO_LINES.length, "17 lines").toBe(17)
    expect(DEMO_HOLD_SEC.join(","), "one hold per line, as specified").toBe("7,2,10,10,1.5,1.5,1.5,6,1.5,6,2,2,1.5,1.5,1.5,5,15")
    expect(DEMO_INTRO_HOLD_SEC, "15 s before the first line").toBe(15)

    // ── The timing, on a fake clock: waits while busy, then holds, then the next line; stop() stops it ──
    {
      let t = 0
      let busyUntil = 0
      const log: string[] = []
      const starts: number[] = []
      let flips = 0
      const runner = new DemoRunner(DEMO_LINES, () => {}, () => { busyUntil = t + 2.0 }, () => {})
      const holds = DEMO_LINES.map(() => 1.0)
      const ap = new DemoAutoplay(runner, {now: () => t, busy: () => t < busyUntil, flipS1: () => { flips++ }, log: (m) => { log.push(m); if (m.indexOf("autoplay line ") === 0) starts.push(t) }}, DEMO_LINES, holds, 0.5)
      runner.cursor = 7
      ap.start()
      expect(runner.cursor, "start resets the cursor to line 1").toBe(0)
      for (let i = 0; i < 4; i++) { t += 0.1; ap.tick() }
      expect(log.indexOf("autoplay line 1"), "nothing plays during the intro hold").toBe(-1)
      t = 0.5
      ap.tick()
      expect(log.indexOf("autoplay line 1") >= 0 && runner.cursor === 1, "line 1 starts after the intro").toBe(true)
      while (!ap.finished && t < 200) { t += 0.1; ap.tick() }
      expect(ap.finished && !ap.running, "it runs to the end").toBe(true)
      expect(log[log.length - 1], "and says so").toBe("autoplay done")
      expect(starts.length, "every line started once").toBe(17)
      for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1] >= 3.0 - 0.15, "line " + (i + 1) + " waited for the speech (2 s) then held (1 s): " + (starts[i] - starts[i - 1]).toFixed(2)).toBe(true)
      expect(flips, "S1 is flipped once, after the retest line").toBe(1)
      // stop(): P again
      const log2: string[] = []
      const runner2 = new DemoRunner(DEMO_LINES, () => {}, () => {}, () => {})
      const ap2 = new DemoAutoplay(runner2, {now: () => t, busy: () => false, flipS1: () => {}, log: (m) => log2.push(m)}, DEMO_LINES, holds, 0.2)
      ap2.start()
      t += 0.3
      ap2.tick()
      ap2.stop()
      const lines = log2.filter((m) => m.indexOf("autoplay line ") === 0).length
      for (let i = 0; i < 40; i++) { t += 0.5; ap2.tick() }
      expect(!ap2.running && log2.filter((m) => m.indexOf("autoplay line ") === 0).length === lines, "after stop() no further line plays").toBe(true)
    }

    // ── A full run through the real app: 17 lines, holds shortened to 0.2 s ──
    await waitFor((s) => s.initialized === true && s.visibleCard === "safety", 10000, "safety card")
    const sparky = (global as any).mwnpSparky
    const app = (global as any).mwnpAssistant
    expect(!!sparky && !!app, "SparkyVoice and Main are running").toBe(true)
    sparky.setRealClips(false)
    sparky.setAsrEnabled(false)
    sparky.askSpeak = false
    sparky.askTokenOverride = null // no network request for the two questions
    sparky.addFakeClip("logged", 3.0) // a stand-in for Sparky's reply to a reading: the autoplay has to wait for it
    sparky.addFakeClip("step_EXTEND_1", 0.5) // step 1 after picking the symptom
    // Spy on every request to play clips (by voice command or by button), keeping the real behavior.
    const clipCalls: string[][] = []
    const origPlay = sparky.playClips.bind(sparky)
    sparky.playClips = (names: string[]) => {
      clipCalls.push(names.slice())
      origPlay(names)
    }
    await sleep(300)
    const n0 = sparky.acted.length
    const lineStarts: number[] = []
    const lineNos: number[] = []
    let doneCount = 0
    const flips: {at: number; s1Before: string; s1After: string}[] = []
    const runner = new DemoRunner(DEMO_LINES, () => {}, (c, f) => sparky.inject(c, f), () => {})
    const holds = DEMO_LINES.map(() => 0.2)
    const ap = new DemoAutoplay(
      runner,
      {
        now: () => getTime(),
        busy: () => !!sparky.busySpeaking,
        flipS1: () => {
          const before = mwnpState().s1
          if (before !== "UP") app.voiceCommand("s1_up")
          flips.push({at: sparky.acted.length - n0, s1Before: before, s1After: mwnpState().s1})
        },
        log: (m) => {
          const mm = /^autoplay line (\d+)$/.exec(m)
          if (mm) {
            lineNos.push(parseInt(mm[1], 10))
            lineStarts.push(getTime())
          }
          if (m === "autoplay done") doneCount++
        },
      },
      DEMO_LINES,
      holds,
      0.2
    )
    ap.start()
    const t0 = getTime()
    while (!ap.finished && getTime() - t0 < 150) {
      ap.tick()
      await sleep(50)
    }
    expect(ap.finished, "autoplay finished within 150 s").toBe(true)
    expect(lineNos.join(","), "all 17 lines in order").toBe("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17")
    expect(doneCount, "'autoplay done' once").toBe(1)
    const names = sparky.acted.slice(n0).map((a: any) => a.name)
    expect(names.join(","), "every line's command ran, in order").toBe(NAMES.join(","))
    expect(flips.length, "S1 flipped once").toBe(1)
    expect(flips[0].at, "right after the retest line (the 11th command)").toBe(11)
    expect(flips[0].s1After, "and it is UP").toBe("UP")
    // The autoplay waited for Sparky's reply (3.0 s "logged" stand-in + tail) after each in-spec reading before the next line
    // (lines 5, 6 and 12; the 0 V reading on line 8 raises a finding, which has a different reply).
    for (const idx of [4, 5, 11]) {
      const gap = lineStarts[idx + 1] - lineStarts[idx]
      expect(gap >= 3.0, "after line " + (idx + 1) + " (a reading) the next line waited for Sparky's reply: " + gap.toFixed(2) + " s").toBe(true)
    }
    expect(mwnpState().jobActive, "end job closed the job").toBe(false)
    expect(mwnpState().labelTags.on, "show labels turned the labels on").toBe(true)

    // Sparky speaks step 1 after "extend doesn't work" (the 3rd command): the clip is asked for and played.
    expect(sparky.requested[n0 + 2].join(","), "picking the symptom by voice asks for step 1's clip").toBe("step_EXTEND_1")
    expect(clipCalls.some((c) => c.indexOf("step_EXTEND_1") >= 0), "and Sparky played it").toBe(true)

    // The same by button: a new job, then the EXTEND symptom button, plays step 1 too.
    const ui = new MWNPLeafInteractor()
    const before = clipCalls.length
    await ui.tap("Btn_Lib_Job")
    await ui.tap("Btn_NewJob")
    await waitFor((s) => s.visibleCard === "symptoms", 3000, "symptom list")
    expect(clipCalls.length, "opening the symptom list plays nothing").toBe(before)
    await ui.tap("Btn_Symptom_EXTEND")
    await waitFor((s) => s.visibleCard === "step" && s.activePoint === "TS-4", 3000, "step 1 after the symptom button")
    expect(clipCalls.slice(before).some((c) => c.join(",") === "step_EXTEND_1"), "picking the symptom with the button speaks step 1: " + JSON.stringify(clipCalls.slice(before))).toBe(true)
    ev("DEMO AUTOPLAY PASS", {names: names.length, seconds: +(getTime() - t0).toFixed(1)})
  }
}
