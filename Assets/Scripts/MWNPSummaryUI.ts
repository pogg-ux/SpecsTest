// MWNPSummaryUI.ts — Findings summary (replaces the step card at the end of the job).
//
// Owns: job/symptom header, one line per logged reading, finding, action, result, Save button.
// API: show(data), setSaved(label), hide(), readable fields, onSave.
// Must not: compute results — Main passes finished strings.
// Test handle: "Btn_SaveJobLog"; reading rows are named "ReadingRow_<n>".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {addButton, addText, COLOR, colorForWord, deferDestroy, makeCardBody, ButtonHandle} from "./MWNPSharedUI"

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
  @hint("Card width in cm")
  widthCm: number = 34
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
    const inner = w - 3.2
    const card = makeCardBody(this.sceneObject, "SummaryCardCard", w, 1.6, 0.4)
    this.body = card.body
    const c = card.content
    addText(c, "SummaryTitle", d.title, inner, 2.2, {role: "Headline2"})
    addText(c, "SummaryJob", d.jobLine, inner, 1.4, {role: "Caption", color: COLOR.dim})
    addText(c, "SummarySymptom", d.symptomLine, inner, 1.4, {role: "Body"})
    addText(c, "ReadingsHeading", d.readingsHeading, inner, 1.5, {role: "Subheadline", color: COLOR.cyan})
    d.rows.forEach((r, i) => {
      addText(c, "ReadingRow_" + i, r.text, inner, 1.3, {role: "Caption", color: colorForWord(r.colorWord)})
    })
    addText(c, "SummaryFinding", d.findingLine, inner, 1.5, {role: "Body", color: COLOR.red, wrap: true})
    addText(c, "SummaryAction", d.actionLine, inner, 1.5, {role: "Body", wrap: true})
    addText(c, "SummaryResult", d.resultLine, inner, 1.6, {role: "Subheadline", color: COLOR.green})
    this.saveBtn = addButton(c, "Btn_SaveJobLog", d.saveLabel, 16, 3.2, () => this._onSave.invoke())
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
