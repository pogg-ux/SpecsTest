// Sparky: "report symptom", "open notes", and dictated notes ("note <text>" -> Save note / Cancel by voice or button).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

@component
export class MWNPSparkyNotesScenario extends Scenario {
  async run(): Promise<void> {
    const sparky = (global as any).mwnpSparky
    const app = (global as any).mwnpAssistant
    await waitFor((s) => s.visibleCard === "safety", 4000, "safety notice")
    sparky.setRealClips(false)
    sparky.setAsrEnabled(false)
    await sleep(300)
    const say = async (t: string, ms: number = 600): Promise<void> => {
      sparky.inject("Sparky, " + t)
      await sleep(ms)
    }
    const tech = (): any[] => app.notes.filter((n: any) => n.source === "Tech")

    await say("understood")
    expect(mwnpState().visibleCard, "dismissed: the Library is home").toBe("home")
    await say("report symptom")
    expect(mwnpState().visibleCard, "report symptom opens the symptom list").toBe("symptoms")
    await say("extend doesn't work", 900)
    expect(mwnpState().visibleCard, "symptom picked").toBe("step")
    await say("report symptom")
    expect(mwnpState().visibleCard, "no second symptom list once reported").toBe("step")

    await say("open notes", 900)
    expect(mwnpState().visibleCard === "report" || mwnpState().visibleCard === "summary", "report open: " + mwnpState().visibleCard).toBe(true)
    expect(mwnpState().reportTab, "open notes -> Notes & pictures tab").toBe("notes")

    // Dictate, cancel.
    const before = app.notes.length
    await say("note replace the fuse F1 and retest", 900)
    expect(app.notesCard.view, "dictation card showing").toBe("dictate")
    expect(app.notesCard.dictated, "text capitalised: " + app.notesCard.dictated).toBe("Replace the fuse f1 and retest")
    await say("cancel")
    expect(app.notesCard.view, "cancel leaves it").toBe("list")
    expect(app.notes.length, "nothing saved").toBe(before)

    // Dictate with a pause mid-sentence (the text keeps growing), save by voice.
    sparky.inject("Sparky, note check the lamp", false)
    await sleep(1400)
    expect(app.notesCard.dictated, "first part shown").toBe("Check the lamp")
    sparky.inject("Sparky, note check the lamp wiring", false)
    await sleep(500)
    expect(app.notesCard.dictated, "later words update the card").toBe("Check the lamp wiring")
    await sleep(2200)
    await say("save note", 700)
    expect(tech().length, "one Tech note saved").toBe(1)
    expect(tech()[0].text, "saved text").toBe("Check the lamp wiring")
    expect(typeof tech()[0].time === "string" && tech()[0].time.length > 0, "time stamped").toBe(true)
    expect(app.notesCard.view, "back to the list").toBe("list")
    ev("SPARKY NOTES PASS", {})
  }
}
