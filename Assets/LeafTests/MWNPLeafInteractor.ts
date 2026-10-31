// MWNPLeafInteractor.ts — shared LEAF driver for the MWNP done-criteria scenarios.
// Drives the real UI (UIKit buttons, part tags, S1 toggle) through SIK Interactables and
// reads the app's test surface (global.mwnpAssistant.getState()). Test-only file.

import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"

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

export class MWNPLeafInteractor extends DefaultLeafInteractor {
  constructor() {
    super("MWNPLeafInteractor")
  }

  /** Pinch an enabled Interactable by SceneObject name (waits up to 3 s for it to appear). */
  async tap(name: string): Promise<void> {
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
