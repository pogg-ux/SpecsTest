// Demo autoplay: the hold array and intro are as specified, the timing logic waits for the clip / Sparky's speech and then holds,
// P-again stops it, and a full run (holds shortened to 0.2 s) plays all 21 lines in order with S1 flipped after "retest".
// DEMO_DRIVER stays false: the autoplay class is driven directly, with the real app and SparkyVoice but no clips and no keys.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DEMO_DRIVER, DemoAutoplay, DemoRunner} from "../Scripts/DemoDriver"
import {DEMO_CLOSER_SPEECH, DEMO_HOLD_SEC, DEMO_INTRO_HOLD_SEC, DEMO_INTRO_SPEECH, DEMO_LINES, DEMO_SIGNOFF_SPEECH} from "../Scripts/DemoScript"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

/** The command each line must run, in order (SparkyVoice.acted[].name). */
const NAMES = ["dismiss", "report_symptom", "symptom", "hide_display", "log", "log_confirm", "log", "show_display", "show_schematic", "close", "log", "ask", "ask", "retest", "log", "fixed", "note", "save_note", "end_job", "close", "show_labels"]

@component
export class MWNPDemoAutoplayScenario extends Scenario {
  /** Parameter `shot` (screenshot runs): "labels" stops right after "show labels" with the end state held for 120 s; "" runs the whole check. */
  async run(config?: ScenarioConfig): Promise<void> {
    const shot = (config && config.get("shot")) || ""
    // ── The numbers ──
    expect(DEMO_DRIVER, "DEMO_DRIVER is false in the project").toBe(false)
    expect(DEMO_LINES.length, "21 lines").toBe(21)
    expect(DEMO_HOLD_SEC.join(","), "one hold per line, as specified").toBe("15,1,8.5,10,1,1,7,1,4.5,1,7,1,8,2,1,1,1,7.5,4,1,18")
    expect(DEMO_INTRO_HOLD_SEC, "2 s after Sparky's intro, before the first line").toBe(2)
    expect(DEMO_INTRO_SPEECH, "intro text").toBe("Hi, I'm Sparky, the no-guess assistant inside FaultLens. I only tell you what your prints and your meter can prove. Let me show you how we work together.")
    expect(DEMO_SIGNOFF_SPEECH, "sign-off text").toBe("Job closed. Fault found, fixed, and logged. Nothing guessed.")
    expect(DEMO_CLOSER_SPEECH, "closer text").toBe("Grab your meter. Let's get to work.")

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
      expect(starts.length, "every line started once").toBe(21)
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
      // Sparky's speech: intro (3 s) then 2 s, line 1 ... "end job" + hold, sign-off (3 s), "show labels" + hold, closer (3 s), done.
      {
        const events: string[] = []
        let tt = 0
        let busyTo = 0
        const r3 = new DemoRunner(DEMO_LINES, () => {}, (c) => events.push("cmd:" + c), () => {})
        const a3 = new DemoAutoplay(
          r3,
          {now: () => tt, busy: () => tt < busyTo, flipS1: () => {}, log: (m) => { if (m === "autoplay done") events.push("done") }, speak: (x) => { events.push("say:" + x); busyTo = tt + 3 }},
          DEMO_LINES,
          DEMO_LINES.map(() => 1.0),
          2,
          60,
          {intro: "I", signoff: "S", closer: "C"}
        )
        a3.start()
        const t3 = tt
        let firstLineAt = -1
        while (!a3.finished && tt < 300) {
          tt += 0.1
          a3.tick()
          if (firstLineAt < 0 && events.some((e) => e.indexOf("cmd:") === 0)) firstLineAt = tt - t3
        }
        expect(events[0], "Sparky speaks the intro first").toBe("say:I")
        expect(firstLineAt >= 5 - 0.15 && firstLineAt < 5.5, "line 1 starts after the speech (3 s) + 2 s: " + firstLineAt.toFixed(2)).toBe(true)
        const iEnd = events.indexOf("cmd:Sparky, end job")
        expect(events[iEnd + 1], "the sign-off follows 'end job'").toBe("say:S")
        expect(events[iEnd + 2], "and then 'close'").toBe("cmd:Sparky, close")
        expect(events.slice(-2).join(","), "the closer is the last thing, then done").toBe("say:C,done")
        expect(events.filter((e) => e.indexOf("say:") === 0).length, "three speeches in all").toBe(3)
      }
    }

    // ── A full run through the real app: 21 lines, holds shortened to 0.2 s ──
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
    // Which cards are on screen right now (the Library chip is not a card).
    const openCards = (): string[] => {
      const cards: {[k: string]: any} = {stepCard: app.stepCard, findingCard: app.findingCard, summaryCard: app.summaryCard, notesCard: app.notesCard, cameraCard: app.cameraCard, optionsCard: app.optionsCard, photoViewer: app.photoViewer}
      const out: string[] = Object.keys(cards).filter((k) => !!cards[k] && cards[k].isVisible === true)
      if (app.schematicPanel && app.schematicPanel.isOpen) out.push("schematicPanel")
      return out
    }
    let cardsAfterEndJob = ""
    let cardAfterEndJob = ""
    const n0 = sparky.acted.length
    const spoken0 = sparky.spoken.length
    const snaps: {[line: number]: {card: string; schem: boolean; hidden: boolean; readings: number; open: string; lib: boolean; acted: number}} = {}
    const ordered: string[] = [] // the order of the autoplay's speech and lines, from its log
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
        speak: (text: string) => sparky.sayPrompt(text, ""),
        log: (m) => {
          const sm = /^autoplay Sparky says \((\w+)\)$/.exec(m)
          if (sm) ordered.push(sm[1])
          const mm = /^autoplay line (\d+)$/.exec(m)
          if (mm) {
            ordered.push("L" + mm[1])
            lineNos.push(parseInt(mm[1], 10))
            lineStarts.push(getTime())
            // What is on screen as each line starts = the result of the line before it (and its hold).
            const st = mwnpState()
            snaps[parseInt(mm[1], 10)] = {card: st.visibleCard, schem: !!st.schematicOpen, hidden: !!st.display.hidden, readings: st.readings.length, open: openCards().join(","), lib: !!st.libraryOpen, acted: sparky.acted.length - n0}
            // Line 20 ("close") starts right after "end job" (line 19), its hold and Sparky's sign-off: what is on screen now is the end-job state.
            if (mm[1] === "20") {
              cardsAfterEndJob = openCards().join(",")
              cardAfterEndJob = mwnpState().visibleCard
            }
          }
          if (m === "autoplay done") doneCount++
        },
      },
      DEMO_LINES,
      holds,
      0.2,
      60,
      {intro: DEMO_INTRO_SPEECH, signoff: DEMO_SIGNOFF_SPEECH, closer: DEMO_CLOSER_SPEECH}
    )
    ap.start()
    const t0 = getTime()
    while (!ap.finished && getTime() - t0 < 150) {
      ap.tick()
      await sleep(50)
    }
    expect(ap.finished, "autoplay finished within 150 s").toBe(true)
    expect(lineNos.join(","), "all 21 lines in order").toBe(Array.from({length: 21}, (_, i) => String(i + 1)).join(","))
    expect(doneCount, "'autoplay done' once").toBe(1)
    const names = sparky.acted.slice(n0).map((a: any) => a.name)
    expect(names.join(","), "every line's command ran, in order").toBe(NAMES.join(","))
    // Sparky's own speech, through the prompt path (SparkyVoice.spoken): intro first, sign-off between "end job" and "show labels", closer last.
    const said: string[] = sparky.spoken.slice(spoken0)
    expect(said[0], "Sparky spoke the intro first").toBe(DEMO_INTRO_SPEECH)
    expect(said.indexOf(DEMO_SIGNOFF_SPEECH) > 0 && said.indexOf(DEMO_SIGNOFF_SPEECH) < said.indexOf(DEMO_CLOSER_SPEECH), "sign-off before closer").toBe(true)
    expect(said[said.length - 1], "and the closer was last").toBe(DEMO_CLOSER_SPEECH)
    expect(ordered.join(","), "intro, then the lines, with the sign-off after end job (line 19) and the closer after line 21").toBe("intro," + Array.from({length: 19}, (_, i) => "L" + (i + 1)).join(",") + ",signoff,L20,L21,closer")
    expect(flips.length, "S1 flipped once").toBe(1)
    expect(flips[0].at, "right after the retest line (the 14th command)").toBe(14)
    expect(flips[0].s1After, "and it is UP").toBe("UP")
    // The autoplay waited for Sparky's reply (3.0 s "logged" stand-in + tail) after each in-spec reading before the next line
    // (lines 5, 7 and 15; the 0 V reading on line 8 raises a finding, which has a different reply).
    for (const idx of [4, 6, 14]) {
      const gap = lineStarts[idx + 1] - lineStarts[idx]
      expect(gap >= 3.0, "after line " + (idx + 1) + " (a reading) the next line waited for Sparky's reply: " + gap.toFixed(2) + " s").toBe(true)
    }
    expect(mwnpState().jobActive, "end job closed the job").toBe(false)
    expect(mwnpState().labelTags.on, "show labels turned the labels on").toBe(true)

    // After "end job": only the Job report is open. The Notes card left over from "save note" must not sit under it (their tabs and
    // Add note buttons drew on top of each other).
    expect(cardsAfterEndJob, "after end job only the Job report is open, no Notes card under it").toBe("summaryCard")
    expect(cardAfterEndJob, "and it is the report").toBe("report")

    // "show labels" at the end shows the component tags on the full cabinet: all of them (no step focus: the job is over), fully opaque.
    await sleep(600) // the fade-in is 0.35 s; the 10 s reveal is still running
    const lt = mwnpState().labelTags
    expect(lt.on === true && lt.alpha === 1 && lt.fading === false, "the tags are faded in: " + JSON.stringify(lt)).toBe(true)
    const roots: SceneObject[] = app.partTags.labelRoots()
    const off = roots.filter((r) => !r.isEnabledInHierarchy).map((r) => r.name)
    expect(roots.length > 10, "the cabinet has its tags: " + roots.length).toBe(true)
    expect(off.join(","), "every component tag, leader and wire label is on (none hidden by a step focus)").toBe("")
    const firstText = (so: SceneObject): Text | null => {
      const t = so.getComponent("Component.Text") as Text
      if (t) return t
      for (let i = 0; i < so.getChildrenCount(); i++) {
        const c = firstText(so.getChild(i))
        if (c) return c
      }
      return null
    }
    const tagRoots = roots.filter((r) => r.name.indexOf("Tag_") === 0)
    const faint = tagRoots.filter((r) => {
      const t = firstText(r)
      return !t || t.textFill.color.w < 0.9
    }).map((r) => r.name)
    expect(tagRoots.length > 8, "component tags: " + tagRoots.length).toBe(true)
    expect(faint.join(","), "and every tag's text is opaque").toBe("")
    if (shot === "labels") {
      // Capture run: the end state (report open, labels showing) is held for 120 s (test-only override) so a screenshot can follow.
      app.setLabelFadeSec(120)
      app.revealLabels()
      ev("end state held for capture", {cards: openCards(), tags: tagRoots.length, labelTags: mwnpState().labelTags})
      return
    }

    // Line 20 ("close") closed the report: after end job + close no card remains, and the Library menu is all that is left.
    expect(openCards().join(","), "after end job + close no card remains").toBe("")
    expect(mwnpState().visibleCard, "the Library menu is all that is left").toBe("home")

    // The library-free flow, line by line (snaps[k] = the screen as line k starts = the result of line k-1).
    expect(snaps[2].lib && snaps[2].card === "home", "after 'understood' the Library menu is already open (no library / close lines)").toBe(true)
    // 4 "hide": cards hidden. 5 "log twelve point one" logs while hidden. 6 "log twelve point oh": "oh" is only a homophone, so the number is read back, not logged.
    expect(snaps[5].hidden, "'hide' hid the display").toBe(true)
    expect(snaps[7].readings, "'log twelve point oh' read the value back without logging it").toBe(snaps[6].readings)
    expect(sparky.acted[n0 + 5].name === "log_confirm" && /12\.0|twelve point zero/i.test(sparky.acted[n0 + 5].result), "the readback is for 12.0: " + sparky.acted[n0 + 5].result).toBe(true)
    expect(snaps[7].hidden, "the readback shows no card: " + JSON.stringify(snaps[7])).toBe(true)
    // 7 "yes": logs it, once, still without showing the cards.
    expect(snaps[8].readings, "'yes' logged the reading once").toBe(snaps[7].readings + 1)
    expect(sparky.acted[n0 + 6].name, "'yes' ran as a log").toBe("log")
    expect(snaps[8].hidden, "and the cards stayed hidden: " + JSON.stringify(snaps[8])).toBe(true)
    // 8 "show": the cards come back. 9 "show schematic" opens the schematic. 10 "close" closes it and the Step card is back.
    expect(snaps[9].hidden === false && snaps[9].card === "step", "'show' brought the Step card back").toBe(true)
    expect(snaps[10].schem, "'show schematic' opened the schematic").toBe(true)
    expect(snaps[11].schem === false && snaps[11].card === "step" && snaps[11].open.indexOf("stepCard") >= 0, "'close' closed the schematic and returned to the Step card: " + JSON.stringify(snaps[11])).toBe(true)

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
