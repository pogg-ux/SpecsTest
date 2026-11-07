// MWNPLibraryCardUI.ts — the Library: a compact, persistent menu docked at the upper left of the view.
//
// Owns: one column of buttons (Job, Job control, Job report, Camera, Notes, Options). Its Hide / Show button is a separate button floating
// outside the card's top-right corner (built by Main, like the Job side's), and the menu lives outside the UI root, so the
// main Hide never fades it.
// Text is >= 1.0 cm; the card grows downward from its host's top-center (the host sits at the menu's top edge).
// Holds no job state: Main decides what each destination shows.
// API: show(), hide(), built, menuWidth, event onPick(key: "job"|"control"|"report"|"camera"|"notes"|"options").
// Test handles: "Btn_Lib_Job", "Btn_Lib_Control", "Btn_Lib_Report", "Btn_Lib_Camera", "Btn_Lib_Options", card "LibraryCardCard".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {addButton, addCardHeader, addFitText, cardEm, makeCardBody, TEXT_SOFT} from "./MWNPSharedUI"

const iconJob = requireAsset("../Icons/build.png") as Texture
const iconControl = requireAsset("../Icons/tune.png") as Texture
const iconReport = requireAsset("../Icons/assignment.png") as Texture
const iconCamera = requireAsset("../Icons/photo_camera.png") as Texture
const iconNotes = requireAsset("../Icons/edit_note.png") as Texture
const iconOptions = requireAsset("../Icons/settings.png") as Texture

@component
export class MWNPLibraryCardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Library – docked menu: Job, Job report, Camera, Options</span>')
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
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }
  get built(): boolean {
    return !!this.body
  }

  private body: SceneObject | null = null

  /** Menu width in card units. */
  get menuWidth(): number {
    return this.widthCm
  }

  private _onPick = new Event<string>()
  get onPick(): PublicApi<string> {
    return this._onPick.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  show(): void {
    if (!this.body) this.build()
    this.shownCount++
    ;(this.body as SceneObject).enabled = true
  }

  hide(): void {
    if (this.body) this.body.enabled = false
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
      ["control", "Job control", iconControl],
      ["report", "Job report", iconReport],
      ["camera", "Camera", iconCamera],
      ["notes", "Notes", iconNotes],
      ["options", "Options", iconOptions],
    ]
    for (const [key, label, icon] of items) {
      addButton(c, "Btn_Lib_" + key.charAt(0).toUpperCase() + key.slice(1), label, inner, 3.0, () => this._onPick.invoke(key), {emCm: em, bold: true, icon})
    }
  }
}
