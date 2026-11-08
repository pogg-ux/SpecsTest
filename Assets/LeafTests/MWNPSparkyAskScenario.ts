// "Sparky, ask ...": grounded answers from the job files through RSG chat + text-to-speech.
// Real requests (a handful of chat calls and one speech call), so it needs the local token in Assets/Local/RsgSecret.json; without it
// only the no-connection path is checked. The answer for something not in the files must start with the exact refusal sentence (then a next check).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev} from "./MWNPLeafInteractor"
import {parseCommand} from "../Scripts/MWNPSpeech"

const REFUSAL = "I can't confirm that from the job files."
const OFFLINE = "Live answers need a connection."

@component
export class MWNPSparkyAskScenario extends Scenario {
  async run(): Promise<void> {
    // Parser: all the ways to ask.
    const q = (t: string): string => {
      const c = parseCommand(t)
      return c && c.name === "ask" ? c.arg : "-"
    }
    expect(q("ask why that terminal"), "ask <q>").toBe("why that terminal")
    expect(q("why that terminal"), "why ...").toBe("why that terminal")
    expect(q("what is the fuse rating"), "what is ...").toBe("what is the fuse rating")
    expect(q("what s the fuse rating"), "what's ...").toBe("what s the fuse rating")
    expect(q("what does f1 protect"), "what does ...").toBe("what does f1 protect")
    expect(q("next"), "next is not a question").toBe("-")
    // Any question opener, or a trailing "?", is an ask (the three sample questions, spoken without "ask").
    expect(q("what feeds L1"), "what feeds ...").toBe("what feeds l1")
    expect(q("why is L2 dead"), "why is ...").toBe("why is l2 dead")
    expect(q("what should TS-4 read"), "what should ...").toBe("what should ts 4 read")
    expect(q("how does the switch work"), "how ...").toBe("how does the switch work")
    expect(q("where is F2"), "where ...").toBe("where is f2")
    expect(q("when does L1 come on"), "when ...").toBe("when does l1 come on")
    expect(q("is F1 blown"), "is ...").toBe("is f1 blown")
    expect(q("can I trust TS-4"), "can ...").toBe("can i trust ts 4")
    expect(q("the lamp is off?"), "trailing ?").toBe("lamp is off")
    expect(q("whatever"), "a word that only starts with what is not a question").toBe("-")
    // Commands always win over the question rule.
    expect(q("how"), "a bare opener with nothing after it is not a question").toBe("-")
    const up = parseCommand("is one up")
    expect(up ? up.name : "-", "'is one up' stays the S1 command").toBe("s1_up")

    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    const sparky = (global as any).mwnpSparky
    sparky.setRealClips(false)
    sparky.setAsrEnabled(false)
    await sleep(300)

    const askAndWait = async (text: string): Promise<string> => {
      sparky.askState = "idle"
      sparky.inject("Sparky, " + text)
      const t0 = Date.now()
      while (sparky.askState !== "done" && sparky.askState !== "failed" && Date.now() - t0 < 30000) await sleep(200)
      const dt = (Date.now() - t0) / 1000
      ev("ASK", {q: text, state: sparky.askState, seconds: dt, answer: sparky.answerText})
      return sparky.answerText as string
    }

    // No token / no connection: the sentence, on the card, and the rest of Sparky keeps working.
    const saved = sparky.askTokenOverride
    sparky.askTokenOverride = null
    const off = await askAndWait("ask why that terminal")
    expect(off, "no token -> the connection sentence").toBe(OFFLINE)
    expect(sparky.askState, "failed state").toBe("failed")
    expect(sparky.answerVisible, "the answer card shows it").toBe(true)
    sparky.askTokenOverride = saved
    await sleep(2200)
    sparky.inject("Sparky, close")
    await sleep(400)
    expect(sparky.answerVisible, "close hides the answer card").toBe(false)

    if (!sparky.hasAskToken()) {
      ev("SPARKY ASK PASS (no token: live part skipped)", {})
      return
    }

    // 1) A grounded question, spoken: ASR pauses while the answer plays and comes back.
    sparky.askSpeak = true
    const a1 = await askAndWait("why that terminal")
    expect(a1.length > 0 && a1 !== OFFLINE, "answer to 'why that terminal': " + a1).toBe(true)
    let paused = false
    const t1 = Date.now()
    while (Date.now() - t1 < 12000 && !paused) {
      paused = sparky.asrPaused
      await sleep(150)
    }
    expect(paused, "ASR pauses while the answer is spoken").toBe(true)
    const t2 = Date.now()
    while (sparky.asrPaused && Date.now() - t2 < 20000) await sleep(200)
    expect(sparky.asrPaused, "ASR resumes after the answer").toBe(false)

    // The rest without speech (saves requests).
    sparky.askSpeak = false
    const a2 = await askAndWait("what does F1 protect")
    expect(a2.length > 0 && a2 !== OFFLINE && a2 !== REFUSAL, "F1 answer: " + a2).toBe(true)
    await sleep(2200)
    const a3 = await askAndWait("what's the fuse rating")
    expect(a3.indexOf("0.5") >= 0, "fuse rating mentions 0.5 A: " + a3).toBe(true)
    await sleep(2200)
    const a4 = await askAndWait("what's the torque spec")
    expect(a4.indexOf(REFUSAL) === 0, "not in the files -> starts with the refusal: " + a4).toBe(true)
    // The three sample questions, spoken without "ask": EXTEND and RETRACT must both be answerable from the job files.
    const sample = ["what feeds L1", "why is L2 dead", "what should TS-4 read", "what feeds L2"]
    const inOrder = (text: string, parts: string[]): boolean => {
      let from = 0
      for (const part of parts) {
        const at = text.indexOf(part, from)
        if (at < 0) return false
        from = at + part.length
      }
      return true
    }
    const answers: string[] = []
    for (const t of sample) {
      await sleep(2200)
      answers.push(await askAndWait(t))
    }
    expect(inOrder(answers[0], ["PS1", "TS-1", "COM", "UP", "2a", "TS-4", "2b", "F1", "2c", "L1"]), "what feeds L1 lists the full path in order: " + answers[0]).toBe(true)
    expect(answers[1].indexOf("TS-5") >= 0 && answers[1].indexOf("S1 DOWN") >= 0, "no L2 readings in the job, so a grounded next check from the RETRACT steps: " + answers[1]).toBe(true)
    expect(answers[2].indexOf("12") >= 0 || answers[2].indexOf("10.8") >= 0, "TS-4 expected reading: " + answers[2]).toBe(true)
    expect(inOrder(answers[3], ["PS1", "TS-1", "COM", "DOWN", "3a", "TS-5", "3b", "F2", "3c", "L2"]), "what feeds L2 lists the full path in order: " + answers[3]).toBe(true)
    // Grounding: no answer names a part or test point that is not in the netlist.
    const known = ["PS1", "TS-1", "TS-2", "TS-3", "TS-4", "TS-5", "S1", "F1", "F2", "L1", "L2"]
    for (const a of answers) {
      const ids = a.match(/\b(?:PS|TS-|S|F|L)\d+\b/g) || []
      for (const id of ids) expect(known.indexOf(id) >= 0, "answer names a part that is in the job files (" + id + "): " + a).toBe(true)
    }
    ev("SPARKY ASK PASS", {})
  }
}
