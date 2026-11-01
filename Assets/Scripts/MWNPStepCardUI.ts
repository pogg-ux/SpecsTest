// MWNPStepCardUI.ts — the step card: reasoning, current step, citation, result, readout, number pad.
//
// Owns: card layout, the number pad (0–9, ".", Del, Enter), the Schematic toggle, and — during the retest step —
// a row of switch buttons (e.g. "S1 UP" / "S1 DOWN") as a backup to pinching the switch on the model, and a
// "Camera" button that opens the Camera card in this card's place.
// Text is sized in real centimetres (textEmCm, default 1.0 cm) whatever the card's scale, each text cell is
// sized to its words (fitText), and the card grows DOWNWARD from its host's origin (host = top-center).
// The number pad keys are about 3 cm wide with bold digits at least 1.2 cm tall.
// API: show(), hide(), setReasoning(), setPathCitation(), setStep(), setResult(), setReadout(),
//      setSwitchControls(component, positions, current),
//      readable text fields (stepTitleText, resultText, readoutText, resultColorWord),
//      events onKey(key: "0".."9" | "." | "back"), onEnter, onSchematic, onCamera, onSwitch({component, position}).
// Must not: parse readings, classify, or advance steps — Main/agent own that.
// Test handles: "Key_0".."Key_9", "Key_Dot", "Key_Back", "Key_Enter", "Btn_Schematic", "Btn_Camera", "Btn_<comp>_<pos>" (Btn_S1_UP,
//               Btn_S1_DOWN), "StepCardCard", text cells "Reasoning", "PathCitation", "StepTitle", "StepQuestion",
//               "StepCitation", "Expected", "Result", "Readout".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {FlexDirection, FlexJustify, FlexAlign} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {addButton, addFlex, addText, ButtonHandle, COLOR, colorForWord, fitText, LINE_H, makeCardBody, TEXT_BODY, TEXT_SOFT} from "./MWNPSharedUI"

export interface SwitchPick {
  component: string
  position: string
}

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
  @widget(new SliderWidget(0.6, 2.0, 0.05))
  @hint("Card text size: em height in real cm (1.0 reads in a 1080p recording)")
  textEmCm: number = 1.0
  @input
  @widget(new SliderWidget(0.6, 2.4, 0.05))
  @hint("Readout text size: em height in real cm")
  readoutEmCm: number = 1.2
  @input
  @widget(new SliderWidget(2.0, 4.5, 0.1))
  @hint("Number pad key width in real cm (about 3)")
  keyWidthRealCm: number = 3.0
  @input
  @widget(new SliderWidget(1.6, 3.5, 0.1))
  @hint("Number pad key height in real cm")
  keyHeightRealCm: number = 2.2
  @input
  @widget(new SliderWidget(1.0, 2.0, 0.05))
  @hint("Number pad digits: em height in real cm, bold (at least 1.2)")
  digitEmCm: number = 1.25
  @input
  @hint("Readout prefix")
  readoutPrefix: string = "Reading:"
  @input
  @hint("Schematic toggle label")
  schematicLabel: string = "Schematic"
  @input
  @hint("Camera button label")
  cameraLabel: string = "Camera"
  @ui.group_end

  // Readable state for tests
  stepTitleText: string = ""
  resultText: string = ""
  resultColorWord: string = ""
  readoutText: string = ""
  /** Text height in card units (cm before scaling) actually used; times the card's world scale = real cm. */
  textEmLocal: number = 0
  /** Switch row: shown during the retest step. */
  switchRowVisible: boolean = false
  switchCurrent: string = ""
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }

  private body: SceneObject | null = null
  private content: SceneObject | null = null
  private inner = 0
  private tReasoning: Text | null = null
  private tPathCite: Text | null = null
  private tTitle: Text | null = null
  private tQuestion: Text | null = null
  private tCite: Text | null = null
  private tExpected: Text | null = null
  private tResult: Text | null = null
  private tReadout: Text | null = null
  private switchRow: SceneObject | null = null
  private switchKey = ""
  private switchButtons: {[position: string]: ButtonHandle} = {}

  private _onKey = new Event<string>()
  private _onEnter = new Event<void>()
  private _onSchematic = new Event<void>()
  private _onCamera = new Event<void>()
  private _onSwitch = new Event<SwitchPick>()
  get onKey(): PublicApi<string> {
    return this._onKey.publicApi()
  }
  get onEnter(): PublicApi<void> {
    return this._onEnter.publicApi()
  }
  get onSchematic(): PublicApi<void> {
    return this._onSchematic.publicApi()
  }
  get onCamera(): PublicApi<void> {
    return this._onCamera.publicApi()
  }
  get onSwitch(): PublicApi<SwitchPick> {
    return this._onSwitch.publicApi()
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
    // Two short lines ("Reading:" / "12.1 V") so the value stays big inside the narrow side column.
    if (this.tReadout) this.tReadout.text = this.readoutPrefix + "\n" + text
  }

  /**
   * Shows the switch row (retest step) with one button per position, highlighting `current`; an empty
   * `positions` list hides it. Buttons are named "Btn_<component>_<position>".
   */
  setSwitchControls(component: string, positions: string[], current: string): void {
    this.switchCurrent = current
    if (!this.content) return
    if (positions.length === 0) {
      if (this.switchRow) this.switchRow.enabled = false
      this.switchRowVisible = false
      return
    }
    const key = component + ":" + positions.join(",")
    if (!this.switchRow || this.switchKey !== key) {
      if (this.switchRow) this.switchRow.destroy()
      this.buildSwitchRow(component, positions)
      this.switchKey = key
    }
    ;(this.switchRow as SceneObject).enabled = true
    this.switchRowVisible = true
    for (const p of positions) {
      const h = this.switchButtons[p]
      if (h) h.label.textFill.color = p === current ? COLOR.amber : COLOR.white
    }
  }

  private buildSwitchRow(component: string, positions: string[]): void {
    const c = this.content as SceneObject
    const em = this.textEmLocal
    const labelW = 5.5
    const gap = 0.8
    const bw = (this.inner - labelW - gap * positions.length) / positions.length
    const row = addFlex(c, "SwitchRow", FlexDirection.Row, this.inner, 3.8, gap, {align: FlexAlign.Center})
    ;(row.getComponent(FlexItem.getTypeName()) as FlexItem).order = 1
    addText(row, "SwitchLabel", component, labelW, 3.8, {emCm: em, color: TEXT_SOFT, align: "center"})
    this.switchButtons = {}
    for (const pos of positions) {
      this.switchButtons[pos] = addButton(row, "Btn_" + component + "_" + pos, component + " " + pos, bw, 3.8, () => this._onSwitch.invoke({component, position: pos}), {
        emCm: em,
        bold: true,
      })
    }
    this.switchRow = row
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
    this.content = c
    const cell = (name: string, color: vec4): Text => addText(c, name, "", inner, 0.01, {emCm: em, color, wrap: true, valign: "top"})
    this.tReasoning = cell("Reasoning", TEXT_SOFT)
    this.tPathCite = cell("PathCitation", COLOR.amber)
    this.tTitle = cell("StepTitle", COLOR.white)
    this.tQuestion = cell("StepQuestion", TEXT_BODY)
    this.tCite = cell("StepCitation", TEXT_SOFT)
    this.tExpected = cell("Expected", COLOR.cyan)
    this.tResult = cell("Result", TEXT_BODY)
    for (const t of [this.tReasoning, this.tPathCite, this.tTitle, this.tQuestion, this.tCite, this.tExpected, this.tResult]) {
      fitText(t, "", inner, em, 0)
    }
    ;(this.tTitle as Text & {weight?: number}).weight = 700

    // Bottom row: number pad (left) + readout / Enter / Schematic (right).
    const kw = this.keyWidthRealCm / scale
    const kh = this.keyHeightRealCm / scale
    const digitEm = this.digitEmCm / scale
    const kg = 0.35
    const padW = kw * 3 + kg * 2
    const padH = kh * 4 + kg * 3
    const row = addFlex(c, "PadRow", FlexDirection.Row, inner, padH, 1.0, {align: FlexAlign.Center})
    ;(row.getComponent(FlexItem.getTypeName()) as FlexItem).order = 2
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
        addButton(kr, name, label, kw, kh, () => this._onKey.invoke(k), {emCm: digitEm, bold: true})
      }
    })
    const sideW = inner - padW - 1.0
    const side = addFlex(row, "PadSide", FlexDirection.Column, sideW, padH, 0.8, {justify: FlexJustify.Center})
    const rem = this.readoutEmCm / scale
    this.tReadout = addText(side, "Readout", this.readoutPrefix + "\n— V", sideW, rem * LINE_H * 2, {emCm: rem, align: "center", wrap: true, valign: "top"})
    addButton(side, "Key_Enter", "Enter", sideW - 1, 3.0, () => this._onEnter.invoke(), {emCm: em, bold: true})
    addButton(side, "Btn_Schematic", this.schematicLabel, sideW - 1, 3.0, () => this._onSchematic.invoke(), {emCm: em})
    addButton(side, "Btn_Camera", this.cameraLabel, sideW - 1, 3.0, () => this._onCamera.invoke(), {emCm: em})
  }
}
