// MWNPOptionsCardUI.ts — the Options card: five cycling toggles that apply immediately (session only).
//
// Owns: the card and one button per option; each button says its current value ("Text size: Large") and
// cycles to the next value when pressed. Holds the values for the session; Main applies them.
// API: show(), hide(), values (readable), set(key, index), events onChange({key, index, value}).
// Options (first value is the default): labels [On request, Always on], hideButton [Cards only, Everything],
//   cardStyle [Translucent, Opaque] (starts on Opaque), textSize [Normal, Large, Extra large], schematic [Normal, Enlarged],
//   answerText [Off, On] ("Show Sparky's answers as text": Off = Sparky only speaks an Ask answer, On = the answer card opens too).
// Test handles: "Opt_Labels", "Opt_HideButton", "Opt_CardStyle", "Opt_TextSize", "Opt_Schematic", "Opt_AnswerText", card "OptionsCardCard".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {addButton, addCardHeader, ButtonHandle, cardEm, deferDestroy, makeCardBody} from "./MWNPSharedUI"

export interface OptionDef {
  key: string
  title: string
  values: string[]
}

export const OPTION_DEFS: OptionDef[] = [
  {key: "labels", title: "Labels", values: ["On request", "Always on"]},
  {key: "hideButton", title: "Hide button", values: ["Cards only", "Everything"]},
  {key: "cardStyle", title: "Card style", values: ["Translucent", "Opaque"]},
  {key: "textSize", title: "Text size", values: ["Normal", "Large", "Extra large"]},
  {key: "schematic", title: "Schematic", values: ["Normal", "Enlarged"]},
  {key: "answerText", title: "Show Sparky's answers as text", values: ["Off", "On"]},
]

export interface OptionChange {
  key: string
  index: number
  value: string
}

@component
export class MWNPOptionsCardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Options Card – labels, hide button, card style, text size, schematic</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(26, 40, 0.5))
  @hint("Card width in card units (cm before scaling)")
  widthCm: number = 32
  @input
  @widget(new SliderWidget(0.6, 2.0, 0.05))
  @hint("Card text size: em height in real cm")
  textEmCm: number = 1.0
  @input
  @widget(new SliderWidget(1.0, 3.0, 0.05))
  @hint("Title text size: em height in real cm")
  titleEmCm: number = 1.4
  @ui.group_end

  /** Current value index per option key. */
  indexes: {[key: string]: number} = {labels: 0, hideButton: 0, cardStyle: 1, textSize: 0, schematic: 0, answerText: 0}
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }

  private body: SceneObject | null = null
  private buttons: {[key: string]: ButtonHandle} = {}
  private _onChange = new Event<OptionChange>()
  get onChange(): PublicApi<OptionChange> {
    return this._onChange.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  value(key: string): string {
    const d = OPTION_DEFS.filter((o) => o.key === key)[0]
    return d.values[this.indexes[key]]
  }

  /** Sets an option (as if toggled) and tells Main. */
  set(key: string, index: number): void {
    this.indexes[key] = index
    this.refreshLabel(key)
    this._onChange.invoke({key, index, value: this.value(key)})
  }

  show(): void {
    if (!this.body) this.build()
    ;(this.body as SceneObject).enabled = true
  }

  hide(): void {
    if (this.body) this.body.enabled = false
  }

  get built(): boolean {
    return !!this.body
  }

  /** Rebuilds at the current Text size factor, keeping the chosen values and visibility. */
  rebuild(): void {
    if (!this.body) return
    const vis = this.body.enabled
    deferDestroy(this, this.body)
    this.body = null
    this.buttons = {}
    this.build()
    ;(this.body as SceneObject | null)!.enabled = vis
  }

  private label(key: string): string {
    const d = OPTION_DEFS.filter((o) => o.key === key)[0]
    return d.title + ": " + this.value(key)
  }

  private refreshLabel(key: string): void {
    const b = this.buttons[key]
    if (b) b.label.text = this.label(key)
  }

  private build(): void {
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const card = makeCardBody(this.sceneObject, "OptionsCardCard", w, 1.4, 0.8, "top")
    this.body = card.body
    const c = card.content
    addCardHeader(c, "OptionsTitle", "Options", inner, this.sceneObject)
    for (const d of OPTION_DEFS) {
      const name = "Opt_" + d.key.charAt(0).toUpperCase() + d.key.slice(1)
      this.buttons[d.key] = addButton(
        c,
        name,
        this.label(d.key),
        inner - 2,
        3.6,
        () => this.set(d.key, (this.indexes[d.key] + 1) % d.values.length),
        {emCm: em, bold: true}
      )
    }
  }
}
