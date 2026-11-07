// MWNPSafetyNoticeUI.ts — one-line safety notice in front of the cabinet at start.
//
// Owns: the notice card (warning icon + one line + Dismiss button).
// API: show(), hide(), isVisible, onDismiss.
// Must not: decide flow. Main hides it and opens the Job panel on onDismiss.
// Test handle: button SceneObject "Btn_DismissSafety".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {FlexDirection} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {addButton, addCardHeader, addFitText, addFlex, addText, cardEm, COLOR, estimateLines, LINE_H, makeCardBody, makeObj, TEXT_SOFT, textWidthCm} from "./MWNPSharedUI"

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material

@component
export class MWNPSafetyNoticeUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Safety Notice – one-line notice shown at start</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Warning icon shown left of the notice")
  warningIcon: Texture
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Safety notice text (one line)")
  noticeText: string = "Reference aid only. Verify with a meter. Follow lockout/tagout."
  @input
  @hint("Dismiss button label")
  dismissLabel: string = "Dismiss"
  @input
  @widget(new SliderWidget(30, 70, 1))
  @hint("Card width in cm")
  widthCm: number = 48
  @input
  @widget(new SliderWidget(0.5, 1.6, 0.05))
  @hint("Notice text size: em height in cm (1.0 reads well at ~70 cm)")
  textEmCm: number = 1.0
  @ui.group_end

  private body: SceneObject | null = null
  private _onDismiss = new Event<void>()
  get onDismiss(): PublicApi<void> {
    return this._onDismiss.publicApi()
  }
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  show(): void {
    if (!this.body) this.build()
    ;(this.body as SceneObject).enabled = true
  }

  hide(): void {
    if (this.body) this.body.enabled = false
  }

  private build(): void {
    const card = makeCardBody(this.sceneObject, "SafetyNoticeCard", this.widthCm, 1.4, 0.6, "center", true)
    this.body = card.body
    const inner = this.widthCm - 2.8
    // Two text sizes only: header (HEADER_EM_CM) and body (textEmCm, default 1.0 cm). Body covers the app name,
    // the notice line and the Dismiss label; all are in real cm via cardEm so they keep their size if the card is rescaled.
    const em = cardEm(this.sceneObject, this.textEmCm)
    addCardHeader(card.content, "SafetyHeader", "Safety", inner, this.sceneObject)
    addFitText(card.content, "SafetyAppName", "MWNP No-Guess Field Assistant", inner, em, {color: TEXT_SOFT})

    const gap = 0.8
    const iconW = Math.max(2.4, em * 1.3)
    const btnW = textWidthCm(this.dismissLabel, em) + 3
    const btnH = em * LINE_H + 1.6
    const textW = inner - iconW - btnW - gap * 2 - 0.4
    const noticeLines = estimateLines(this.noticeText, textW, em)
    const noticeH = noticeLines * em * LINE_H
    const row = addFlex(card.content, "Row", FlexDirection.Row, inner, Math.max(btnH, noticeH), gap)

    // Warning icon
    const iconSO = makeObj(row, "WarningIcon")
    const img = iconSO.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = this.warningIcon
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    iconSO.getTransform().setLocalScale(new vec3(iconW, iconW, 1))
    const iconItem = iconSO.createComponent(FlexItem.getTypeName()) as FlexItem
    ;(row.getComponent(FlexLayout.getTypeName()) as FlexLayout).addItems([iconItem])

    addText(row, "NoticeText", this.noticeText, textW, noticeH, {role: "Body", color: COLOR.amber, emCm: em, wrap: true})
    addButton(row, "Btn_DismissSafety", this.dismissLabel, btnW, btnH, () => this._onDismiss.invoke(), {emCm: em})
  }
}
