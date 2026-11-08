// Sparky clips, without audio files: each command asks for the right clip names; missing clips are skipped silently (ASR keeps
// running); while a clip plays ASR is stopped and anything "heard" is ignored; ASR comes back when the clip ends.
// Uses silent stand-in clips (SparkyVoice.addFakeClip) because no mp3 files are needed for the logic.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState} from "./MWNPLeafInteractor"

@component
export class MWNPSparkyClipsScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    const sparky = (global as any).mwnpSparky
    expect(!!sparky, "SparkyVoice is running").toBe(true)
    sparky.setAsrEnabled(false)
    await sleep(300)
    const lastReq = (): string => sparky.requested[sparky.requested.length - 1].join(",")

    // No clip files: the right names are requested, nothing plays, ASR is never paused.
    sparky.inject("Sparky, next")
    await sleep(400)
    expect(lastReq(), "next asks for the step 2 clip").toBe("step_EXTEND_2")
    expect(sparky.asrPaused, "no clip exists, so ASR is not paused").toBe(false)

    // Stand-in clips: ASR pauses while they play and resumes after; speech heard meanwhile is ignored.
    for (const n of ["step_EXTEND_1", "step_EXTEND_2", "step_EXTEND_3", "logged", "undone", "which_wire", "out_of_range"]) sparky.addFakeClip(n, 0.6)
    await sleep(2100)
    sparky.inject("Sparky, back")
    expect(lastReq(), "back asks for the step 1 clip").toBe("step_EXTEND_1")
    expect(sparky.asrPaused, "ASR is stopped while the clip plays").toBe(true)
    const n0 = sparky.acted.length
    sparky.inject("Sparky, next") // Sparky must not act on what it 'hears' while it speaks
    expect(sparky.acted.length, "speech during a clip is ignored").toBe(n0)
    await sleep(1500)
    expect(sparky.asrPaused, "ASR is back after the clip").toBe(false)

    // next -> step 2 clip; log -> "logged" then the step 3 clip, in that order.
    sparky.inject("Sparky, next")
    await sleep(1500)
    expect(lastReq(), "next asks for the step 2 clip").toBe("step_EXTEND_2")
    sparky.inject("Sparky, log twelve point zero")
    expect(lastReq(), "log asks for 'logged' then the next step's clip").toBe("logged,step_EXTEND_3")
    expect(sparky.asrPaused, "paused while the queue plays").toBe(true)
    await sleep(2500)
    expect(sparky.asrPaused, "resumed after the whole queue").toBe(false)
    expect(mwnpState().readings.length, "the reading was logged").toBe(1)

    // undo -> "undone" then the step clip; nothing left to undo -> no clip file for it, silent.
    sparky.inject("Sparky, undo")
    expect(lastReq(), "undo asks for 'undone' then the step clip").toBe("undone,step_EXTEND_2")
    await sleep(2500)
    expect(sparky.asrPaused, "resumed").toBe(false)

    // Which wire?
    sparky.inject("Sparky, highlight wire 3d")
    expect(lastReq(), "an ambiguous wire asks 'which_wire'").toBe("which_wire")
    await sleep(1500)

    // A reading of 0 V is out of range for the point: that clip, and no step clip (the finding card takes over).
    sparky.inject("Sparky, log zero")
    expect(lastReq(), "0 V -> out_of_range").toBe("out_of_range")
    await sleep(1500)
    expect(sparky.asrPaused, "resumed").toBe(false)
    ev("SPARKY CLIPS PASS", {requested: sparky.requested.length})
  }
}
