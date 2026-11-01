// MWNPCameraCardUI.ts — the Camera card: take a snapshot (with labels) or a photo, attach it to the current test point.
//
// Owns: the card (same spot and style as the step card it replaces: >= 1.0 cm text, vivid colors, grows downward
// from its host's top-center), its three buttons, a status line and a thumbnail of the latest capture.
// API: show(target), hide(), setTarget(text), setStatus(text, colorWord), setThumbnail(texture, aspect, placeholder),
//      readable fields (isVisible, targetText, statusText, thumbShown, thumbHasTexture, thumbPlaceholder),
//      events onSnapshot, onPhoto, onClose.
// Must not: take pictures or store them — Main does (MWNPCapture).
// Test handles: "Btn_Snapshot", "Btn_Photo", "Btn_CameraClose", card "CameraCardCard", image "CameraThumb",
//               texts "CameraTitle", "CameraTarget", "CameraStatus", "CameraThumbPlaceholder".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {addButton, addFitText, cardEm, colorForWord, deferDestroy, fitText, makeCardBody, makeObj, TEXT_BODY} from "./MWNPSharedUI"

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material

@component
export class MWNPCameraCardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Camera Card – snapshot (with labels) and photo</span>')
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
  @widget(new SliderWidget(1.0, 3.0, 0.05))
  @hint("Title text size: em height in real cm")
  titleEmCm: number = 1.4
  @input
  @hint("Snapshot button label")
  snapshotLabel: string = "Snapshot (with labels)"
  @input
  @hint("Photo button label")
  photoLabel: string = "Photo"
  @input
  @hint("Close button label")
  closeLabel: string = "Close"
  @ui.group_end

  // Readable state for tests
  targetText: string = ""
  statusText: string = ""
  thumbShown: boolean = false
  thumbHasTexture: boolean = false
  thumbPlaceholder: string = ""
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }

  private body: SceneObject | null = null
  private statusColor = ""
  private lastThumb: {texture: Texture | null; aspect: number; placeholder: string} | null = null
  private inner = 0
  private em = 0
  private tTarget: Text | null = null
  private tStatus: Text | null = null
  private tPlaceholder: Text | null = null
  private thumbSO: SceneObject | null = null
  private thumbItem: FlexItem | null = null
  private thumbMat: Material | null = null

  private _onSnapshot = new Event<void>()
  private _onPhoto = new Event<void>()
  private _onClose = new Event<void>()
  get onSnapshot(): PublicApi<void> {
    return this._onSnapshot.publicApi()
  }
  get onPhoto(): PublicApi<void> {
    return this._onPhoto.publicApi()
  }
  get onClose(): PublicApi<void> {
    return this._onClose.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  show(target: string): void {
    if (!this.body) this.build()
    this.setTarget(target)
    ;(this.body as SceneObject).enabled = true
  }

  hide(): void {
    if (this.body) this.body.enabled = false
  }

  get built(): boolean {
    return !!this.body
  }

  /** Rebuilds at the current Text size factor, keeping target, status, thumbnail and visibility. */
  rebuild(): void {
    if (!this.body) return
    const vis = this.body.enabled
    deferDestroy(this, this.body)
    this.body = null
    this.tTarget = null
    this.tStatus = null
    this.tPlaceholder = null
    this.thumbSO = null
    this.thumbItem = null
    this.thumbMat = null
    this.build()
    this.setTarget(this.targetText)
    this.setStatus(this.statusText, this.statusColor)
    if (this.lastThumb) this.setThumbnail(this.lastThumb.texture, this.lastThumb.aspect, this.lastThumb.placeholder)
    ;(this.body as SceneObject | null)!.enabled = vis
  }

  /** Keeps the card's content but makes it visible / invisible without touching its state (used around a snapshot). */
  setBodyEnabled(enabled: boolean): void {
    if (this.body) this.body.enabled = enabled
  }

  setTarget(text: string): void {
    this.targetText = text
    if (this.tTarget) fitText(this.tTarget, text, this.inner, this.em)
  }

  setStatus(text: string, colorWord: string = ""): void {
    this.statusText = text
    this.statusColor = colorWord
    if (this.tStatus) {
      fitText(this.tStatus, text, this.inner, this.em, 0)
      this.tStatus.textFill.color = colorWord ? colorForWord(colorWord) : TEXT_BODY
    }
  }

  /**
   * Shows the latest capture: an image (texture + width/height aspect), or `placeholder` text when there is no
   * image, or nothing (texture null and placeholder empty).
   */
  setThumbnail(texture: Texture | null, aspect: number, placeholder: string): void {
    this.thumbHasTexture = !!texture
    this.thumbPlaceholder = placeholder
    this.thumbShown = !!texture || placeholder.length > 0
    this.lastThumb = {texture, aspect, placeholder}
    if (!this.thumbSO || !this.thumbItem || !this.thumbMat || !this.tPlaceholder) return
    if (texture) {
      const w = Math.min(18, 11 * aspect)
      this.thumbMat.mainPass.baseTex = texture
      this.thumbItem.overrideWidth = w
      this.thumbItem.overrideHeight = w / aspect
      this.thumbSO.getTransform().setLocalScale(new vec3(w, w / aspect, 1))
      this.thumbSO.enabled = true
    } else {
      this.thumbSO.enabled = false
    }
    fitText(this.tPlaceholder, placeholder, this.inner, this.em, 0)
  }

  private build(): void {
    const w = this.widthCm
    const inner = w - 2.8
    this.inner = inner
    const em = cardEm(this.sceneObject, this.textEmCm)
    this.em = em
    const card = makeCardBody(this.sceneObject, "CameraCardCard", w, 1.4, 0.6, "top")
    this.body = card.body
    const c = card.content
    addFitText(c, "CameraTitle", "Camera", inner, cardEm(this.sceneObject, this.titleEmCm), {bold: true})
    this.tTarget = addFitText(c, "CameraTarget", "", inner, em, {color: TEXT_BODY})
    addButton(c, "Btn_Snapshot", this.snapshotLabel, inner - 2, 3.6, () => this._onSnapshot.invoke(), {emCm: em, bold: true})
    addButton(c, "Btn_Photo", this.photoLabel, inner - 2, 3.6, () => this._onPhoto.invoke(), {emCm: em, bold: true})
    addButton(c, "Btn_CameraClose", this.closeLabel, inner - 2, 3.6, () => this._onClose.invoke(), {emCm: em})
    this.tStatus = addFitText(c, "CameraStatus", "", inner, em, {color: TEXT_BODY, minLines: 0})

    // Thumbnail of the latest capture (image) or its placeholder text.
    this.thumbSO = makeObj(c, "CameraThumb")
    const img = this.thumbSO.createComponent("Component.Image") as Image
    this.thumbMat = imageMaterial.clone()
    this.thumbMat.mainPass.depthTest = true
    this.thumbMat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(this.thumbMat)
    this.thumbItem = this.thumbSO.createComponent(FlexItem.getTypeName()) as FlexItem
    this.thumbItem.overrideWidth = 1
    this.thumbItem.overrideHeight = 1
    this.thumbItem.flexShrink = 0
    ;(c.getComponent(FlexLayout.getTypeName()) as FlexLayout).addItems([this.thumbItem])
    this.thumbSO.enabled = false
    this.tPlaceholder = addFitText(c, "CameraThumbPlaceholder", "", inner, em, {color: TEXT_BODY, minLines: 0})
    fitText(this.tPlaceholder, "", inner, em, 0)
  }
}
