// MWNPSummaryUI.ts — the Job report (replaces the step card at the end of the job).
//
// Owns: job/symptom header, one wrapped row per logged reading, a thumbnail row for every snapshot / photo right
// after the test point it belongs to, finding, action, result, Save button.
// Text is sized in real cm (textEmCm 1.0), every cell is sized to its words, and the card grows DOWNWARD
// from its host's origin (host = card's top-center). Captures are session-only textures held by Main.
// API: show(data), setSaved(label), hide(), readable fields, onSave.
// Must not: compute results — Main passes finished strings.
// Test handles: "Btn_SaveJobLog"; reading rows "ReadingRow_<n>"; capture rows "ReportCapture_<id>" with
//               "ReportCaptureThumb_<id>" (image or placeholder plate) and "ReportCaptureCaption_<id>".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {FlexDirection, FlexAlign} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {
  addButton,
  addCardHeader,
  addFitText,
  addFlex,
  addText,
  ButtonHandle,
  cardEm,
  COLOR,
  colorForWord,
  deferDestroy,
  estimateLines,
  fitText,
  LINE_H,
  makeCardBody,
  makeTappable,
  makeObj,
  TEXT_BODY,
  TEXT_SOFT,
} from "./MWNPSharedUI"

export const EXPORT_NOTE = "Planned: save to glasses, send to phone, or upload to job history."

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material

export interface SummaryRow {
  text: string
  colorWord: string
  /** Test point this reading belongs to; captures of the same point are listed right after its last reading. */
  pointId: string
  /** Table cells: point, value + unit, status mark, then the range / time line. */
  cells?: {point: string; value: string; status: string; detail: string}
}

/** A snapshot or photo for the report. `texture` null = placeholder (shown as a dark plate). */
export interface ReportCapture {
  id: number
  pointId: string
  caption: string
  texture: Texture | null
  aspect: number
  /** For the Photo viewer. */
  kind?: string
  pointLabel?: string
  time?: string
  placeholder?: string
}

export interface SummaryData {
  title: string
  jobLine: string
  symptomLine: string
  readingsHeading: string
  rows: SummaryRow[]
  captures: ReportCapture[]
  /** "Status: Complete · ended ..." etc., with the color word for it. */
  statusLine?: string
  statusColor?: string
  /** Notes section, newest first. */
  notes?: {time: string; source: string; text: string}[]
  /** Finished jobs of this session, newest first: one collapsed line each, tap to view. */
  previous?: {label: string}[]
  /** True while a previous job's report is showing: adds the "Back to current job" button. */
  backToCurrent?: boolean
  findingLine: string
  actionLine: string
  resultLine: string
  saveLabel: string
}

@component
export class MWNPSummaryUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Job Report – readings, snapshots, finding, result</span>')
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
  @input
  @widget(new SliderWidget(6, 14, 0.5))
  @hint("Capture thumbnail width in card units")
  thumbWidth: number = 9
  @ui.group_end

  rowTexts: string[] = []
  findingText: string = ""
  resultText: string = ""
  /** ids of the captures listed, in on-card order. */
  captureIds: number[] = []
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }

  private body: SceneObject | null = null
  private lastData: SummaryData | null = null
  private savedLabel = ""
  private saveBtn: ButtonHandle | null = null
  private tExport: Text | null = null
  private exportShown = false
  private exportEm = 0
  private exportInner = 0
  exportNoteText = ""
  private whiteTex: Texture | null = null
  private _onSave = new Event<void>()
  private _onPrevious = new Event<number>()
  private _onBack = new Event<void>()
  private _onThumb = new Event<number>()
  get onThumbTap(): PublicApi<number> {
    return this._onThumb.publicApi()
  }
  get onPrevious(): PublicApi<number> {
    return this._onPrevious.publicApi()
  }
  get onBack(): PublicApi<void> {
    return this._onBack.publicApi()
  }
  get onSave(): PublicApi<void> {
    return this._onSave.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  show(d: SummaryData): void {
    this.hide()
    this.lastData = d
    this.savedLabel = ""
    this.rowTexts = d.rows.map((r) => r.text)
    this.findingText = d.findingLine
    this.resultText = d.resultLine
    this.captureIds = []
    this.exportShown = false
    this.exportNoteText = ""
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const card = makeCardBody(this.sceneObject, "SummaryCardCard", w, 1.4, 0.15, "top")
    this.body = card.body
    const c = card.content
    addCardHeader(c, "SummaryTitle", d.title, inner, this.sceneObject)
    addFitText(c, "SummaryJob", d.jobLine, inner, em, {color: TEXT_SOFT})
    addFitText(c, "SummarySymptom", d.symptomLine, inner, em, {color: TEXT_BODY})
    if (d.statusLine) addFitText(c, "SummaryStatus", d.statusLine, inner, em, {color: colorForWord(d.statusColor || ""), bold: true})
    addFitText(c, "ReadingsHeading", d.readingsHeading, inner, em, {color: COLOR.cyan, bold: true})

    // Each point's captures follow its last reading row; captures of points without a reading come after the table.
    const lastRowOfPoint: {[p: string]: number} = {}
    d.rows.forEach((r, i) => {
      if (r.pointId) lastRowOfPoint[r.pointId] = i
    })
    const placed: {[id: number]: boolean} = {}
    d.rows.forEach((r, i) => {
      if (r.cells) this.tableRow(c, "ReadingRow_" + i, r, inner, em)
      else addFitText(c, "ReadingRow_" + i, r.text, inner, em, {color: colorForWord(r.colorWord)})
      if (r.pointId && lastRowOfPoint[r.pointId] === i) {
        for (const cap of d.captures) {
          if (cap.pointId === r.pointId) {
            this.captureRow(c, cap, inner, em)
            placed[cap.id] = true
          }
        }
      }
    })
    for (const cap of d.captures) if (!placed[cap.id]) this.captureRow(c, cap, inner, em)

    if (d.notes && d.notes.length > 0) {
      addFitText(c, "NotesHeading", "Notes", inner, em, {bold: true})
      // The newest notes fit the card; the full list is on the Notes card.
      d.notes.slice(0, 2).forEach((n, i) => addFitText(c, "ReportNote_" + i, n.time + " · " + n.source + " — " + n.text, inner, em, {color: TEXT_BODY}))
      if (d.notes.length > 2) addFitText(c, "ReportNotesMore", "+" + (d.notes.length - 2) + " more on the Notes card.", inner, em, {color: TEXT_SOFT})
    }
    addFitText(c, "SummaryFinding", d.findingLine, inner, em, {color: COLOR.red})
    addFitText(c, "SummaryAction", d.actionLine, inner, em, {color: TEXT_BODY})
    addFitText(c, "SummaryResult", d.resultLine, inner, em, {color: COLOR.green, bold: true})
    this.saveBtn = addButton(c, "Btn_SaveJobLog", d.saveLabel, inner - 6, 3.6, () => this._onSave.invoke(), {emCm: em, primary: true})
    // Placeholder: there is no real export in v1; the button says so and shows what is planned.
    addButton(c, "Btn_ExportReport", "Export report — coming in v2", inner, 3.6, () => this.showExportNote(), {emCm: em})
    this.tExport = addFitText(c, "ExportNote", this.exportShown ? EXPORT_NOTE : "", inner, em, {color: TEXT_SOFT, minLines: 0})
    this.exportEm = em
    this.exportInner = inner
    if (d.backToCurrent) addButton(c, "Btn_BackToCurrent", "Back to current job", inner - 6, 3.6, () => this._onBack.invoke(), {emCm: em, bold: true})
    if (d.previous && d.previous.length > 0) {
      addFitText(c, "PreviousJobsHeading", "Previous jobs", inner, em, {bold: true})
      d.previous.forEach((p, i) => addButton(c, "Btn_PrevJob_" + i, p.label, inner - 2, 3.0, () => this._onPrevious.invoke(i), {emCm: em}))
    }
  }

  /**
   * One reading as a small table row: line 1 = point (left) | value with unit (right-aligned, so digits and units line up
   * down the column) | status; line 2 = expected range and time in white. Cells are left-aligned and never touch the edge.
   */
  private tableRow(c: SceneObject, name: string, r: SummaryRow, inner: number, em: number): void {
    const cells = r.cells as {point: string; value: string; status: string; detail: string}
    const lh = em * LINE_H
    const detailLines = Math.max(1, estimateLines(cells.detail, inner, em))
    const row = addFlex(c, name, FlexDirection.Column, inner, lh + detailLines * lh + 0.2, 0.2, {align: FlexAlign.Start})
    const line = addFlex(row, name + "_Line", FlexDirection.Row, inner, lh, 0.8, {align: FlexAlign.Center})
    const col = colorForWord(r.colorWord)
    const pw = 7.5
    const vw = 7.5
    const sw = inner - pw - vw - 1.6
    const t1 = addText(line, name + "_Point", cells.point, pw, lh, {emCm: em, color: col, align: "left"})
    const t2 = addText(line, name + "_Value", cells.value, vw, lh, {emCm: em, color: col, align: "right"})
    const t3 = addText(line, name + "_Status", cells.status, sw, lh, {emCm: em, color: col, align: "left"})
    for (const t of [t1, t2, t3]) (t as Text & {weight?: number}).weight = 700
    addFitText(row, name + "_Detail", cells.detail, inner, em, {color: TEXT_BODY})
  }

  /** [thumbnail][caption] row for one capture. */
  private captureRow(c: SceneObject, cap: ReportCapture, inner: number, em: number): void {
    // Thumbnail fits a thumbWidth x (thumbWidth * 0.62) box, keeping its aspect (a tall photo stays small).
    const tmax = Math.min(this.thumbWidth, 7)
    const aspect = Math.max(0.3, cap.aspect)
    const th = Math.min(tmax / aspect, tmax * 0.62)
    const tw = th * aspect
    const capW = inner - tmax - 1.0
    const capH = Math.max(1, estimateLines(cap.caption, capW, em)) * em * LINE_H
    const rowH = Math.max(th, capH)
    const row = addFlex(c, "ReportCapture_" + cap.id, FlexDirection.Row, inner, rowH, 1.0, {align: FlexAlign.Center})
    const thumb = makeObj(row, "ReportCaptureThumb_" + cap.id)
    const img = thumb.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    if (cap.texture) {
      mat.mainPass.baseTex = cap.texture
    } else {
      // No image (e.g. "Photo (device only)"): a dark smoke-gray plate in the thumbnail's place.
      mat.mainPass.baseTex = this.white()
      mat.mainPass.baseColor = new vec4(0.2, 0.2, 0.22, 1)
    }
    img.clearMaterials()
    img.addMaterial(mat)
    thumb.getTransform().setLocalScale(new vec3(tw, th, 1))
    makeTappable(thumb, () => this._onThumb.invoke(cap.id))
    const item = thumb.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideWidth = tw
    item.overrideHeight = th
    item.flexShrink = 0
    ;(row.getComponent(FlexLayout.getTypeName()) as FlexLayout).addItems([item])
    addFitText(row, "ReportCaptureCaption_" + cap.id, cap.caption, capW, em, {color: TEXT_BODY})
    this.captureIds.push(cap.id)
  }

  private white(): Texture {
    if (!this.whiteTex) {
      this.whiteTex = ProceduralTextureProvider.createWithFormat(1, 1, TextureFormat.RGBA8Unorm)
      ;(this.whiteTex.control as ProceduralTextureProvider).setPixels(0, 0, 1, 1, new Uint8Array([255, 255, 255, 255]))
    }
    return this.whiteTex
  }

  get built(): boolean {
    return !!this.body
  }

  /** Rebuilds at the current Text size factor, keeping visibility and the Saved label. */
  rebuild(): void {
    if (!this.body || !this.lastData) return
    const vis = this.body.enabled
    const saved = this.savedLabel
    this.show(this.lastData)
    if (saved) this.setSaved(saved)
    if (this.body) (this.body as SceneObject).enabled = vis
  }

  setVisible(v: boolean): void {
    if (this.body) this.body.enabled = v
  }

  /** The Export placeholder: no export exists yet, so it only shows what is planned. */
  private showExportNote(): void {
    this.exportShown = true
    this.exportNoteText = EXPORT_NOTE
    if (this.tExport) fitText(this.tExport, EXPORT_NOTE, this.exportInner, this.exportEm, 0)
  }

  setSaved(label: string): void {
    this.savedLabel = label
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
