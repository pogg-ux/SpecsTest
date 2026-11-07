// Camera card Close: the card disappears completely (no ghost), its text stays pure white however often it is opened, and
// the Library / main Hide-Show buttons always say what the display is actually doing, before and after a Camera round trip.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

function isEnabled(name: string): boolean {
  const so = findSceneObjectByName(name)
  return !!so && so.isEnabledInHierarchy
}

function labelOf(buttonName: string): string {
  const so = findSceneObjectByName(buttonName)
  for (let i = 0; i < so.getChildrenCount(); i++) {
    if (so.getChild(i).name === "Label") return (so.getChild(i).getComponent("Component.Text") as Text).text
  }
  return "?"
}

/** Visible pixels under a card: every enabled Text with some alpha, and every enabled UIKit plate / image. Empty list = nothing shows. */
function shownParts(rootName: string): string[] {
  const root = findSceneObjectByName(rootName)
  const out: string[] = []
  if (!root || !root.isEnabledInHierarchy) return out
  const walk = (o: SceneObject) => {
    if (!o.enabled) return
    const t = o.getComponent("Component.Text") as Text
    if (t && t.text.length > 0 && t.textFill.color.w > 0.02) out.push(o.name)
    const img = o.getComponent("Component.Image") as Image
    if (img && img.mainMaterial && img.mainMaterial.mainPass.baseColor.w > 0.02) out.push(o.name)
    for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
  }
  walk(root)
  return out
}

/** Weakest white-ness / alpha of the card's texts (all of these must be pure white, fully opaque). */
function worstText(rootName: string, names: string[]): string {
  const root = findSceneObjectByName(rootName)
  const bad: string[] = []
  const walk = (o: SceneObject) => {
    if (!o.enabled) return
    const t = o.getComponent("Component.Text") as Text
    if (t && t.text.length > 0 && names.indexOf(o.name) >= 0 && o.getParent().name !== "Btn_Snapshot") {
      const c = t.textFill.color
      if (c.x < 0.97 || c.y < 0.97 || c.z < 0.97 || c.w < 0.97) bad.push(o.name + " " + [c.x, c.y, c.z, c.w].map((v) => v.toFixed(2)).join(","))
    }
    for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
  }
  walk(root)
  return bad.join("; ")
}

@component
export class MWNPCameraCloseScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    await sleep(600)

    const libraryShown = (): boolean => isEnabled("LibraryCardCard") && mwnpState().libraryAlpha > 0.02
    const checkLibraryButton = (what: string) => {
      const s = mwnpState()
      const shown = libraryShown()
      expect(s.libraryHidden, what + ": the Library's hidden flag matches what is on screen").toBe(!shown)
      expect(labelOf("Btn_LibraryToggle"), what + ": Library button label follows visibility").toBe(shown ? "Hide" : "Show")
    }
    const checkMainButton = (what: string) => {
      const s = mwnpState()
      expect(labelOf("Btn_DisplayToggle"), what + ": main button label follows the display").toBe(s.display.hidden ? "Show" : "Hide")
    }
    checkLibraryButton("start")
    checkMainButton("start")

    // Re-fading a card that is still mid-fade (the Library's Camera entry pressed again and again) must not leave it dim.
    const app = (global as any).mwnpAssistant
    await ui.tap("Btn_Camera")
    await waitFor((s) => s.visibleCard === "camera", 3000, "camera card for the re-fade test")
    for (let i = 0; i < 6; i++) {
      await sleep(40)
      app.pulseCard(app.cameraCard.sceneObject)
    }
    await sleep(900)
    expect(worstText("CameraCardCard", ["CameraTitle", "CameraTarget", "Label"]), "pulsed mid-fade: text is still pure white").toBe("")
    await ui.tap("Btn_CameraClose")
    await waitFor((s) => s.visibleCard === "step", 3000, "step after the re-fade test")
    await sleep(600)

    // Torture: open and close within the fade, and press the Library's Camera entry repeatedly while the card is open.
    for (let i = 0; i < 4; i++) {
      await ui.tap("Btn_Camera")
      await waitFor((s) => s.visibleCard === "camera", 3000, "camera card (quick) " + i)
      await sleep(70)
      await ui.tap("Btn_Lib_Camera")
      await sleep(60)
      await ui.tap("Btn_Lib_Camera")
      await sleep(50)
      await ui.tap("Btn_CameraClose")
      await waitFor((s) => s.visibleCard === "step", 3000, "step again " + i)
      await sleep(40)
    }
    await sleep(800)
    expect(isEnabled("CameraCardCard"), "quick open / close leaves no Camera card").toBe(false)
    checkLibraryButton("after quick round trips")

    // The white body text on the open Camera card, on three successive openings, with a Snapshot in between.
    for (let round = 0; round < 3; round++) {
      await ui.tap("Btn_Camera")
      await waitFor((s) => s.visibleCard === "camera", 3000, "camera card open " + round)
      await sleep(700)
      expect(worstText("CameraCardCard", ["CameraTitle", "CameraTarget", "Label"]), "round " + round + ": Camera card text is pure white").toBe("")
      expect(labelOf("Btn_Snapshot").length > 0, "Snapshot button has a label").toBe(true)
      if (round === 1) {
        await ui.tap("Btn_Snapshot")
        await waitFor((s) => s.captures.length === 1 && s.cameraCardOpen, 6000, "snapshot")
        await sleep(500)
      }

      // Close: gone at once, still gone later, nothing partly visible.
      await ui.tap("Btn_CameraClose")
      await waitFor((s) => s.visibleCard === "step", 3000, "back on the step card")
      for (const ms of [30, 150, 500, 1200]) {
        await sleep(ms)
        expect(isEnabled("CameraCardCard"), "round " + round + " +" + ms + " ms: Camera card disabled").toBe(false)
        expect(shownParts("CameraCardCard").length, "round " + round + " +" + ms + " ms: nothing of the Camera card shows").toBe(0)
      }
      checkLibraryButton("round " + round + " after Close")
      checkMainButton("round " + round + " after Close")
      expect(libraryShown(), "round " + round + ": Camera Close leaves the Library visible").toBe(true)
    }

    // Library button toggles and keeps matching, including across another Camera round trip while hidden.
    await ui.tap("Btn_LibraryToggle")
    await waitFor((s) => s.libraryHidden === true, 2000, "library hidden")
    await sleep(700)
    checkLibraryButton("hidden")
    expect(libraryShown(), "Library really hidden").toBe(false)
    expect(shownParts("LibraryCardCard").length, "nothing of the Library shows").toBe(0)
    await ui.tap("Btn_LibraryToggle")
    await waitFor((s) => s.libraryHidden === false, 2000, "library shown")
    await sleep(700)
    checkLibraryButton("shown again")
    expect(libraryShown(), "Library really visible").toBe(true)
    expect(worstText("LibraryCardCard", ["LibraryTitle", "LibraryAppName"]), "Library text is pure white after toggling").toBe("")

    // Camera opened from the Library menu while the Library is hidden (the buttons still work) and closed again.
    await ui.tap("Btn_LibraryToggle")
    await waitFor((s) => s.libraryHidden === true, 2000, "library hidden again")
    await sleep(700)
    await ui.tap("Btn_Camera")
    await waitFor((s) => s.visibleCard === "camera", 3000, "camera card while the Library is hidden")
    await sleep(500)
    await ui.tap("Btn_CameraClose")
    await waitFor((s) => s.visibleCard === "step", 3000, "back on the step card")
    await sleep(700)
    checkLibraryButton("Camera round trip while the Library is hidden")
    expect(mwnpState().libraryHidden, "Camera Close did not show the Library").toBe(true)
    await ui.tap("Btn_LibraryToggle")
    await waitFor((s) => s.libraryHidden === false, 2000, "library shown")
    await sleep(700)
    checkLibraryButton("after pressing Show")

    // Main Hide / Show after every card swap.
    for (const lib of ["Btn_Lib_Report", "Btn_Lib_Options", "Btn_Lib_Camera", "Btn_Lib_Job"]) {
      await ui.tap(lib)
      await sleep(600)
      checkMainButton("after " + lib)
      checkLibraryButton("after " + lib)
      await ui.tap("Btn_DisplayToggle")
      await waitFor((s) => s.display.hidden === true, 2000, "display hidden after " + lib)
      await sleep(700)
      checkMainButton("hidden after " + lib)
      expect(isEnabled("StepCardCard") || isEnabled("CameraCardCard") || isEnabled("SummaryCardCard"), "cards are off while hidden").toBe(false)
      await ui.tap("Btn_DisplayToggle")
      await waitFor((s) => s.display.hidden === false, 2000, "display shown after " + lib)
      await sleep(700)
      checkMainButton("shown after " + lib)
    }
    ev("CAMERA CLOSE PASS", {})
  }
}
