// MWNPLibraryCardUI.ts — the Library: a compact menu docked in the column to the left of the cabinet.
//
// Owns: one column of four buttons (Job, Report, Camera, Options), and its chip. When a card opens from the Library the
// menu collapses to a small "Library" chip (one card at a time); pinching the chip brings the menu back (Main closes the
// open card first). Its Hide / Show button is a separate button attached to the card header's top-right corner (built by
// Main), and the menu lives outside the UI root, so the main Hide never fades it.
// Text is >= 1.0 cm; the card grows downward from its host's top-center (the host sits at the menu's top edge).
// Holds no job state: Main decides what each destination shows.
// API: show(), hide(), collapse(), expand(), isCollapsed, built, menuWidth, chipHeight, events onPick(key: "job"|"report"|"camera"|"options"), onChip.
// Test handles: "Btn_Lib_Job", "Btn_Lib_Report", "Btn_Lib_Camera", "Btn_Lib_Options", "Btn_LibraryChip", card "LibraryCardCard".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {addButton, addCardHeader, addFitText, ButtonHandle, cardEm, deferDestroy, LINE_H, makeCardBody, MIN_TARGET_CM, realToLocal, TEXT_SOFT} from "./MWNPSharedUI"

const iconJob = requireAsset("../Icons/build.png") as Texture
const iconReport = requireAsset("../Icons/assignment.png") as Texture
const iconCamera = requireAsset("../Icons/photo_camera.png") as Texture
const iconOptions = requireAsset("../Icons/settings.png") as Texture

@component
export class MWNPLibraryCardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Library – docked menu: Job, Report, Camera, Options</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(10, 24, 0.5))
  @hint("Menu width in card units (cm before scaling)")
  widthCm: number = 17
  @input
  @widget(new SliderWidget(0.6, 2.0, 0.05))
  @hint("Menu text size: em height in real cm (at least 1.0)")
  textEmCm: number = 1.0
  @ui.group_end

  /** Test aid: number of times the menu has been shown. */
  shownCount: number = 0
  private collapsed = false
  private chip: ButtonHandle | null = null
  get isVisible(): boolean {
    return (!!this.body && this.body.enabled) || (!!this.chip && this.chip.so.enabled)
  }
  /** The menu itself (not just its chip) is showing. */
  get isMenuVisible(): boolean {
    return !!this.body && this.body.enabled
  }
  get isCollapsed(): boolean {
    return this.collapsed && this.isVisible
  }
  get built(): boolean {
    return !!this.body
  }

  private body: SceneObject | null = null

  /** Menu width in card units. */
  get menuWidth(): number {
    return this.widthCm
  }

  /** Height of the chip in card units (the row the open card sits below). */
  get chipHeight(): number {
    const em = cardEm(this.sceneObject, this.textEmCm)
    return Math.max(em * LINE_H + 1.6, realToLocal(this.sceneObject, MIN_TARGET_CM))
  }

  private _onPick = new Event<string>()
  get onPick(): PublicApi<string> {
    return this._onPick.publicApi()
  }
  private _onChip = new Event<void>()
  get onChip(): PublicApi<void> {
    return this._onChip.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  show(): void {
    if (!this.body) this.build()
    this.shownCount++
    this.collapsed = false
    this.applyMode()
  }

  hide(): void {
    if (this.body) this.body.enabled = false
    if (this.chip) this.chip.so.enabled = false
  }

  /** Menu -> chip (a card opened). No-op until the menu has been shown. */
  collapse(): void {
    if (!this.body || this.collapsed) return
    this.collapsed = true
    this.applyMode()
  }

  /** Chip -> menu (no card is open, or the chip was pinched). */
  expand(): void {
    if (!this.body || !this.collapsed) return
    this.collapsed = false
    this.applyMode()
  }

  private applyMode(): void {
    if (this.collapsed && !this.chip) this.buildChip()
    if (this.body) this.body.enabled = !this.collapsed
    if (this.chip) this.chip.so.enabled = this.collapsed
  }

  private buildChip(): void {
    const em = cardEm(this.sceneObject, this.textEmCm)
    const h = this.chipHeight
    this.chip = addButton(this.sceneObject, "Btn_LibraryChip", "Library", Math.max(12, realToLocal(this.sceneObject, 7.5)), h, () => this._onChip.invoke(), {
      emCm: em,
      bold: true,
      primary: true,
      inFlex: false,
      icon: iconJob,
    })
    this.chip.so.getTransform().setLocalPosition(new vec3(0, -h / 2, 0.6))
  }

  private build(): void {
    const w = this.menuWidth
    const pad = 1.4
    const inner = w - pad * 2
    const em = cardEm(this.sceneObject, this.textEmCm)
    const card = makeCardBody(this.sceneObject, "LibraryCardCard", w, pad, 0.5, "top")
    this.body = card.body
    const c = card.content
    addCardHeader(c, "LibraryTitle", "Library", inner, this.sceneObject)
    addFitText(c, "LibraryAppName", "FaultLens", inner, em, {color: TEXT_SOFT})
    const items: [string, string, Texture][] = [
      ["job", "Job", iconJob],
      ["report", "Report", iconReport],
      ["camera", "Camera", iconCamera],
      ["options", "Options", iconOptions],
    ]
    for (const [key, label, icon] of items) {
      addButton(c, "Btn_Lib_" + key.charAt(0).toUpperCase() + key.slice(1), label, inner, 3.0, () => this._onPick.invoke(key), {emCm: em, bold: true, icon})
    }
  }
}
