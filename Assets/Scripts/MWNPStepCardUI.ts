// MWNPStepCardUI.ts — the step card: reasoning, current step, citation, result, readout, number pad.
//
// Owns: card layout and the number pad (0–9, ".", Del, Enter) plus the Schematic toggle.
// Text is sized in real centimetres (textEmCm, default 1.0 cm text height) whatever the card's scale,
// so it stays readable in a 1080p recording. Each text cell is sized to its words (fitText) and the
// card grows DOWNWARD from its host's origin: the host sits at the card's top-center.
// The number pad is unchanged (key size, layout).
// API: show(), hide(), setReasoning(), setPathCitation(), setStep(), setResult(), setReadout(),
//      readable text fields (stepTitleText, resultText, readoutText, resultColorWord),
//      events onKey(key: "0".."9" | "." | "back"), onEnter, onSchematic.
// Must not: parse readings, classify, or advance steps — Main/agent own that.
// Test handles: "Key_0".."Key_9", "Key_Dot", "Key_Back", "Key_Enter", "Btn_Schematic", "StepCardCard",
//               text cells "Reasoning", "PathCitation", "StepTitle", "StepQuestion", "StepCitation",
//               "Expected", "Result", "Readout".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {FlexDirection, FlexJustify, FlexAlign} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {addButton, addFlex, addText, COLOR, colorForWord, fitText, makeCardBody} from "./MWNPSharedUI"

/** Body text on the card: bright enough to read over the translucent plate in a screen recording. */
const BODY = new vec4(1, 1, 1, 0.92)
const SOFT = new vec4(1, 1, 1, 0.78)

@component
export class MWNPStepCardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Step Card – guided check step with number pad</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(26, 40, 0.5))
  @hint("Card width in card units (cm before scaling)")
  widthCm: number = 32
  @input
  @widget(new SliderWidget(2.4, 4.5, 0.1))
  @hint("Number pad key width in card units (unchanged: about 3 cm before scaling)")
  keyWidthCm: number = 3.2
  @input
  @widget(new SliderWidget(0.6, 2.0, 0.05))
  @hint("Card text size: em height in real cm (1.0 reads in a 1080p recording)")
  textEmCm: number = 1.0
  @input
  @widget(new SliderWidget(0.6, 2.4, 0.05))
  @hint("Readout text size: em height in real cm")
  readoutEmCm: number = 1.2
  @input
  @hint("Readout prefix")
  readoutPrefix: string = "Reading:"
  @input
  @hint("Schematic toggle label")
  schematicLabel: string = "Schematic"
  @ui.group_end

  // Readable state for tests
  stepTitleText: string = ""
  resultText: string = ""
  resultColorWord: string = ""
  readoutText: string = ""
  /** Text height in card units (cm before scaling) actually used; times the card's world scale = real cm. */
  textEmLocal: number = 0
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }

  private body: SceneObject | null = null
  private inner = 0
  private tReasoning: Text | null = null
  private tPathCite: Text | null = null
  private tTitle: Text | null = null
  private tQuestion: Text | null = null
  private tCite: Text | null = null
  private tExpected: Text | null = null
  private tResult: Text | null = null
  private tReadout: Text | null = null

  private _onKey = new Event<string>()
  private _onEnter = new Event<void>()
  private _onSchematic = new Event<void>()
  get onKey(): PublicApi<string> {
    return this._onKey.publicApi()
  }
  get onEnter(): PublicApi<void> {
    return this._onEnter.publicApi()
  }
  get onSchematic(): PublicApi<void> {
    return this._onSchematic.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  show(): void {
    if (!this.body) this.build()
    ;(this.body as SceneObject).enabled = true
  }

  hide(): void {
    if (this.body) this.body.enabled = false
  }

  setReasoning(text: string): void {
    if (this.tReasoning) fitText(this.tReasoning, text, this.inner, this.textEmLocal)
  }

  setPathCitation(text: string): void {
    if (this.tPathCite) fitText(this.tPathCite, text, this.inner, this.textEmLocal)
  }

  setStep(title: string, question: string, citation: string, expected: string): void {
    this.stepTitleText = title
    const em = this.textEmLocal
    if (this.tTitle) fitText(this.tTitle, title, this.inner, em, 1, true)
    if (this.tQuestion) fitText(this.tQuestion, question, this.inner, em)
    if (this.tCite) fitText(this.tCite, citation, this.inner, em)
    if (this.tExpected) fitText(this.tExpected, expected, this.inner, em)
  }

  setResult(text: string, colorWord: string): void {
    this.resultText = text
    this.resultColorWord = colorWord
    if (this.tResult) {
      fitText(this.tResult, text, this.inner, this.textEmLocal)
      this.tResult.textFill.color = colorForWord(colorWord)
    }
    // The step title itself turns amber/red while that step stays active (not advanced).
    if (this.tTitle) this.tTitle.textFill.color = colorWord === "amber" || colorWord === "red" ? colorForWord(colorWord) : COLOR.white
  }

  setReadout(text: string): void {
    this.readoutText = this.readoutPrefix + " " + text
    if (this.tReadout) this.tReadout.text = this.readoutText
  }

  private build(): void {
    const w = this.widthCm
    const inner = w - 2.8
    this.inner = inner
    // Real-cm text size → card units, so the text stays the same physical size if the card is rescaled.
    const scale = Math.max(0.05, this.sceneObject.getTransform().getWorldScale().y)
    const em = this.textEmCm / scale
    this.textEmLocal = em
    const card = makeCardBody(this.sceneObject, "StepCardCard", w, 1.4, 0.5, "top")
    this.body = card.body
    const c = card.content
    const cell = (name: string, color: vec4): Text => addText(c, name, "", inner, 0.01, {emCm: em, color, wrap: true, valign: "top"})
    this.tReasoning = cell("Reasoning", SOFT)
    this.tPathCite = cell("PathCitation", COLOR.amber)
    this.tTitle = cell("StepTitle", COLOR.white)
    this.tQuestion = cell("StepQuestion", BODY)
    this.tCite = cell("StepCitation", SOFT)
    this.tExpected = cell("Expected", COLOR.cyan)
    this.tResult = cell("Result", BODY)
    for (const t of [this.tReasoning, this.tPathCite, this.tTitle, this.tQuestion, this.tCite, this.tExpected, this.tResult]) {
      fitText(t, "", inner, em, 0)
    }
    ;(this.tTitle as Text & {weight?: number}).weight = 700

    // Bottom row: number pad (left) + readout / Enter / Schematic (right). Number pad unchanged.
    const kw = this.keyWidthCm
    const kh = 2.2
    const kg = 0.35
    const padW = kw * 3 + kg * 2
    const padH = kh * 4 + kg * 3
    const row = addFlex(c, "PadRow", FlexDirection.Row, inner, padH, 1.0, {align: FlexAlign.Center})
    const pad = addFlex(row, "NumPad", FlexDirection.Column, padW, padH, kg)
    const keys = [
      ["7", "8", "9"],
      ["4", "5", "6"],
      ["1", "2", "3"],
      [".", "0", "back"],
    ]
    keys.forEach((rowKeys, r) => {
      const kr = addFlex(pad, "KeyRow" + r, FlexDirection.Row, padW, kh, kg)
      for (const k of rowKeys) {
        const name = k === "." ? "Key_Dot" : k === "back" ? "Key_Back" : "Key_" + k
        const label = k === "back" ? "Del" : k
        addButton(kr, name, label, kw, kh, () => this._onKey.invoke(k), {role: "Subheadline"})
      }
    })
    const sideW = inner - padW - 1.0
    const side = addFlex(row, "PadSide", FlexDirection.Column, sideW, padH, 0.8, {justify: FlexJustify.Center})
    const rem = this.readoutEmCm / scale
    this.tReadout = addText(side, "Readout", this.readoutPrefix + " — V", sideW, rem * 1.4, {emCm: rem, align: "center"})
    addButton(side, "Key_Enter", "Enter", sideW - 1, 3.0, () => this._onEnter.invoke(), {emCm: em})
    addButton(side, "Btn_Schematic", this.schematicLabel, sideW - 1, 2.6, () => this._onSchematic.invoke(), {emCm: em})
  }
}
