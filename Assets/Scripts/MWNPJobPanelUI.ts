// MWNPJobPanelUI.ts — Job panel and the symptom list (same card spot as the step card).
//
// Owns: two views — job summary + "Report symptom", then the symptom list built
// from netlist faults (labels passed in by Main). Rebuilds its card per view.
// Text is sized in real centimetres (textEmCm, default 1.0 cm), every cell is sized to its words,
// and the card grows DOWNWARD from its host's origin (host = card's top-center, as for the step card).
// API: showJob(jobLine, filesLine), showSymptoms(items), hide(), currentView,
//      onReportSymptom, onSymptomPicked(index).
// Must not: read the netlist or decide anything.
// Test handles: "Btn_ReportSymptom", "Btn_Symptom_<KEY>" (EXTEND / RETRACT / Neither),
//               cards "JobCard" / "SymptomCard", texts "JobTitle", "FilesLoaded", "SymptomHeading".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {addButton, addCardHeader, addFitText, cardEm, deferDestroy, estimateLines, LINE_H, makeCardBody, TEXT_BODY, TEXT_SOFT} from "./MWNPSharedUI"

export interface SymptomItem {
  key: string
  label: string
}

@component
export class MWNPJobPanelUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Job Panel – job info and symptom picker</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(20, 40, 1))
  @hint("Card width in card units (cm before scaling)")
  widthCm: number = 32
  @input
  @widget(new SliderWidget(0.6, 2.0, 0.05))
  @hint("Card text size: em height in real cm (1.0 reads in a 1080p recording)")
  textEmCm: number = 1.0
  @input
  @hint("Report symptom button label")
  reportLabel: string = "Report symptom"
  @input
  @hint("Heading shown above the symptom list")
  symptomHeading: string = "What's the symptom?"
  @ui.group_end

  /** "hidden" | "job" | "symptoms" — readable by tests. */
  currentView: string = "hidden"

  private body: SceneObject | null = null
  private jobArgs: [string, string] = ["", ""]
  private symptomItems: SymptomItem[] = []
  private _onReportSymptom = new Event<void>()
  private _onSymptomPicked = new Event<number>()
  get onReportSymptom(): PublicApi<void> {
    return this._onReportSymptom.publicApi()
  }
  get onSymptomPicked(): PublicApi<number> {
    return this._onSymptomPicked.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  showJob(jobLine: string, filesLine: string): void {
    this.clear()
    this.jobArgs = [jobLine, filesLine]
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const card = makeCardBody(this.sceneObject, "JobCard", w, 1.4, 0.8, "top")
    this.body = card.body
    addCardHeader(card.content, "JobHeader", "Job", inner, this.sceneObject)
    addFitText(card.content, "JobTitle", jobLine, inner, em, {bold: true})
    addFitText(card.content, "FilesLoaded", filesLine, inner, em, {color: TEXT_SOFT})
    addButton(card.content, "Btn_ReportSymptom", this.reportLabel, inner - 4, 3.6, () => this._onReportSymptom.invoke(), {emCm: em})
    this.currentView = "job"
  }

  showSymptoms(items: SymptomItem[]): void {
    this.clear()
    this.symptomItems = items
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const card = makeCardBody(this.sceneObject, "SymptomCard", w, 1.4, 0.8, "top")
    this.body = card.body
    addCardHeader(card.content, "SymptomsHeader", "Symptoms", inner, this.sceneObject)
    addFitText(card.content, "SymptomHeading", this.symptomHeading, inner, em, {color: TEXT_BODY})
    items.forEach((it, i) => {
      // Long labels wrap onto a second line and the button grows with them.
      const bw = inner - 2
      const lines = estimateLines(it.label, bw - 1.5, em, false)
      const bh = Math.max(3.6, lines * em * LINE_H + 1.6)
      addButton(card.content, "Btn_Symptom_" + it.key, it.label, bw, bh, () => this._onSymptomPicked.invoke(i), {emCm: em, wrap: true})
    })
    this.currentView = "symptoms"
  }

  /** Hides / shows the card without rebuilding it (keeps its state while the Library is open). */
  setVisible(v: boolean): void {
    if (this.body) this.body.enabled = v
  }

  hide(): void {
    this.clear()
    this.currentView = "hidden"
  }

  get built(): boolean {
    return !!this.body
  }

  /** Rebuilds the current view at the current Text size factor, keeping visibility. */
  rebuild(): void {
    if (!this.body) return
    const vis = this.body.enabled
    if (this.currentView === "job") this.showJob(this.jobArgs[0], this.jobArgs[1])
    else if (this.currentView === "symptoms") this.showSymptoms(this.symptomItems)
    if (this.body) (this.body as SceneObject).enabled = vis
  }

  private clear(): void {
    if (this.body) {
      deferDestroy(this, this.body)
      this.body = null
    }
  }
}
