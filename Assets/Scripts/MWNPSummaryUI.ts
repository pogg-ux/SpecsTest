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
  addFitText,
  addFlex,
  ButtonHandle,
  cardEm,
  COLOR,
  colorForWord,
  deferDestroy,
  estimateLines,
  LINE_H,
  makeCardBody,
  makeObj,
  TEXT_BODY,
  TEXT_SOFT,
} from "./MWNPSharedUI"

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material

export interface SummaryRow {
  text: string
  colorWord: string
  /** Test point this reading belongs to; captures of the same point are listed right after its last reading. */
  pointId: string
}

/** A snapshot or photo for the report. `texture` null = placeholder (shown as a dark plate). */
export interface ReportCapture {
  id: number
  pointId: string
  caption: string
  texture: Texture | null
  aspect: number
}

export interface SummaryData {
  title: string
  jobLine: string
  symptomLine: string
  readingsHeading: string
  rows: SummaryRow[]
  captures: ReportCapture[]
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
  private saveBtn: ButtonHandle | null = null
  private whiteTex: Texture | null = null
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
    this.captureIds = []
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

    // Each point's captures follow its last reading row; captures of points without a reading come after the table.
    const lastRowOfPoint: {[p: string]: number} = {}
    d.rows.forEach((r, i) => {
      if (r.pointId) lastRowOfPoint[r.pointId] = i
    })
    const placed: {[id: number]: boolean} = {}
    d.rows.forEach((r, i) => {
      addFitText(c, "ReadingRow_" + i, r.text, inner, em, {color: colorForWord(r.colorWord)})
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

    addFitText(c, "SummaryFinding", d.findingLine, inner, em, {color: COLOR.red})
    addFitText(c, "SummaryAction", d.actionLine, inner, em, {color: TEXT_BODY})
    addFitText(c, "SummaryResult", d.resultLine, inner, em, {color: COLOR.green, bold: true})
    this.saveBtn = addButton(c, "Btn_SaveJobLog", d.saveLabel, inner - 6, 3.6, () => this._onSave.invoke(), {emCm: em})
  }

  /** [thumbnail][caption] row for one capture. */
  private captureRow(c: SceneObject, cap: ReportCapture, inner: number, em: number): void {
    // Thumbnail fits a thumbWidth x (thumbWidth * 0.62) box, keeping its aspect (a tall photo stays small).
    const aspect = Math.max(0.3, cap.aspect)
    const th = Math.min(this.thumbWidth / aspect, this.thumbWidth * 0.62)
    const tw = th * aspect
    const capW = inner - this.thumbWidth - 1.0
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
