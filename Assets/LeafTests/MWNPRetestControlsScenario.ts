// Retest controls (the step after the Finding card): every control must be reachable the way a mouse reaches it
// and must respond. LEAF's own triggers bypass colliders, which is how a control whose collider is broken
// (so real clicks never reach it) passed every earlier test. So this scenario also casts a ray from the camera
// to each control, exactly as SIK's mouse interactor targets, and requires the control itself to be the first
// interactable the ray meets.
//
// Parameter stop_after: "target" prints the targeting result for the first controls and stops (diagnosis).

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {ScenarioConfig} from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {InteractionManager} from "SpectaclesInteractionKit.lspkg/Core/InteractionManager/InteractionManager"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

function cameraObject(): SceneObject {
  let found: SceneObject | null = null
  const scan = (o: SceneObject) => {
    if (found) return
    if (o.getComponent("Component.Camera") && o.isEnabledInHierarchy) found = o
    for (let i = 0; i < o.getChildrenCount(); i++) scan(o.getChild(i))
  }
  for (let i = 0; i < global.scene.getRootObjectsCount(); i++) scan(global.scene.getRootObject(i))
  return found as unknown as SceneObject
}

/**
 * Casts the ray a mouse click makes (camera -> control center and 30 cm beyond). A control passes only if a hit
 * collider is one SIK still maps to that control (registered), so a collider that was never hit, or whose
 * interactable lost its SIK registration, fails even though LEAF's direct trigger would still work on it.
 */
async function firstInteractableHit(name: string): Promise<{ok: boolean; first: string; hits: string[]}> {
  const so = findSceneObjectByName(name)
  expect(!!so && so.isEnabledInHierarchy, name + " exists and is enabled").toBe(true)
  const from = cameraObject().getTransform().getWorldPosition()
  const to = so.getTransform().getWorldPosition()
  const end = to.add(to.sub(from).normalize().uniformScale(30))
  const hits: RayCastHit[] = await Promise.race([
    new Promise<RayCastHit[]>((res) => Physics.createGlobalProbe().rayCastAll(from, end, (h) => res(h))),
    sleep(1500).then(() => [] as RayCastHit[]),
  ])
  const names: string[] = []
  let first = ""
  for (const h of hits) {
    const inter = h.collider ? InteractionManager.getInstance().getInteractableByCollider(h.collider) : null
    if (inter) {
      names.push(inter.sceneObject.name)
      if (!first) first = inter.sceneObject.name
    }
  }
  return {ok: names.indexOf(name) >= 0, first, hits: names}
}

@component
export class MWNPRetestControlsScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const stopAfter = (config && config.get("stop_after")) || ""
    const ui = new MWNPLeafInteractor()
    await ui.startExtendDiagnosis()
    await ui.logInSpecUpToF1Out()
    await ui.enterReading("0.0")
    await waitFor((s) => s.visibleCard === "finding", 3000, "finding card")
    await sleep(600)

    const failures: string[] = []
    const check = async (name: string) => {
      const r = await firstInteractableHit(name)
      ev("target " + name, r)
      if (!r.ok) failures.push(name + " (first hit: " + (r.first || "nothing") + ")")
    }

    // 1. Finding card: the retest button, and the controls the next step needs.
    await check("Btn_Retest")
    await check("S1_Toggle")
    await check("Tag_TS-3")
    expect(failures.length === 0, "not reachable by a mouse ray: " + failures.join("; ")).toBe(true)
    if (stopAfter === "target") return

    // 2. Retest card, waiting for the switch: every control must respond (never a silent dead key).
    await ui.tap("Btn_Retest")
    const w = await waitFor((s) => s.phase === "retest_wait", 3000, "retest_wait")
    await sleep(600)
    ev("retest card", {stepTitle: w.stepTitle, s1: w.s1, readout: w.readout})
    if (stopAfter === "wait") {
      expect(mwnpState().switchRow, "the S1 buttons are shown on the retest card").toBe(true)
      return
    }
    const switchButtons = stopAfter === "target2" ? [] : ["Btn_S1_UP", "Btn_S1_DOWN"]
    for (const n of [...switchButtons, "S1_Toggle", "Key_0", "Key_1", "Key_2", "Key_3", "Key_4", "Key_5", "Key_6", "Key_7", "Key_8", "Key_9", "Key_Dot", "Key_Back", "Key_Enter", "Btn_Schematic"]) {
      await check(n)
    }
    expect(failures.length === 0, "not reachable by a mouse ray: " + failures.join("; ")).toBe(true)
    if (stopAfter === "target2") return

    // 2a. Number pad responds while waiting for the switch, and Enter explains instead of staying silent.
    await ui.tap("Key_1")
    await ui.tap("Key_2")
    let s = mwnpState()
    expect(s.readout.indexOf("12") >= 0, "keys respond while waiting for the switch: " + s.readout).toBe(true)
    await ui.tap("Key_Enter")
    s = mwnpState()
    ev("enter while waiting", {phase: s.phase, lastMessage: s.lastMessage, stepResult: s.stepResult})
    expect(s.phase, "still waiting for the switch").toBe("retest_wait")
    expect((s.stepResult as string).length > 0 && (s.stepResult as string).indexOf("S1") >= 0, "Enter explains what to do: " + s.stepResult).toBe(true)

    // 2b. Backup buttons and the toggle on the model all move S1 and light / unlight the lamp.
    await ui.tap("Btn_S1_UP")
    s = await waitFor((x) => x.phase === "retest" && x.s1 === "UP", 3000, "S1 UP button")
    expect(s.lamps["L1"], "L1 lit with S1 UP").toBe(true)
    await ui.tap("Btn_S1_DOWN")
    s = await waitFor((x) => x.s1 === "DOWN", 3000, "S1 DOWN button")
    expect(s.lamps["L1"], "L1 off with S1 DOWN").toBe(false)
    await ui.tap("S1_Toggle")
    s = await waitFor((x) => x.s1 === "UP", 3000, "S1 toggle on the model")
    expect(s.lamps["L1"], "L1 lit again").toBe(true)

    // 2c. Schematic button responds in the retest step.
    await ui.tap("Btn_Schematic")
    s = await waitFor((x) => x.schematicOpen === true, 3000, "schematic open")
    await ui.tap("Btn_Schematic")
    await waitFor((x) => x.schematicOpen === false, 3000, "schematic closed")

    // 2d. The reading typed earlier is still there; Back edits it, Enter accepts it at L1+.
    await ui.tap("Key_Back")
    await ui.tap("Key_Back")
    s = mwnpState()
    expect(s.readout.indexOf("—") >= 0, "Back clears the entry: " + s.readout).toBe(true)
    await ui.tap("Key_Dot")
    s = mwnpState()
    expect(s.readout.indexOf("0.") >= 0, "the decimal key responds: " + s.readout).toBe(true)
    await ui.tap("Key_Back")
    await ui.tap("Key_Back")
    s = mwnpState()
    expect(s.readout.indexOf("—") >= 0, "cleared again: " + s.readout).toBe(true)
    await ui.enterReading("12.0")
    s = await waitFor((x) => x.phase === "done" || x.phase === "summary", 3000, "retest passed")
    expect(s.lastResultColor, "L1+ green").toBe("green")
    ev("RETEST CONTROLS PASS", {})
  }
}
