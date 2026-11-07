// MWNPPhotoViewerUI.ts — the Photo viewer card: one snapshot or photo, large, with its test point and time.
//
// Owns: the card (same spot and style as the other cards), the large image (or a dark plate with the placeholder text
// when the picture has no image, e.g. "Photo (device only)"), the info lines, Previous / Next, Delete with a Yes / No
// confirm, and Close. Pictures of previous jobs are view-only (only Close). Holds no job state: Main owns the pictures.
// API: show(info), showConfirm(), hide(), built, rebuild(), events onPrev, onNext, onDelete (asks to confirm),
//      onConfirm(yes), onClose.
// Test handles: image "PhotoViewerImage", texts "PhotoViewerKind", "PhotoViewerPoint", "PhotoViewerTime", "PhotoViewerCount",
//               buttons "Btn_PhotoPrev", "Btn_PhotoNext", "Btn_PhotoDelete", "Btn_PhotoClose", "Btn_PhotoYes", "Btn_PhotoNo",
//               card "PhotoViewerCardCard".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {FlexDirection, FlexAlign} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {addButton, addCardHeader, addFitText, addFlex, buttonGapLocal, cardEm, deferDestroy, makeCardBody, makeObj, TEXT_BODY, TEXT_SOFT} from "./MWNPSharedUI"

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material

export interface ViewerInfo {
  texture: Texture | null
  aspect: number
  /** Text shown on a dark plate when there is no image. */
  placeholder: string
  kind: string
  pointLabel: string
  time: string
  /** "2 of 3", or "" for a previous job's picture. */
  position: string
  /** Previous / Next / Delete are offered only for the current job's pictures. */
  editable: boolean
}

@component
export class MWNPPhotoViewerUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Photo Viewer – a snapshot or photo, large</span>')
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
  @ui.group_end

  /** "picture" | "confirm" — readable by tests. */
  view: string = "picture"
  private body: SceneObject | null = null
  private info: ViewerInfo | null = null
  private whiteTex: Texture | null = null
  private _onPrev = new Event<void>()
  private _onNext = new Event<void>()
  private _onDelete = new Event<void>()
  private _onConfirm = new Event<boolean>()
  private _onClose = new Event<void>()
  get onPrev(): PublicApi<void> {
    return this._onPrev.publicApi()
  }
  get onNext(): PublicApi<void> {
    return this._onNext.publicApi()
  }
  get onDelete(): PublicApi<void> {
    return this._onDelete.publicApi()
  }
  get onConfirm(): PublicApi<boolean> {
    return this._onConfirm.publicApi()
  }
  get onClose(): PublicApi<void> {
    return this._onClose.publicApi()
  }
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }
  get built(): boolean {
    return !!this.body
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  show(info: ViewerInfo): void {
    this.info = info
    this.view = "picture"
    this.build()
    ;(this.body as SceneObject).enabled = true
  }

  showConfirm(): void {
    this.view = "confirm"
    this.build()
    ;(this.body as SceneObject).enabled = true
  }

  hide(): void {
    if (this.body) this.body.enabled = false
  }

  rebuild(): void {
    if (!this.body) return
    const vis = this.body.enabled
    this.build()
    ;(this.body as SceneObject).enabled = vis
  }

  private white(): Texture {
    if (!this.whiteTex) {
      this.whiteTex = ProceduralTextureProvider.createWithFormat(1, 1, TextureFormat.RGBA8Unorm)
      ;(this.whiteTex.control as ProceduralTextureProvider).setPixels(0, 0, 1, 1, new Uint8Array([255, 255, 255, 255]))
    }
    return this.whiteTex
  }

  private build(): void {
    if (this.body) deferDestroy(this, this.body)
    const info = this.info as ViewerInfo
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const card = makeCardBody(this.sceneObject, "PhotoViewerCardCard", w, 1.4, 0.8, "top")
    this.body = card.body
    const c = card.content
    if (this.view === "confirm") {
      addCardHeader(c, "PhotoViewerTitle", "Delete picture", inner, this.sceneObject)
      addFitText(c, "PhotoViewerMessage", "Delete this picture? It is removed from the log, the Job report and the thumbnails.", inner, em, {color: TEXT_BODY})
      addButton(c, "Btn_PhotoYes", "Yes", inner - 4, 3.6, () => this._onConfirm.invoke(true), {emCm: em, primary: true})
      addButton(c, "Btn_PhotoNo", "No", inner - 4, 3.6, () => this._onConfirm.invoke(false), {emCm: em})
      return
    }
    addCardHeader(c, "PhotoViewerTitle", "Photo", inner, this.sceneObject)

    // The picture, as large as the card allows (the aspect is kept; a tall photo is limited in height).
    const aspect = Math.max(0.3, info.aspect)
    const ih = Math.min(inner / aspect, 20)
    const iw = ih * aspect
    const so = makeObj(c, "PhotoViewerImage")
    const img = so.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    if (info.texture) mat.mainPass.baseTex = info.texture
    else {
      mat.mainPass.baseTex = this.white()
      mat.mainPass.baseColor = new vec4(0.2, 0.2, 0.22, 1)
    }
    img.clearMaterials()
    img.addMaterial(mat)
    so.getTransform().setLocalScale(new vec3(iw, ih, 1))
    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideWidth = iw
    item.overrideHeight = ih
    item.flexShrink = 0
    ;(c.getComponent(FlexLayout.getTypeName()) as FlexLayout).addItems([item])

    addFitText(c, "PhotoViewerKind", info.kind + (info.placeholder ? " · " + info.placeholder : ""), inner, em, {bold: true})
    addFitText(c, "PhotoViewerPoint", "Test point: " + info.pointLabel, inner, em, {color: TEXT_BODY})
    addFitText(c, "PhotoViewerTime", "Time: " + info.time, inner, em, {color: TEXT_BODY})
    if (info.editable) {
      addFitText(c, "PhotoViewerCount", info.position, inner, em, {color: TEXT_SOFT})
      const gap = buttonGapLocal(this.sceneObject)
      const half = (inner - gap) / 2
      const row = addFlex(c, "PhotoNavRow", FlexDirection.Row, inner, 3.6, gap, {align: FlexAlign.Center})
      addButton(row, "Btn_PhotoPrev", "Previous", half, 3.6, () => this._onPrev.invoke(), {emCm: em})
      addButton(row, "Btn_PhotoNext", "Next", half, 3.6, () => this._onNext.invoke(), {emCm: em})
      addButton(c, "Btn_PhotoDelete", "Delete", inner - 4, 3.6, () => this._onDelete.invoke(), {emCm: em})
    } else {
      addFitText(c, "PhotoViewerCount", "Previous job: view only", inner, em, {color: TEXT_SOFT})
    }
    addButton(c, "Btn_PhotoClose", "Close", inner - 4, 3.6, () => this._onClose.invoke(), {emCm: em, bold: true})
  }
}
