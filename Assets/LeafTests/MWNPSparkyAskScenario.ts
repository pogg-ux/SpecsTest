// "Sparky, ask ...": grounded answers from the job files through RSG chat + text-to-speech.
// Real requests (a handful of chat calls and one speech call), so it needs the local token in Assets/Local/RsgSecret.json; without it
// only the no-connection path is checked. The refusal for something not in the files must be the exact sentence.

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
    expect(a4, "not in the files -> the exact refusal").toBe(REFUSAL)
    ev("SPARKY ASK PASS", {})
  }
}
