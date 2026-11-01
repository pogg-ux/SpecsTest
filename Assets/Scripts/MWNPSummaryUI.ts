// MWNPSummaryUI.ts — Findings summary (replaces the step card at the end of the job).
//
// Owns: job/symptom header, one wrapped row per logged reading, finding, action, result, Save button.
// Text is sized in real cm (textEmCm 1.0), every cell is sized to its words, and the card grows DOWNWARD
// from its host's origin (host = card's top-center).
// API: show(data), setSaved(label), hide(), readable fields, onSave.
// Must not: compute results — Main passes finished strings.
// Test handle: "Btn_SaveJobLog"; reading rows are named "ReadingRow_<n>".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {addButton, addFitText, cardEm, COLOR, colorForWord, deferDestroy, makeCardBody, TEXT_BODY, TEXT_SOFT, ButtonHandle} from "./MWNPSharedUI"

export interface SummaryRow {
  text: string
  colorWord: string
}

export interface SummaryData {
  title: string
  jobLine: string
  symptomLine: string
  readingsHeading: string
  rows: SummaryRow[]
  findingLine: string
  actionLine: string
  resultLine: string
  saveLabel: string
}

@component
export class MWNPSummaryUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Findings Summary – readings, finding, result</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(26, 44, 0.5))
  @hint("Card width in card units (cm before scaling)")
  widthCm: number = 32
  @input
  @widget(new SliderWidget(0.6, 2.0, 0.05))
  @hint("Card text size: em height in real cm (1.0 reads in a 1080p recording)")
  textEmCm: number = 1.0
  @input
  @widget(new SliderWidget(1.0, 3.0, 0.05))
  @hint("Title text size: em height in real cm")
  titleEmCm: number = 1.4
  @ui.group_end

  rowTexts: string[] = []
  findingText: string = ""
  resultText: string = ""
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }

  private body: SceneObject | null = null
  private saveBtn: ButtonHandle | null = null
  private _onSave = new Event<void>()
  get onSave(): PublicApi<void> {
    return this._onSave.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  show(d: SummaryData): void {
    this.hide()
    this.rowTexts = d.rows.map((r) => r.text)
    this.findingText = d.findingLine
    this.resultText = d.resultLine
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const big = cardEm(this.sceneObject, Math.max(this.titleEmCm, this.textEmCm * 1.3))
    const card = makeCardBody(this.sceneObject, "SummaryCardCard", w, 1.4, 0.5, "top")
    this.body = card.body
    const c = card.content
    addFitText(c, "SummaryTitle", d.title, inner, big, {bold: true})
    addFitText(c, "SummaryJob", d.jobLine, inner, em, {color: TEXT_SOFT})
    addFitText(c, "SummarySymptom", d.symptomLine, inner, em, {color: TEXT_BODY})
    addFitText(c, "ReadingsHeading", d.readingsHeading, inner, em, {color: COLOR.cyan, bold: true})
    d.rows.forEach((r, i) => {
      addFitText(c, "ReadingRow_" + i, r.text, inner, em, {color: colorForWord(r.colorWord)})
    })
    addFitText(c, "SummaryFinding", d.findingLine, inner, em, {color: COLOR.red})
    addFitText(c, "SummaryAction", d.actionLine, inner, em, {color: TEXT_BODY})
    addFitText(c, "SummaryResult", d.resultLine, inner, em, {color: COLOR.green, bold: true})
    this.saveBtn = addButton(c, "Btn_SaveJobLog", d.saveLabel, inner - 6, 3.6, () => this._onSave.invoke(), {emCm: em})
  }

  setSaved(label: string): void {
    if (this.saveBtn) this.saveBtn.label.text = label
  }

  hide(): void {
    if (this.body) {
      deferDestroy(this, this.body)
      this.body = null
      this.saveBtn = null
    }
  }
}
