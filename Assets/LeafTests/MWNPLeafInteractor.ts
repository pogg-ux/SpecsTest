// MWNPLeafInteractor.ts — shared LEAF driver for the MWNP done-criteria scenarios.
// Drives the real UI (UIKit buttons, part tags, S1 toggle) through SIK Interactables and
// reads the app's test surface (global.mwnpAssistant.getState()). Test-only file.

import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {InteractionManager} from "SpectaclesInteractionKit.lspkg/Core/InteractionManager/InteractionManager"

export function mwnpState(): any {
  const a = (global as any).mwnpAssistant
  return a && a.getState ? a.getState() : {initialized: false}
}

export function ev(tag: string, data: any): void {
  print("[LEAF-MWNP] " + tag + " " + JSON.stringify(data))
}

export async function waitFor(pred: (s: any) => boolean, timeoutMs: number, what: string): Promise<any> {
  const t0 = getTime()
  let s = mwnpState()
  while (!pred(s)) {
    if ((getTime() - t0) * 1000 > timeoutMs) {
      throw new Error("Timed out waiting for " + what + "; state=" + JSON.stringify(s))
    }
    await sleep(100)
    s = mwnpState()
  }
  return s
}

const KEY_NAMES: {[c: string]: string} = {".": "Key_Dot"}

/**
 * Whether the visible card is the expected one. "jobcontrol" (the old Job control card, now part of the Job card) matches
 * the Job card in both of its forms: "job" (before a symptom is reported) and "jobhome" (mid-job).
 */
export function cardIs(visible: string, expected: string): boolean {
  if (expected === "jobcontrol") return visible === "job" || visible === "jobhome"
  return visible === expected
}

export class MWNPLeafInteractor extends DefaultLeafInteractor {
  constructor() {
    super("MWNPLeafInteractor")
  }

  /**
   * The step card collapses to a chip after an action and the number pad lives on its own "Log reading" card.
   * Before pinching a step-card button or a key, reopen the step card (chip) and the keypad (Log reading) as a user would.
   */
  private async ensureStepUi(name: string): Promise<void> {
    // The Job report's Save / Export buttons are on its last page now that buttons are larger and further apart.
    if ((name === "Btn_SaveJobLog" || name === "Btn_ExportReport") && !findInteractablesByName(name, undefined, true)[0]) {
      const next = findInteractablesByName("Btn_ReportNextPage", undefined, true)[0]
      if (next) {
        await this.trigger(next)
        await sleep(250)
      }
    }
    const isKey = name.indexOf("Key_") === 0
    if (!isKey && !/^(Btn_LogReading|Btn_Schematic|Btn_Camera|Btn_More|Btn_S1_)/.test(name)) return
    const chip = findInteractablesByName("Btn_StepChip", undefined, true)[0]
    if (chip) {
      await this.trigger(chip)
      await sleep(250)
    }
    if (isKey && !findInteractablesByName(name, undefined, true)[0]) {
      const log = findInteractablesByName("Btn_LogReading", undefined, true)[0]
      if (log) {
        await this.trigger(log)
        await sleep(250)
      }
    }
  }

  /**
   * Library buttons: the menu collapses to its chip while a card is open (one card at a time), so pinch the chip first.
   * The retired entries map to their new homes: Job control = the Job card (End job / New job are on it), and
   * Notes = Report > Notes & pictures > Add note.
   */
  private async libraryTap(name: string): Promise<boolean> {
    if (name.indexOf("Btn_Lib_") !== 0) return false
    const reopen = async () => {
      const chip = findInteractablesByName("Btn_LibraryChip", undefined, true)[0]
      if (chip) {
        await this.trigger(chip)
        await sleep(300)
      }
    }
    if (name === "Btn_Lib_Notes") {
      await reopen()
      await this.tap("Btn_Lib_Report")
      await sleep(400)
      await this.tap("Btn_TabNotes")
      await sleep(300)
      await this.tap("Btn_ReportAddNote")
      return true
    }
    if (!findInteractablesByName(name, undefined, true)[0]) await reopen()
    if (name === "Btn_Lib_Control") {
      // Job control is the Job card now: open it and stay on it (End job / New job are there).
      const job = findInteractablesByName("Btn_Lib_Job", undefined, true)[0]
      if (!job) throw new Error('Interactable "Btn_Lib_Job" not found or not enabled')
      await this.trigger(job)
      await sleep(350)
      return true
    }
    if (name === "Btn_Lib_Job") {
      // Mid-job the Job button opens the Job card with "Back to the step / finding / summary": older scenarios mean
      // "return to the flow card" by it, so press that too.
      const job = findInteractablesByName("Btn_Lib_Job", undefined, true)[0]
      if (!job) throw new Error('Interactable "Btn_Lib_Job" not found or not enabled')
      await this.trigger(job)
      await sleep(350)
      const back = findInteractablesByName("Btn_ResumeJob", undefined, true)[0]
      if (back) {
        await this.trigger(back)
        await sleep(250)
      }
      return true
    }
    return false
  }

  /** Pinch an enabled Interactable by SceneObject name (waits up to 3 s for it to appear). */
  async tap(name: string): Promise<void> {
    if (await this.libraryTap(name)) return
    // With no job in progress the Job card offers "Start new job" (no confirmation) where Job control had "New job".
    if (name === "Btn_NewJob" && !findInteractablesByName(name, undefined, true)[0] && findInteractablesByName("Btn_StartJob", undefined, true)[0]) name = "Btn_StartJob"
    await this.ensureStepUi(name)
    const t0 = getTime()
    let target = findInteractablesByName(name, undefined, true)[0]
    while (!target && (getTime() - t0) < 3) {
      await sleep(100)
      target = findInteractablesByName(name, undefined, true)[0]
    }
    if (!target) throw new Error('Interactable "' + name + '" not found or not enabled')
    await this.trigger(target)
    await sleep(250)
  }

  /** After a passing retest the job asks "Problem solved?": waits for it and taps "Yes, fixed" (the summary follows). */
  async confirmFixed(): Promise<void> {
    const t0 = getTime()
    while (!findInteractablesByName("Btn_FixedYes", undefined, true)[0] && (getTime() - t0) < 6) await sleep(100)
    await this.tap("Btn_FixedYes")
  }

  /** Types a value on the number pad and presses Enter. */
  async enterReading(value: string): Promise<void> {
    for (const c of value) await this.tap(KEY_NAMES[c] || "Key_" + c)
    await this.tap("Key_Enter")
    await sleep(200)
  }

  /** Safety notice -> Report symptom -> "EXTEND doesn't work". */
  async startExtendDiagnosis(): Promise<any> {
    await waitFor((s) => s.initialized === true && s.visibleCard === "safety", 10000, "app start (safety card)")
    await this.tap("Btn_DismissSafety")
    await waitFor((s) => s.visibleCard === "home", 3000, "library menu, no card open")
    await this.tap("Btn_Lib_Job")
    await waitFor((s) => s.visibleCard === "job", 3000, "job card")
    await this.tap("Btn_ReportSymptom")
    await waitFor((s) => s.visibleCard === "symptoms", 3000, "symptom list")
    await this.tap("Btn_Symptom_EXTEND")
    return await waitFor((s) => s.visibleCard === "step" && s.activePoint === "TS-4", 3000, "step card at TS-4")
  }

  /** Readings at TS-4 and F1:IN that are in spec (C2 path). */
  async logInSpecUpToF1Out(): Promise<any> {
    await this.enterReading("12.1")
    await waitFor((s) => s.activePoint === "F1:IN", 3000, "F1:IN active")
    await this.enterReading("12.0")
    return await waitFor((s) => s.activePoint === "F1:OUT", 3000, "F1:OUT active")
  }
}

/**
 * True when a mouse ray from the camera through the middle of the named control reaches that control first
 * (nothing else interactable is in front of it) — what a click in the Interactive Preview needs.
 */
export async function rayReaches(camPos: vec3, name: string): Promise<string> {
  const target = findInteractablesByName(name, undefined, true)[0]
  if (!target) return "not found or disabled"
  const to = target.sceneObject.getTransform().getWorldPosition()
  const far = to.add(to.sub(camPos).normalize().uniformScale(30))
  const hits: RayCastHit[] = await Promise.race([
    new Promise<RayCastHit[]>((res) => Physics.createGlobalProbe().rayCastAll(camPos, far, (h) => res(h))),
    sleep(1500).then(() => [] as RayCastHit[]),
  ])
  const ims = InteractionManager.getInstance()
  const named = hits
    .filter((h) => !!h.collider && !!ims.getInteractableByCollider(h.collider))
    .map((h) => ({n: ims.getInteractableByCollider(h.collider).sceneObject.name as string, d: h.distance}))
    .sort((a, b) => a.d - b.d)
  return named.length > 0 && named[0].n === name ? "" : "first hit is " + (named.length > 0 ? named[0].n : "nothing")
}
