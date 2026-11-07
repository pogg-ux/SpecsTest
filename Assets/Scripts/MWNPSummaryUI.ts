// MWNPSummaryUI.ts — the Job report: two pages behind tabs, each paged if it is still too tall.
//
// Owns: tab "Summary" (job, symptom, status, readings table, finding, action, result, Save, Export placeholder, Previous
// jobs) and tab "Notes & pictures" (ALL notes, newest first, then ALL snapshot / photo thumbnails, newest first; tapping a
// thumbnail asks Main to open the Photo viewer). When a page's content is taller than the card may be, it is split over
// pages with Previous page / Next page buttons; nothing is cut. Text is sized in real cm (textEmCm 1.0), every cell is sized
// to its words, and the card grows DOWNWARD from its host's origin (host = card's top-center).
// API: show(data), resetTab(), setSaved(label), hide(), setVisible(), rebuild(), readable fields, events onSave, onPrevious,
//      onBack, onThumbTap.
// Must not: compute results — Main passes finished strings.
// Test handles: tabs "Btn_TabSummary" / "Btn_TabNotes", paging "Btn_ReportPrevPage" / "Btn_ReportNextPage" / "ReportPageInfo",
//               "Btn_SaveJobLog", "Btn_ExportReport", "ExportNote", reading rows "ReadingRow_<n>", notes "ReportNote_<n>",
//               capture rows "ReportCapture_<id>" with "ReportCaptureThumb_<id>" and "ReportCaptureCaption_<id>".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {FlexDirection, FlexAlign} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {
  addButton,
  addCardHeader,
  addFitMixed,
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
  /** True while a previous job's report is showing: adds the "Back to current job" button; the report is read-only (no Save). */
  backToCurrent?: boolean
  /** No job in progress: the Summary tab shows only the status line (the message) and Previous jobs. */
  noJob?: boolean
  findingLine: string
  actionLine: string
  resultLine: string
  /** "green" when the fault was fixed (the Result words turn green); anything else leaves the Result white. */
  resultColor?: string
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
  /** ids of ALL the report's captures (newest first), whichever page they are on. */
  captureIds: number[] = []
  /** "summary" | "notes" — the tab showing. */
  tab: string = "summary"
  /** 0-based page of the tab, and how many pages the tab has. */
  page: number = 0
  pageCount: number = 1
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

  /** Back to the Summary tab (a new report, not a return from the Photo viewer). */
  resetTab(): void {
    this.tab = "summary"
    this.page = 0
  }

  show(d: SummaryData): void {
    this.hide()
    this.lastData = d
    this.savedLabel = ""
    this.exportShown = false
    this.exportNoteText = ""
    this.rowTexts = d.rows.map((r) => r.text)
    this.findingText = d.findingLine
    this.resultText = d.resultLine
    this.captureIds = d.captures.map((c) => c.id).reverse()
    this.page = 0
    this.render()
  }

  private setTab(t: string): void {
    if (t === this.tab) return
    this.tab = t
    this.page = 0
    this.render()
  }

  private turnPage(dir: number): void {
    this.page = (this.page + dir + this.pageCount) % this.pageCount
    this.render()
  }

  /** Height (card units) of a text cell of `lines` lines, with the row gap. */
  private textH(text: string, inner: number, em: number, bold: boolean = false): number {
    return Math.max(1, estimateLines(text, inner, em, bold)) * em * LINE_H + 0.15
  }

  private buttonH(label: string, w: number, em: number): number {
    const lines = estimateLines(label, w - 1.5, em)
    return (lines > 1 ? Math.max(3.6, lines * em * LINE_H + 1.6) : 3.6) + 0.15
  }

  private captureH(cap: ReportCapture, inner: number, em: number): number {
    const tmax = Math.min(this.thumbWidth, 7)
    const th = Math.min(tmax / Math.max(0.3, cap.aspect), tmax * 0.62)
    const capH = Math.max(1, estimateLines(cap.caption, inner - tmax - 1.0, em)) * em * LINE_H
    return Math.max(th, capH) + 0.15
  }

  /** The blocks of the current tab, each with its estimated height. keepNext glues a heading to the block after it. */
  private blocks(d: SummaryData, inner: number, em: number): {h: number; build: (c: SceneObject) => void; keepNext?: boolean}[] {
    const out: {h: number; build: (c: SceneObject) => void; keepNext?: boolean}[] = []
    const lh = em * LINE_H
    if (this.tab === "notes") {
      const notes = d.notes || []
      out.push({h: this.textH("Notes (" + notes.length + ")", inner, em, true), keepNext: true, build: (c) => addFitText(c, "NotesHeading", "Notes (" + notes.length + ")", inner, em, {bold: true})})
      if (notes.length === 0) out.push({h: this.textH("No notes yet.", inner, em), build: (c) => addFitText(c, "NoteEmpty", "No notes yet.", inner, em, {color: TEXT_SOFT})})
      notes.forEach((n, i) => {
        const t = n.time + " · " + n.source + " — " + n.text
        out.push({h: this.textH(t, inner, em), build: (c) => addFitText(c, "ReportNote_" + i, t, inner, em, {color: TEXT_BODY})})
      })
      const caps = d.captures.slice().reverse()
      out.push({h: this.textH("Pictures (" + caps.length + ")", inner, em, true), keepNext: true, build: (c) => addFitText(c, "PicturesHeading", "Pictures (" + caps.length + ")", inner, em, {bold: true})})
      if (caps.length === 0) out.push({h: this.textH("No pictures yet.", inner, em), build: (c) => addFitText(c, "PictureEmpty", "No pictures yet.", inner, em, {color: TEXT_SOFT})})
      caps.forEach((cap) => out.push({h: this.captureH(cap, inner, em), build: (c) => this.captureRow(c, cap, inner, em)}))
      return out
    }
    if (d.backToCurrent) out.push({h: this.buttonH("Back to current job", inner - 6, em), build: (c) => addButton(c, "Btn_BackToCurrent", "Back to current job", inner - 6, 3.6, () => this._onBack.invoke(), {emCm: em, bold: true})})
    if (d.noJob) {
      const st = d.statusLine || "No job in progress"
      out.push({h: this.textH(st, inner, em, true), build: (c) => addFitText(c, "SummaryStatus", st, inner, em, {color: colorForWord(d.statusColor || ""), bold: true})})
      this.appendPrevious(out, d, inner, em)
      return out
    }
    out.push({h: this.textH(d.jobLine, inner, em), build: (c) => addFitText(c, "SummaryJob", d.jobLine, inner, em, {color: TEXT_SOFT})})
    out.push({h: this.textH(d.symptomLine, inner, em), build: (c) => addFitText(c, "SummarySymptom", d.symptomLine, inner, em, {color: TEXT_BODY})})
    if (d.statusLine) {
      // Report text is white; only the status words are colored ("Status: " stays white, "In progress" is amber).
      const st = d.statusLine
      const cut = st.indexOf(": ") >= 0 ? st.indexOf(": ") + 2 : 0
      out.push({h: this.textH(st, inner, em, true), build: (c) => addFitMixed(c, "SummaryStatus", st.substring(0, cut), st.substring(cut), colorForWord(d.statusColor || ""), inner, em, {bold: true})})
    }
    out.push({h: this.textH(d.readingsHeading, inner, em, true), keepNext: true, build: (c) => addFitText(c, "ReadingsHeading", d.readingsHeading, inner, em, {color: COLOR.white, bold: true})})
    d.rows.forEach((r, i) => {
      const detailLines = r.cells ? Math.max(1, estimateLines(r.cells.detail, inner, em)) : Math.max(1, estimateLines(r.text, inner, em))
      const h = (r.cells ? lh + detailLines * lh + 0.2 : detailLines * lh) + 0.15
      out.push({
        h,
        build: (c) => {
          if (r.cells) this.tableRow(c, "ReadingRow_" + i, r, inner, em)
          else addFitText(c, "ReadingRow_" + i, r.text, inner, em, {color: COLOR.white})
        },
      })
    })
    // Finding is red only when a fault was found; Result is green only when it was fixed. Labels stay white.
    const found = d.findingLine.length > 0 && d.findingLine.indexOf("Finding: none") !== 0
    const fCut = d.findingLine.indexOf(": ") >= 0 ? d.findingLine.indexOf(": ") + 2 : 0
    out.push({h: this.textH(d.findingLine, inner, em), build: (c) => addFitMixed(c, "SummaryFinding", d.findingLine.substring(0, fCut), d.findingLine.substring(fCut), found ? COLOR.red : null, inner, em)})
    out.push({h: this.textH(d.actionLine, inner, em), build: (c) => addFitText(c, "SummaryAction", d.actionLine, inner, em, {color: TEXT_BODY})})
    const rCut = d.resultLine.indexOf(": ") >= 0 ? d.resultLine.indexOf(": ") + 2 : 0
    out.push({
      h: this.textH(d.resultLine, inner, em, true),
      build: (c) => addFitMixed(c, "SummaryResult", d.resultLine.substring(0, rCut), d.resultLine.substring(rCut), d.resultColor === "green" ? COLOR.green : null, inner, em, {bold: true}),
    })
    const readOnly = !!d.backToCurrent
    out.push({
      h: (readOnly ? 0 : 3.75) + this.buttonH("Export report — coming in v2", inner, em) + this.textH(EXPORT_NOTE, inner, em),
      build: (c) => {
        if (!readOnly) {
          this.saveBtn = addButton(c, "Btn_SaveJobLog", d.saveLabel, inner - 6, 3.6, () => this._onSave.invoke(), {emCm: em, primary: true})
          if (this.savedLabel) this.saveBtn.label.text = this.savedLabel
        }
        // Placeholder: there is no real export in v1; the button says so and shows what is planned.
        addButton(c, "Btn_ExportReport", "Export report — coming in v2", inner, 3.6, () => this.showExportNote(), {emCm: em})
        this.tExport = addFitText(c, "ExportNote", this.exportShown ? EXPORT_NOTE : "", inner, em, {color: TEXT_SOFT, minLines: 0})
        this.exportEm = em
        this.exportInner = inner
      },
    })
    this.appendPrevious(out, d, inner, em)
    return out
  }

  private appendPrevious(out: {h: number; build: (c: SceneObject) => void; keepNext?: boolean}[], d: SummaryData, inner: number, em: number): void {
    if (!d.previous || d.previous.length === 0) return
    out.push({h: this.textH("Previous jobs", inner, em, true), keepNext: true, build: (c) => addFitText(c, "PreviousJobsHeading", "Previous jobs", inner, em, {bold: true})})
    d.previous.forEach((p, i) =>
      out.push({h: this.buttonH(p.label, inner - 2, em) - 0.6, build: (c) => addButton(c, "Btn_PrevJob_" + i, p.label, inner - 2, 3.0, () => this._onPrevious.invoke(i), {emCm: em})})
    )
  }

  /** Same report with fresh data (a new Previous jobs list, say), keeping the tab, the page and the Saved label. */
  refresh(d: SummaryData): void {
    this.lastData = d
    this.rowTexts = d.rows.map((r) => r.text)
    this.findingText = d.findingLine
    this.resultText = d.resultLine
    this.captureIds = d.captures.map((c) => c.id).reverse()
    this.render()
    // The longer list can push the Save button onto another page: follow it, so its "Saved" feedback stays in view.
    if (this.tab === "summary" && !this.saveBtn && !d.noJob && !d.backToCurrent) {
      const n = this.pageCount
      for (let k = 0; k < n && !this.saveBtn; k++) {
        this.page = k
        this.render()
      }
    }
  }

  /** Builds the current tab and page of the report. */
  private render(): void {
    const d = this.lastData as SummaryData
    if (this.body) {
      deferDestroy(this, this.body)
      this.body = null
      this.saveBtn = null
    }
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const card = makeCardBody(this.sceneObject, "SummaryCardCard", w, 1.4, 0.15, "top")
    this.body = card.body
    const c = card.content
    addCardHeader(c, "SummaryTitle", d.title, inner, this.sceneObject)

    // Tabs: the one showing is amber (the active one).
    const half = (inner - 1.0) / 2
    const tabLines = Math.max(estimateLines("Summary", half - 1.5, em, true), estimateLines("Notes & pictures", half - 1.5, em, true))
    const tabH = tabLines > 1 ? Math.max(3.6, tabLines * em * LINE_H + 1.6) : 3.6
    const tabs = addFlex(c, "ReportTabs", FlexDirection.Row, inner, tabH, 1.0, {align: FlexAlign.Center})
    const t1 = addButton(tabs, "Btn_TabSummary", "Summary", half, tabH, () => this.setTab("summary"), {emCm: em, bold: true})
    const t2 = addButton(tabs, "Btn_TabNotes", "Notes & pictures", half, tabH, () => this.setTab("notes"), {emCm: em, bold: true})
    ;(this.tab === "summary" ? t1 : t2).label.textFill.color = COLOR.amber

    // Pages: pack the blocks greedily into the height the card may have; a page break never separates a heading from its first item.
    const headerH = em * 1.2 * LINE_H + 0.6
    const base = 64 - 2.8 - headerH - tabH - 0.6
    const all = this.blocks(d, inner, em)
    const pack = (avail: number): number[][] => {
      const pages: number[][] = [[]]
      let used = 0
      for (let i = 0; i < all.length; i++) {
        const need = all[i].h + (all[i].keepNext && i + 1 < all.length ? all[i + 1].h : 0)
        if (used + need > avail && pages[pages.length - 1].length > 0) {
          pages.push([])
          used = 0
        }
        pages[pages.length - 1].push(i)
        used += all[i].h
      }
      return pages
    }
    let pages = pack(base)
    if (pages.length > 1) pages = pack(base - 6.6) // room for the page indicator and buttons
    this.pageCount = pages.length
    this.page = Math.min(this.page, pages.length - 1)
    for (const i of pages[this.page]) all[i].build(c)
    if (pages.length > 1) {
      addText(c, "ReportPageInfo", "Page " + (this.page + 1) + " of " + pages.length, inner, em * LINE_H, {emCm: em, color: TEXT_SOFT, align: "center"})
      const nav = addFlex(c, "ReportPager", FlexDirection.Row, inner, 3.6, 1.0, {align: FlexAlign.Center})
      addButton(nav, "Btn_ReportPrevPage", "Previous page", half, 3.6, () => this.turnPage(-1), {emCm: em})
      addButton(nav, "Btn_ReportNextPage", "Next page", half, 3.6, () => this.turnPage(1), {emCm: em})
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
    // Point and value are white; the status mark (✓ in spec / ✗ open) keeps its color.
    const t1 = addText(line, name + "_Point", cells.point, pw, lh, {emCm: em, color: COLOR.white, align: "left"})
    const t2 = addText(line, name + "_Value", cells.value, vw, lh, {emCm: em, color: COLOR.white, align: "right"})
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
    this.render()
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
