// MWNPJobPanelUI.ts — Job panel and the symptom list (same card spot as the step card).
//
// Owns: two views — job summary + "Report symptom", then the symptom list built
// from netlist faults (labels passed in by Main). Rebuilds its card per view.
// API: showJob(jobLine, filesLine), showSymptoms(items), hide(), currentView,
//      onReportSymptom, onSymptomPicked(index).
// Must not: read the netlist or decide anything.
// Test handles: "Btn_ReportSymptom", "Btn_Symptom_<KEY>" (EXTEND / RETRACT / Neither).

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {addButton, addText, COLOR, deferDestroy, makeCardBody} from "./MWNPSharedUI"

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
  @hint("Card width in cm")
  widthCm: number = 30
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
    const w = this.widthCm
    const card = makeCardBody(this.sceneObject, "JobCard", w, 1.6, 0.9)
    this.body = card.body
    addText(card.content, "JobTitle", jobLine, w - 3.2, 2.0, {role: "Subheadline"})
    addText(card.content, "FilesLoaded", filesLine, w - 3.2, 2.6, {role: "Caption", color: COLOR.dim, wrap: true})
    addButton(card.content, "Btn_ReportSymptom", this.reportLabel, 16, 3.4, () => this._onReportSymptom.invoke())
    this.currentView = "job"
  }

  showSymptoms(items: SymptomItem[]): void {
    this.clear()
    const w = this.widthCm
    const card = makeCardBody(this.sceneObject, "SymptomCard", w, 1.6, 0.8)
    this.body = card.body
    addText(card.content, "SymptomHeading", this.symptomHeading, w - 3.2, 2.0, {role: "Subheadline"})
    items.forEach((it, i) => {
      addButton(card.content, "Btn_Symptom_" + it.key, it.label, w - 4, 3.4, () => this._onSymptomPicked.invoke(i))
    })
    this.currentView = "symptoms"
  }

  hide(): void {
    this.clear()
    this.currentView = "hidden"
  }

  private clear(): void {
    if (this.body) {
      deferDestroy(this, this.body)
      this.body = null
    }
  }
}
