// MWNPStepCardUI.ts — the step card: reasoning, current step, citation, result, readout, number pad.
//
// Owns: card layout, the number pad (0–9, ".", Del, Enter), the Schematic toggle, and — during the retest step —
// a row of switch buttons (e.g. "S1 UP" / "S1 DOWN") as a backup to pinching the switch on the model, and a
// "Camera" button that opens the Camera card in this card's place.
// Text is sized in real centimetres (textEmCm, default 1.0 cm) whatever the card's scale, each text cell is
// sized to its words (fitText), and the card grows DOWNWARD from its host's origin (host = top-center).
// The number pad keys are about 3 cm wide with bold digits at least 1.2 cm tall.
// API: show(), hide(), setReasoning(), setPathCitation(), setStep(), setResult(), setReadout(),
//      setSwitchControls(component, positions, current), setMore(open) / isMoreOpen,
//      events also onMore(open) (Main shows the board footnote with it),
//      readable text fields (stepTitleText, resultText, readoutText, resultColorWord),
//      events onKey(key: "0".."9" | "." | "back"), onEnter, onSchematic, onCamera, onSwitch({component, position}).
// Must not: parse readings, classify, or advance steps — Main/agent own that.
// Test handles: "Key_0".."Key_9", "Key_Dot", "Key_Back", "Key_Enter", "Btn_Schematic", "Btn_Camera", "Btn_More", "Btn_<comp>_<pos>" (Btn_S1_UP,
//               Btn_S1_DOWN), "StepCardCard", text cells "Reasoning", "PathCitation", "StepTitle", "StepQuestion",
//               "StepCitation", "Expected", "Result", "Readout".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {FlexDirection, FlexJustify, FlexAlign} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {
  addButton,
  addCardHeader,
  addFitText,
  addFlex,
  addText,
  BEST_TARGET_CM,
  ButtonHandle,
  buttonGapLocal,
  COLOR,
  colorForWord,
  deferDestroy,
  fitText,
  getHostEmFactor,
  hostBaseScale,
  LINE_H,
  makeCardBody,
  minEmCm,
  MIN_TARGET_CM,
  realToLocal,
  TEXT_BODY,
  TEXT_SOFT,
} from "./MWNPSharedUI"

/** Keypad keys on the Log reading card (real cm): large, between the guideline's "best" (3.9) and minimum (2.6). */
const KEYPAD_KEY_CM = 3.5
/** The collapsed chip: width (real cm) and where it sits relative to the step card's host (card units): upper right, above the cabinet. */
const CHIP_WIDTH_CM = 9.5
const CHIP_OFFSET = new vec3(4.0, 11.5, 0.6)

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
  private btnEmLocal = 0
  // "More" view: secondary detail (the reasoning line, plus the board footnote via onMore) is hidden until the tech
  // opens it. Citations (schematic path and the step's own), the question and the expected value always show.
  private moreOpen = false
  private moreBtn: ButtonHandle | null = null
  private _onMore = new Event<boolean>()
  get onMore(): PublicApi<boolean> {
    return this._onMore.publicApi()
  }
  get isMoreOpen(): boolean {
    return this.moreOpen
  }

  // Modes: "card" = the full step card; "keypad" = the number pad as its own card ("Log reading"); "chip" = a small
  // "Step X of N" button at the edge of the view, shown after an action so the card is out of the way.
  // Only one of the three is visible at a time.
  private mode: "card" | "keypad" | "chip" = "card"
  private keypadBody: SceneObject | null = null
  private tKeypadStep: Text | null = null
  private tKeypadHint: Text | null = null
  private chip: ButtonHandle | null = null
  private _onLogReading = new Event<void>()
  private _onKeypadCancel = new Event<void>()
  private _onChip = new Event<void>()
  get onLogReading(): PublicApi<void> {
    return this._onLogReading.publicApi()
  }
  get onKeypadCancel(): PublicApi<void> {
    return this._onKeypadCancel.publicApi()
  }
  get onChip(): PublicApi<void> {
    return this._onChip.publicApi()
  }
  get isCollapsed(): boolean {
    return this.mode === "chip" && this.isVisible
  }
  get isKeypadOpen(): boolean {
    return this.mode === "keypad" && this.isVisible
  }
  // Last values given to the setters, so rebuild() (Text size option) can put them back.
  private sReasoning = ""
  private sPathCite = ""
  private sStep: [string, string, string, string] = ["", "", "", ""]
  private sReadout = ""
  private sSwitch: [string, string[], string] = ["", [], ""]

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

  /** Shows the full step card (whatever mode it was in). */
  show(): void {
    if (!this.body) this.build()
    this.mode = "card"
    this.applyMode()
  }

  hide(): void {
    if (this.body) this.body.enabled = false
    if (this.keypadBody) this.keypadBody.enabled = false
    if (this.chip) this.chip.so.enabled = false
    this.mode = "card"
  }

  /** Step card, keypad card or chip is showing. */
  get isVisible(): boolean {
    return (!!this.body && this.body.enabled) || (!!this.keypadBody && this.keypadBody.enabled) || (!!this.chip && this.chip.so.enabled)
  }

  /** Shrinks the card to the "Step X of N" chip (no-op while the step card is not showing). */
  collapse(): void {
    if (!this.isVisible) return
    this.mode = "chip"
    this.applyMode()
  }

  /** Chip -> full step card. */
  expand(): void {
    if (!this.isVisible) return
    this.mode = "card"
    this.applyMode()
  }

  /** "Log reading": the number pad opens as its own card in the step card's place. */
  openKeypad(): void {
    if (!this.isVisible) return
    this.mode = "keypad"
    this.setKeypadHint("")
    this.applyMode()
  }

  /** Keypad card -> step card. */
  closeKeypad(): void {
    if (this.mode !== "keypad") return
    this.mode = "card"
    this.applyMode()
  }

  setKeypadHint(text: string): void {
    if (this.tKeypadHint) fitText(this.tKeypadHint, text, this.inner, this.textEmLocal, 0)
  }

  private chipLabel(): string {
    const t = this.sStep[0]
    const m = /^Step \d+ of \d+/.exec(t)
    if (m) return m[0]
    const head = t.split(":")[0]
    return head.length > 0 ? head : "Step"
  }

  private applyMode(): void {
    if (this.mode === "keypad" && !this.keypadBody) this.buildKeypad()
    if (this.mode === "chip" && !this.chip) this.buildChip()
    if (this.body) this.body.enabled = this.mode === "card"
    if (this.keypadBody) this.keypadBody.enabled = this.mode === "keypad"
    if (this.chip) {
      this.chip.so.enabled = this.mode === "chip"
      this.chip.label.text = this.chipLabel()
    }
  }

  get built(): boolean {
    return !!this.body
  }

  /** Rebuilds the card at the current Text size factor, keeping everything it shows and whether it is visible. */
  rebuild(): void {
    if (!this.body) return
    const vis = this.isVisible
    const mode = this.mode
    deferDestroy(this, this.body)
    if (this.keypadBody) deferDestroy(this, this.keypadBody)
    if (this.chip) deferDestroy(this, this.chip.so)
    this.body = null
    this.keypadBody = null
    this.tKeypadStep = null
    this.tKeypadHint = null
    this.tReadout = null
    this.chip = null
    this.content = null
    this.switchRow = null
    this.switchKey = ""
    this.switchButtons = {}
    this.moreBtn = null
    this.build()
    this.setReasoning(this.sReasoning)
    this.setPathCitation(this.sPathCite)
    this.setStep(...this.sStep)
    this.setResult(this.resultText, this.resultColorWord)
    this.setReadout(this.sReadout || "— V")
    if (this.sSwitch[1].length > 0) this.setSwitchControls(...this.sSwitch)
    if (vis) {
      this.mode = mode
      this.applyMode()
    } else this.hide()
  }

  setReasoning(text: string): void {
    this.sReasoning = text
    if (this.tReasoning) fitText(this.tReasoning, this.moreOpen ? text : "", this.inner, this.textEmLocal, this.moreOpen ? 1 : 0)
  }

  setPathCitation(text: string): void {
    this.sPathCite = text
    if (this.tPathCite) fitText(this.tPathCite, text, this.inner, this.textEmLocal)
  }

  /** Opens / closes the "More" view: shows or hides the reasoning line and tells Main (which shows the board footnote). */
  setMore(open: boolean): void {
    this.moreOpen = open
    if (this.moreBtn) this.moreBtn.label.text = open ? "Less" : "More"
    this.setReasoning(this.sReasoning)
    this._onMore.invoke(open)
  }

  setStep(title: string, question: string, citation: string, expected: string): void {
    this.stepTitleText = title
    this.sStep = [title, question, citation, expected]
    const em = this.textEmLocal
    if (this.tTitle) fitText(this.tTitle, title, this.inner, em, 1, true)
    if (this.tQuestion) fitText(this.tQuestion, question, this.inner, em)
    if (this.tCite) fitText(this.tCite, citation, this.inner, em)
    if (this.tExpected) fitText(this.tExpected, expected, this.inner, em)
    if (this.tKeypadStep) fitText(this.tKeypadStep, title, this.inner, em)
    if (this.chip) this.chip.label.text = this.chipLabel()
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
    this.sReadout = text
    if (this.tReadout) this.tReadout.text = this.readoutPrefix + " " + text
  }

  /**
   * Shows the switch row (retest step) with one button per position, highlighting `current`; an empty
   * `positions` list hides it. Buttons are named "Btn_<component>_<position>".
   */
  setSwitchControls(component: string, positions: string[], current: string): void {
    this.switchCurrent = current
    this.sSwitch = [component, positions, current]
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
    const em = this.btnEmLocal
    const labelW = 5.5
    const gap = buttonGapLocal(this.sceneObject)
    const bw = (this.inner - labelW - gap * positions.length) / positions.length
    const rowH = Math.max(3.8, realToLocal(this.sceneObject, MIN_TARGET_CM))
    const row = addFlex(c, "SwitchRow", FlexDirection.Row, this.inner, rowH, gap, {align: FlexAlign.Center})
    const rowItem = row.getComponent(FlexItem.getTypeName()) as FlexItem
    rowItem.order = 1
    rowItem.marginTop = rowItem.marginBottom = Math.max(0, (gap - 0.5) / 2)
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
    const scale = hostBaseScale(this.sceneObject)
    // Text cells follow the Text size option; keys and side buttons keep their size (narrow column).
    const em = (minEmCm(this.textEmCm) * getHostEmFactor(this.sceneObject.name)) / scale
    this.textEmLocal = em
    const btnEm = minEmCm(this.textEmCm) / scale
    this.btnEmLocal = btnEm
    const card = makeCardBody(this.sceneObject, "StepCardCard", w, 1.4, 0.5, "top")
    this.body = card.body
    const c = card.content
    this.content = c
    addCardHeader(c, "StepHeader", "Step", inner, this.sceneObject)
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

    // Actions: one large "Log reading" button (opens the keypad as its own card), then Schematic | Camera, then More.
    const host = this.sceneObject
    const gap = buttonGapLocal(host)
    const margin = Math.max(0, (gap - 0.5) / 2)
    const logBtn = addButton(c, "Btn_LogReading", "Log reading", inner - 4, realToLocal(host, BEST_TARGET_CM), () => this._onLogReading.invoke(), {emCm: btnEm * 1.2, bold: true, primary: true})
    ;(logBtn.so.getComponent(FlexItem.getTypeName()) as FlexItem).order = 2
    const rowH = realToLocal(host, MIN_TARGET_CM)
    const half = (inner - gap) / 2
    const actions = addFlex(c, "ActionRow", FlexDirection.Row, inner, rowH, gap, {align: FlexAlign.Center})
    const actionsItem = actions.getComponent(FlexItem.getTypeName()) as FlexItem
    actionsItem.order = 3
    actionsItem.marginTop = actionsItem.marginBottom = margin
    addButton(actions, "Btn_Schematic", this.schematicLabel, half, rowH, () => this._onSchematic.invoke(), {emCm: btnEm})
    addButton(actions, "Btn_Camera", this.cameraLabel, half, rowH, () => this._onCamera.invoke(), {emCm: btnEm})

    // "More" toggle: full-width, large, last on the card.
    this.moreBtn = addButton(c, "Btn_More", this.moreOpen ? "Less" : "More", inner - 4, 4.4, () => this.setMore(!this.moreOpen), {emCm: btnEm * 1.2, bold: true})
    ;(this.moreBtn.so.getComponent(FlexItem.getTypeName()) as FlexItem).order = 4
  }

  /** The number pad as its own card: large keys (KEYPAD_KEY_CM), at least MIN_GAP_CM between them, Cancel + Enter below. */
  private buildKeypad(): void {
    const host = this.sceneObject
    const scale = hostBaseScale(host)
    const em = this.textEmLocal
    const btnEm = this.btnEmLocal
    const gap = buttonGapLocal(host)
    const key = realToLocal(host, KEYPAD_KEY_CM)
    const padW = key * 3 + gap * 2
    const w = padW + 2.8
    const inner = padW
    const card = makeCardBody(host, "KeypadCardCard", w, 1.4, 0.5, "top")
    this.keypadBody = card.body
    const c = card.content
    addCardHeader(c, "KeypadHeader", "Log reading", inner, host)
    this.tKeypadStep = addFitText(c, "KeypadStep", this.sStep[0], inner, em, {color: TEXT_SOFT})
    const rem = minEmCm(this.readoutEmCm) / scale
    this.tReadout = addText(c, "Readout", this.readoutPrefix + " " + (this.sReadout || "— V"), inner, rem * LINE_H, {emCm: rem, align: "center"})
    this.tKeypadHint = addFitText(c, "KeypadHint", "", inner, em, {color: COLOR.amber, minLines: 0})
    const digitEm = minEmCm(this.digitEmCm) / scale
    const pad = addFlex(c, "NumPad", FlexDirection.Column, padW, key * 4 + gap * 3, gap)
    const keys = [
      ["7", "8", "9"],
      ["4", "5", "6"],
      ["1", "2", "3"],
      [".", "0", "back"],
    ]
    keys.forEach((rowKeys, r) => {
      const kr = addFlex(pad, "KeyRow" + r, FlexDirection.Row, padW, key, gap)
      for (const k of rowKeys) {
        const name = k === "." ? "Key_Dot" : k === "back" ? "Key_Back" : "Key_" + k
        const label = k === "back" ? "Del" : k
        addButton(kr, name, label, key, key, () => this._onKey.invoke(k), {emCm: digitEm, bold: true})
      }
    })
    const act = addFlex(c, "KeypadActions", FlexDirection.Row, padW, key, gap)
    const actItem = act.getComponent(FlexItem.getTypeName()) as FlexItem
    actItem.marginTop = Math.max(0, (gap - 0.5) / 2)
    addButton(act, "Btn_KeypadCancel", "Cancel", key, key, () => this._onKeypadCancel.invoke(), {emCm: btnEm})
    addButton(act, "Key_Enter", "Enter", padW - key - gap, key, () => this._onEnter.invoke(), {emCm: btnEm * 1.2, bold: true, primary: true})
  }

  /** The chip: a small "Step X of N" button at the top-right edge of the view, above the cabinet, never over it. */
  private buildChip(): void {
    const host = this.sceneObject
    const h = Math.max(this.btnEmLocal * LINE_H + 1.6, realToLocal(host, MIN_TARGET_CM))
    const w = Math.max(16, realToLocal(host, CHIP_WIDTH_CM))
    this.chip = addButton(host, "Btn_StepChip", this.chipLabel(), w, h, () => this._onChip.invoke(), {emCm: this.btnEmLocal, bold: true, primary: true, inFlex: false})
    this.chip.so.getTransform().setLocalPosition(CHIP_OFFSET)
  }
}
