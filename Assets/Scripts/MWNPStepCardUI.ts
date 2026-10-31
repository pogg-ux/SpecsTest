// MWNPStepCardUI.ts — the step card: reasoning, current step, citation, result, readout, number pad.
//
// Owns: card layout and the number pad (0–9, ".", Del, Enter) plus the Schematic toggle.
// API: show(), hide(), setReasoning(), setPathCitation(), setStep(), setResult(), setReadout(),
//      readable text fields (stepTitleText, resultText, readoutText, resultColorWord),
//      events onKey(key: "0".."9" | "." | "back"), onEnter, onSchematic.
// Must not: parse readings, classify, or advance steps — Main/agent own that.
// Test handles: "Key_0".."Key_9", "Key_Dot", "Key_Back", "Key_Enter", "Btn_Schematic", "StepCardCard".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {FlexDirection, FlexJustify, FlexAlign} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {addButton, addFlex, addText, COLOR, colorForWord, makeCardBody} from "./MWNPSharedUI"

@component
export class MWNPStepCardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Step Card – guided check step with number pad</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(26, 40, 0.5))
  @hint("Card width in cm (brief default 30)")
  widthCm: number = 30
  @input
  @widget(new SliderWidget(2.4, 4.5, 0.1))
  @hint("Number pad key width in cm (brief: about 3 cm)")
  keyWidthCm: number = 3.2
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
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }

  private body: SceneObject | null = null
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
    if (this.tReasoning) this.tReasoning.text = text
  }

  setPathCitation(text: string): void {
    if (this.tPathCite) this.tPathCite.text = text
  }

  setStep(title: string, question: string, citation: string, expected: string): void {
    this.stepTitleText = title
    if (this.tTitle) this.tTitle.text = title
    if (this.tQuestion) this.tQuestion.text = question
    if (this.tCite) this.tCite.text = citation
    if (this.tExpected) this.tExpected.text = expected
  }

  setResult(text: string, colorWord: string): void {
    this.resultText = text
    this.resultColorWord = colorWord
    if (this.tResult) {
      this.tResult.text = text
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
    const card = makeCardBody(this.sceneObject, "StepCardCard", w, 1.4, 0.45)
    this.body = card.body
    const c = card.content
    this.tReasoning = addText(c, "Reasoning", "", inner, 2.6, {role: "Caption", color: COLOR.dim, wrap: true})
    this.tPathCite = addText(c, "PathCitation", "", inner, 1.3, {role: "Caption", color: COLOR.amber, wrap: true})
    this.tTitle = addText(c, "StepTitle", "", inner, 1.7, {role: "Subheadline"})
    this.tQuestion = addText(c, "StepQuestion", "", inner, 1.4, {role: "Body", wrap: true})
    this.tCite = addText(c, "StepCitation", "", inner, 1.3, {role: "Caption", color: COLOR.dim, wrap: true})
    this.tExpected = addText(c, "Expected", "", inner, 1.4, {role: "Body", color: COLOR.cyan})
    this.tResult = addText(c, "Result", "", inner, 3.4, {role: "Body", wrap: true})

    // Bottom row: number pad (left) + readout / Enter / Schematic (right)
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
    this.tReadout = addText(side, "Readout", this.readoutPrefix + " — V", sideW, 2.6, {role: "Headline2", align: "center"})
    addButton(side, "Key_Enter", "Enter", sideW - 1, 3.0, () => this._onEnter.invoke())
    addButton(side, "Btn_Schematic", this.schematicLabel, sideW - 1, 2.6, () => this._onSchematic.invoke())
  }
}
