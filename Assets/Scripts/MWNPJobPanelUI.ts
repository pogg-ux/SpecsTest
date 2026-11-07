// MWNPJobPanelUI.ts — Job panel and the symptom list (same card spot as the step card).
//
// Owns: two views — job summary + "Report symptom", then the symptom list built
// from netlist faults (labels passed in by Main). Rebuilds its card per view.
// Text is sized in real centimetres (textEmCm, default 1.0 cm), every cell is sized to its words,
// and the card grows DOWNWARD from its host's origin (host = card's top-center, as for the step card).
// API: showJob(jobLine, filesLine), showSymptoms(items), hide(), currentView,
//      onReportSymptom, onSymptomPicked(index).
// Must not: read the netlist or decide anything.
// Job control view: "Btn_EndJob", "Btn_NewJob", confirm "Btn_ConfirmYes"/"Btn_ConfirmNo". No-job Job card: "Btn_StartJob".
// Test handles: "Btn_ReportSymptom", "Btn_Symptom_<KEY>" (EXTEND / RETRACT / Neither),
//               cards "JobCard" / "SymptomCard", texts "JobTitle", "FilesLoaded", "SymptomHeading".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {addButton, addCardHeader, addFitText, cardEm, COLOR, deferDestroy, estimateLines, LINE_H, makeCardBody, TEXT_BODY, TEXT_SOFT} from "./MWNPSharedUI"

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
  private auxBody: SceneObject | null = null
  private _onEndRequest = new Event<void>()
  private _onNewRequest = new Event<void>()
  private _onConfirm = new Event<{kind: string; yes: boolean}>()
  get onEndRequest(): PublicApi<void> {
    return this._onEndRequest.publicApi()
  }
  get onNewRequest(): PublicApi<void> {
    return this._onNewRequest.publicApi()
  }
  get onConfirm(): PublicApi<{kind: string; yes: boolean}> {
    return this._onConfirm.publicApi()
  }
  private hasJob = true
  private _onStartJob = new Event<void>()
  get onStartJob(): PublicApi<void> {
    return this._onStartJob.publicApi()
  }
  private jobStatus = ""
  private jobResume = ""
  private _onResume = new Event<void>()
  get onResume(): PublicApi<void> {
    return this._onResume.publicApi()
  }
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

  /**
   * The Job card: job line, files, status, and the job's actions — Report symptom (or, once the job is under way,
   * `resumeLabel` = "Back to the step" etc.), End job and New job (the former Job control), or Start new job when no job
   * is in progress.
   */
  showJob(jobLine: string, filesLine: string, hasJob: boolean = true, status: string = "", resumeLabel: string = ""): void {
    this.clear()
    this.jobArgs = [jobLine, filesLine]
    this.jobStatus = status
    this.jobResume = resumeLabel
    this.hasJob = hasJob
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const card = makeCardBody(this.sceneObject, "JobCard", w, 1.4, 0.8, "top")
    this.body = card.body
    addCardHeader(card.content, "JobHeader", "Job", inner, this.sceneObject)
    addFitText(card.content, "JobTitle", jobLine, inner, em, {bold: true})
    addFitText(card.content, "FilesLoaded", filesLine, inner, em, {color: TEXT_SOFT})
    if (status) addFitText(card.content, "JobStatus", status, inner, em, {color: hasJob ? COLOR.amber : TEXT_BODY, bold: true})
    if (hasJob) {
      if (resumeLabel) addButton(card.content, "Btn_ResumeJob", resumeLabel, inner - 4, 3.6, () => this._onResume.invoke(), {emCm: em, primary: true})
      else addButton(card.content, "Btn_ReportSymptom", this.reportLabel, inner - 4, 3.6, () => this._onReportSymptom.invoke(), {emCm: em, primary: true})
      addButton(card.content, "Btn_EndJob", "End job", inner - 4, 3.6, () => this._onEndRequest.invoke(), {emCm: em})
      addButton(card.content, "Btn_NewJob", "New job", inner - 4, 3.6, () => this._onNewRequest.invoke(), {emCm: em})
    } else {
      addFitText(card.content, "NoJobText", "No job in progress.", inner, em, {bold: true})
      addButton(card.content, "Btn_StartJob", "Start new job", inner - 4, 3.6, () => this._onStartJob.invoke(), {emCm: em, primary: true})
    }
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

  /** Job control (Library > Job control): job line, status, and End job / New job (End job only while a job is in progress). */
  showControl(jobLine: string, status: string, hasJob: boolean): void {
    this.hideAux()
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const card = makeCardBody(this.sceneObject, "JobControlCard", w, 1.4, 0.8, "top")
    this.auxBody = card.body
    addCardHeader(card.content, "JobControlHeader", "Job control", inner, this.sceneObject)
    addFitText(card.content, "JobControlTitle", jobLine, inner, em, {bold: true})
    addFitText(card.content, "JobControlStatus", status, inner, em, {color: hasJob ? COLOR.amber : TEXT_BODY, bold: true})
    if (hasJob) addButton(card.content, "Btn_EndJob", "End job", inner - 4, 3.6, () => this._onEndRequest.invoke(), {emCm: em})
    else addFitText(card.content, "JobControlNote", "Nothing to end. Press New job to start one.", inner, em, {color: TEXT_SOFT})
    addButton(card.content, "Btn_NewJob", "New job", inner - 4, 3.6, () => this._onNewRequest.invoke(), {emCm: em, primary: !hasJob})
  }

  /** Yes / No confirmation for End job / New job. */
  showConfirm(kind: string, message: string): void {
    this.hideAux()
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const card = makeCardBody(this.sceneObject, "JobConfirmCard", w, 1.4, 0.8, "top")
    this.auxBody = card.body
    addCardHeader(card.content, "JobConfirmHeader", kind === "end" ? "End job" : "New job", inner, this.sceneObject)
    addFitText(card.content, "ConfirmMessage", message, inner, em, {color: TEXT_BODY})
    addButton(card.content, "Btn_ConfirmYes", "Yes", inner - 4, 3.6, () => this._onConfirm.invoke({kind, yes: true}), {emCm: em, primary: true})
    addButton(card.content, "Btn_ConfirmNo", "No", inner - 4, 3.6, () => this._onConfirm.invoke({kind, yes: false}), {emCm: em})
  }

  hideAux(): void {
    if (this.auxBody) {
      deferDestroy(this, this.auxBody)
      this.auxBody = null
    }
  }

  /** Hides / shows the card without rebuilding it (keeps its state while the Library is open). */
  setVisible(v: boolean): void {
    if (this.body) this.body.enabled = v
  }

  hide(): void {
    this.clear()
    this.hideAux()
    this.currentView = "hidden"
  }

  get built(): boolean {
    return !!this.body
  }

  /** Rebuilds the current view at the current Text size factor, keeping visibility. */
  rebuild(): void {
    if (!this.body) return
    const vis = this.body.enabled
    if (this.currentView === "job") this.showJob(this.jobArgs[0], this.jobArgs[1], this.hasJob, this.jobStatus, this.jobResume)
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
