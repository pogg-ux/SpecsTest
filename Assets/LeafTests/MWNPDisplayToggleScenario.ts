// Hide / Show display: the small always-visible button at the cabinet's top-right edge fades out every card, tag,
// badge and trace, and brings them back in exactly the same state. Runs on the richest state (the Finding card,
// with badges, outlines, traces, tags and the expected-value tag all live).
//
// Not covered (device only, guarded in MWNPMain.setupDeviceExtras): the fist-grab toggle. It calls the same
// setDisplayHidden() the button does.

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {InteractionManager} from "SpectaclesInteractionKit.lspkg/Core/InteractionManager/InteractionManager"
import {MWNPLeafInteractor, ev, mwnpState, waitFor} from "./MWNPLeafInteractor"

function findCamera(): Camera {
  let found: Camera | null = null
  const scan = (o: SceneObject) => {
    if (found) return
    const c = o.getComponent("Component.Camera") as Camera
    if (c && o.isEnabledInHierarchy) found = c
    for (let i = 0; i < o.getChildrenCount(); i++) scan(o.getChild(i))
  }
  for (let i = 0; i < global.scene.getRootObjectsCount(); i++) scan(global.scene.getRootObject(i))
  return found as unknown as Camera
}

/** The parts of the app state the display must give back unchanged. */
function snapshot(): string {
  const s = mwnpState()
  return JSON.stringify({
    phase: s.phase,
    visibleCard: s.visibleCard,
    activePoint: s.activePoint,
    stepTitle: s.stepTitle,
    outlines: s.outlines,
    traces: s.traces,
    badges: s.badges,
    expectedTag: s.expectedTag,
    readings: s.readings.length,
    findingCard: s.findingCard,
    s1: s.s1,
    lamps: s.lamps,
    schematicOpen: s.schematicOpen,
  })
}

function textOf(name: string): Text {
  return findSceneObjectByName(name).getComponent("Component.Text") as Text
}

/** The Text of a button's "Label" child. */
function labelText(buttonName: string): Text {
  const so = findSceneObjectByName(buttonName)
  for (let i = 0; i < so.getChildrenCount(); i++) {
    if (so.getChild(i).name === "Label") return so.getChild(i).getComponent("Component.Text") as Text
  }
  throw new Error(buttonName + " has no Label child")
}

@component
export class MWNPDisplayToggleScenario extends Scenario {
  async run(): Promise<void> {
    const ui = new MWNPLeafInteractor()
    const app = (global as any).mwnpAssistant
    await ui.startExtendDiagnosis()
    // This scenario checks the fade of everything; the Options default (Cards only + labels Always on) is tested in mwnp-library-options.
    app.optionsCard.set("hideButton", 1)
    await ui.logInSpecUpToF1Out()
    await ui.enterReading("0.0")
    await waitFor((s) => s.visibleCard === "finding", 3000, "finding card")
    await sleep(700)

    // The button: present, labeled, reachable by a mouse ray, near the cabinet's top-right corner, clear of the cards.
    const btn = findSceneObjectByName("Btn_DisplayToggle")
    expect(!!btn && btn.isEnabledInHierarchy, "Btn_DisplayToggle exists and is enabled").toBe(true)
    const label = (): string => labelText("Btn_DisplayToggle").text
    expect(label(), "button says Hide while the display is shown").toBe("Hide")
    const cam = findCamera()
    const from = cam.getSceneObject().getTransform().getWorldPosition()
    const to = btn.getTransform().getWorldPosition()
    const hits: RayCastHit[] = await Promise.race([
      new Promise<RayCastHit[]>((res) => Physics.createGlobalProbe().rayCastAll(from, to.add(to.sub(from).normalize().uniformScale(30)), (h) => res(h))),
      sleep(1500).then(() => [] as RayCastHit[]),
    ])
    const hitNames = hits.map((h) => (h.collider ? InteractionManager.getInstance().getInteractableByCollider(h.collider)?.sceneObject.name : "")).filter((n) => !!n)
    ev("display button targeting", {hits: hitNames})
    expect(hitNames.indexOf("Btn_DisplayToggle") >= 0, "mouse ray reaches the button: " + hitNames.join(",")).toBe(true)

    const trainer = findSceneObjectByName("MWNPTrainer")
    const half = (trainer.getComponent("Component.ScriptComponent") as any).getBoardHalfSize() as vec2
    const corner = cam.worldSpaceToScreenSpace(trainer.getTransform().getWorldTransform().multiplyPoint(new vec3(half.x, half.y, 0)))
    const b = cam.worldSpaceToScreenSpace(to)
    ev("display button position", {button: [+b.x.toFixed(3), +b.y.toFixed(3)], cabinetTopRight: [+corner.x.toFixed(3), +corner.y.toFixed(3)]})
    expect(Math.abs(b.x - corner.x) < 0.1 && Math.abs(b.y - corner.y) < 0.1, "button is at the cabinet's top-right edge").toBe(true)
    expect(b.x > 0.02 && b.x < 0.98 && b.y > 0.02 && b.y < 0.98, "button is inside the view").toBe(true)
    const card = findSceneObjectByName("FindingCardCard")
    const csz: vec2 = (card.getComponent("Component.ScriptComponent") as any).size
    const m = card.getTransform().getWorldTransform()
    let top = 9
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) top = Math.min(top, cam.worldSpaceToScreenSpace(m.multiplyPoint(new vec3((dx * csz.x) / 2, (dy * csz.y) / 2, 0))).y)
    expect(b.y < top, "button sits above the card, not on it (button y " + b.y.toFixed(3) + ", card top " + top.toFixed(3) + ")").toBe(true)

    // Colors the display must give back after the fade.
    const titleColor = textOf("FindingTitle").textFill.color
    const tagColor = labelText("Tag_TS-3").textFill.color
    const before = snapshot()
    expect(app.cabinet.overlayOpacity, "overlays fully visible at start").toBe(1)

    // ── The fade is a fade, not a pop (measured through setDisplayHidden, which the button, the voice commands and
    //    the grab gesture all call; the tap helper sleeps 250 ms, too long to see a 0.35 s fade) ──
    app.setDisplayHidden(true)
    const samples: number[] = []
    const t0 = getTime()
    while (getTime() - t0 < 1.5) {
      const d = mwnpState().display
      samples.push(+d.alpha.toFixed(2))
      if (d.hidden && !d.fading && d.alpha === 0) break
      await sleep(15)
    }
    ev("fade out alpha samples", samples)
    expect(samples.filter((a) => a > 0.02 && a < 0.98).length >= 3, "it fades through intermediate values, not a pop: " + samples.join(",")).toBe(true)
    app.setDisplayHidden(false)
    const inSamples: number[] = []
    const t1 = getTime()
    while (getTime() - t1 < 1.5) {
      const d = mwnpState().display
      inSamples.push(+d.alpha.toFixed(2))
      if (!d.hidden && !d.fading && d.alpha === 1) break
      await sleep(15)
    }
    ev("fade in alpha samples", inSamples)
    expect(inSamples.filter((a) => a > 0.02 && a < 0.98).length >= 3, "it fades back in: " + inSamples.join(",")).toBe(true)
    expect(snapshot(), "a fade round trip leaves the state unchanged").toBe(before)

    // ── The button: hide ──
    await ui.tap("Btn_DisplayToggle")
    let s = await waitFor((x) => x.display.hidden && !x.display.fading && x.display.alpha === 0, 3000, "fully hidden")
    expect(s.display.hidden && s.display.alpha === 0, "fully hidden").toBe(true)
    expect(label(), "button says Show while hidden").toBe("Show")
    expect(findSceneObjectByName("Btn_DisplayToggle").isEnabledInHierarchy, "the button stays visible and usable").toBe(true)
    for (const name of ["Btn_Retest", "FindingTitle", "Tag_TS-3", "Badge_TS-4"]) {
      const so = findSceneObjectByName(name)
      expect(!so || !so.isEnabledInHierarchy, name + " is hidden").toBe(true)
    }
    expect(app.cabinet.overlayOpacity, "traces / outlines / probes are faded out").toBe(0)
    expect(snapshot(), "hiding changes no app state").toBe(before)

    // ── The button: show again, same state and same colors ──
    await ui.tap("Btn_DisplayToggle")
    s = await waitFor((x) => !x.display.hidden && !x.display.fading && x.display.alpha === 1, 3000, "fully shown")
    expect(!s.display.hidden && s.display.alpha === 1, "fully shown").toBe(true)
    expect(label(), "button says Hide again").toBe("Hide")
    expect(snapshot(), "the display comes back in exactly the same state").toBe(before)
    expect(app.cabinet.overlayOpacity, "overlays fully visible again").toBe(1)
    for (const name of ["Btn_Retest", "FindingTitle", "Tag_TS-3", "Badge_TS-4"]) {
      const so = findSceneObjectByName(name)
      expect(!!so && so.isEnabledInHierarchy, name + " is back").toBe(true)
    }
    const tc = textOf("FindingTitle").textFill.color
    expect(Math.abs(tc.x - titleColor.x) + Math.abs(tc.y - titleColor.y) + Math.abs(tc.z - titleColor.z) + Math.abs(tc.w - titleColor.w) < 0.02, "FindingTitle color restored: " + tc).toBe(true)
    const gc = labelText("Tag_TS-3").textFill.color
    expect(Math.abs(gc.w - tagColor.w) < 0.02, "dim tag alpha restored (" + gc.w.toFixed(2) + " vs " + tagColor.w.toFixed(2) + ")").toBe(true)

    // The controls still work after the round trip.
    await ui.tap("Btn_Retest")
    await waitFor((x) => x.phase === "retest_wait", 3000, "retest still works after hide/show")
    ev("DISPLAY TOGGLE PASS", {})
  }
}
