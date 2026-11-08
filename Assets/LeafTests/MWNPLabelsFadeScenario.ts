// Labels "On request": a step's tags show, fade out after LABEL_FADE_SEC, come back on "show labels" and leave on "clear".
// Wire highlights and reading badges are not part of this fade and are not checked here.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {LABEL_FADE_SEC} from "../Scripts/MWNPMain"
import {parseCommand} from "../Scripts/MWNPSpeech"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

/** Whether any ID tag or wire badge is really showing (enabled in the hierarchy). */
function anyLabelShowing(): boolean {
  const root = findSceneObjectByName("PartTags")
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const c = root.getChild(i)
    if ((c.name.indexOf("Tag_") === 0 || c.name.indexOf("WireLabel_") === 0 || c.name.indexOf("WireEnd_") === 0) && c.isEnabledInHierarchy) return true
  }
  return false
}

@component
export class MWNPLabelsFadeScenario extends Scenario {
  /** Parameter `shot` (screenshot runs): "on" stops with the step's labels showing, "faded" stops once they have faded; "full" runs the whole check. */
  async run(config?: ScenarioConfig): Promise<void> {
    const shot = (config && config.get("shot")) || "full"
    ev("labels-fade start", {shot})
    const ui = new MWNPLeafInteractor()
    const app = (global as any).mwnpAssistant
    await ui.startExtendDiagnosis()
    expect(mwnpState().options.labels, "default is On request").toBe("On request")

    // Step started: its labels show, and only its labels.
    await waitFor((s) => s.labelTags.on && s.labelTags.alpha > 0.99, 3000, "step labels shown")
    expect(anyLabelShowing(), "tags show for the step").toBe(true)
    expect(findSceneObjectByName("Tag_F1").isEnabledInHierarchy, "a part outside the step's focus stays hidden").toBe(false)
    ev("labels shown", mwnpState().labelTags)
    if (shot === "on") {
      // Capture runs only: re-reveal every frame for 40 s so the tool-call latency before the screenshot cannot let them time out.
      const until = getTime() + 40
      app.createEvent("UpdateEvent").bind(() => {
        if (getTime() < until) app.revealLabels()
      })
      await sleep(800)
      ev("labels on for capture", mwnpState().labelTags)
      return
    }
    await sleep(500)

    // Past the timeout: hidden.
    await sleep((LABEL_FADE_SEC + 1.5) * 1000)
    const faded = mwnpState().labelTags
    ev("labels faded", faded)
    expect(faded.on, "labels off after " + LABEL_FADE_SEC + " s").toBe(false)
    expect(anyLabelShowing(), "no tag showing after the timeout").toBe(false)

    if (shot === "faded") return

    // "show labels" brings them back; "clear" removes them right away.
    expect(parseCommand("show labels")?.name, "parse show labels").toBe("show_labels")
    expect(parseCommand("show me")?.name, "parse show me").toBe("show_labels")
    expect(parseCommand("clear")?.name, "parse clear").toBe("clear_labels")
    expect(parseCommand("hide labels")?.name, "parse hide labels").toBe("clear_labels")
    app.voiceCommand("show_labels")
    await waitFor((s) => s.labelTags.on && s.labelTags.alpha > 0.99, 3000, "labels back on show labels")
    expect(anyLabelShowing(), "tags show after show labels").toBe(true)
    await sleep(1000)
    expect(mwnpState().labelTags.on, "still on 1 s later").toBe(true)
    app.voiceCommand("clear_labels")
    await waitFor((s) => !s.labelTags.on && !s.labelTags.fading, 3000, "labels cleared")
    expect(anyLabelShowing(), "no tag showing after clear").toBe(false)
  }
}
