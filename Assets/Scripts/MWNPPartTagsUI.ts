// MWNPPartTagsUI.ts — all text that lives ON the trainer model.
//
// Owns: component ID tags (outlined text printed on each part, as on the panel drawing, with an
// invisible pinch target that highlights on hover; dim until relevant), wire-number labels,
// the board footnote, the single "Expected …" tag beside the active test point, per-point
// result badges ("12.1 V ✓"), and the tag-info bubble (e.g. TS-3 spare).
// Positions come from MWNPCabinet's layout (this object is a child of the cabinet root with
// identity transform, so cabinet-local positions apply directly).
// Text sizes are physical (em height in cm) so they read from the ~100 cm working distance:
// ID tags tagEmCm (≥1.5 cm), overlays overlayEmCm, wire labels wireEmCm.
// API: build(), setTagState(), showExpected(), hideExpected(), setBadge(), clearBadges(),
//      showTagInfo(), readable fields, onTagPinched(id).
// Must not: decide expected values or pass/fail — Main passes finished strings.
// Test handles: "Tag_<ID>" (e.g. "Tag_TS-3"), "ExpectedTag", "Badge_<pointId>", "TagInfo", "BoardNote".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {COLOR, colorForWord, makeObj, sizeForEmCm} from "./MWNPSharedUI"

export interface TagAnchor {
  id: string
  pos: vec3
  rotDeg: number
  infoPos: vec3
}

export interface WireLabel {
  name: string
  text: string
  pos: vec3
  isReturn: boolean
}

/** Approximate advance width of one character, as a fraction of the em height. */
const CHAR_W = 0.6
const LINE_H = 1.2

@component
export class MWNPPartTagsUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Part Tags – ID tags, wire labels, expected tags and badges</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(1.0, 2.5, 0.1))
  @hint("ID tag text size: em height in cm (≥1.5 to read from 100 cm)")
  tagEmCm: number = 1.5
  @input
  @widget(new SliderWidget(0, 0.5, 0.01))
  @hint("Dark outline around ID tag text (keeps it readable on any part color)")
  tagOutline: number = 0.22
  @input
  @widget(new SliderWidget(0.6, 2.0, 0.1))
  @hint("Expected tag / badge / info text size: em height in cm")
  overlayEmCm: number = 1.0
  @input
  @widget(new SliderWidget(0.6, 2.0, 0.1))
  @hint("Wire number text size: em height in cm")
  wireEmCm: number = 1.0
  @input
  @widget(new SliderWidget(0.3, 1.5, 0.05))
  @hint("Board footnote text size: em height in cm")
  noteEmCm: number = 0.6
  @input
  @widget(new SliderWidget(6, 16, 0.5))
  @hint("Max width of the expected tag / info bubble before wrapping (cm)")
  overlayMaxWidthCm: number = 8.6
  @input
  @widget(new SliderWidget(0.1, 1, 0.05))
  @hint("Opacity of tag labels that are not relevant yet")
  dimAlpha: number = 0.55
  @input
  @widget(new ColorWidget())
  @hint("Wire label color for +12 V conductors")
  supplyWireColor: vec4 = new vec4(1.0, 0.16, 0.12, 1)
  @input
  @widget(new ColorWidget())
  @hint("Wire label color for 0 V return conductors")
  returnWireColor: vec4 = new vec4(0.22, 0.42, 1.0, 1)
  @input
  @widget(new ColorWidget())
  @hint("Board footnote color")
  noteColor: vec4 = new vec4(0.3, 0.32, 0.36, 1)
  @ui.group_end

  // Readable state for tests
  expectedPointId: string = ""
  expectedText: string = ""
  badgeTexts: {[pointId: string]: string} = {}
  tagStates: {[id: string]: string} = {}
  tagInfoText: string = ""

  private tags: {[id: string]: {so: SceneObject; label: Text; hovered: boolean}} = {}
  private anchors: {[id: string]: TagAnchor} = {}
  private expectedSO: SceneObject | null = null
  private expectedPlate: BackPlate | null = null
  private expectedLabel: Text | null = null
  private badges: {[pointId: string]: {so: SceneObject; plate: BackPlate; label: Text}} = {}
  private infoSO: SceneObject | null = null
  private infoPlate: BackPlate | null = null
  private infoLabel: Text | null = null
  private _onTagPinched = new Event<string>()
  get onTagPinched(): PublicApi<string> {
    return this._onTagPinched.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  build(anchors: TagAnchor[], wireLabels: WireLabel[], note: {text: string; pos: vec3} | null = null): void {
    for (const wl of wireLabels) {
      const so = makeObj(this.sceneObject, wl.name, wl.pos)
      const t = this.makeLabel(so, wl.text, this.wireEmCm, 4)
      t.textFill.color = wl.isReturn ? this.returnWireColor : this.supplyWireColor
    }
    if (note) {
      const so = makeObj(this.sceneObject, "BoardNote", note.pos)
      const t = this.makeLabel(so, note.text, this.noteEmCm, 44)
      t.textFill.color = this.noteColor
    }
    const em = this.tagEmCm
    for (const a of anchors) {
      const w = a.id.length * CHAR_W * em + 0.6
      const h = em * 1.1
      const so = makeObj(this.sceneObject, "Tag_" + a.id, a.pos)
      if (a.rotDeg !== 0) so.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0, (a.rotDeg * Math.PI) / 180))
      // Printed label: light text with a dark outline so it reads on red, blue, white, cream and gray parts.
      const label = this.makeLabel(makeObj(so, "Label", new vec3(0, 0, 0.05)), a.id, em, w)
      label.outlineSettings.enabled = true
      label.outlineSettings.size = this.tagOutline
      label.outlineSettings.fill.color = new vec4(0.1, 0.1, 0.12, 1)
      // Invisible pinch target the size of the label.
      const col = so.createComponent("Physics.ColliderComponent") as ColliderComponent
      const shape = Shape.createBoxShape()
      shape.size = new vec3(w, h, 1.0)
      col.shape = shape
      col.fitVisual = false // like UIKit's own colliders: never re-fit to a visual
      const tag = {so, label, hovered: false}
      const it = so.createComponent(Interactable.getTypeName()) as Interactable
      it.onTriggerEnd.add(() => this._onTagPinched.invoke(a.id))
      it.onHoverEnter.add(() => {
        tag.hovered = true
        this.setTagState(a.id, this.tagStates[a.id])
      })
      it.onHoverExit.add(() => {
        tag.hovered = false
        this.setTagState(a.id, this.tagStates[a.id])
      })
      this.tags[a.id] = tag
      this.anchors[a.id] = a
      this.setTagState(a.id, "dim")
    }
  }

  /** "dim" | "relevant" | "active" */
  setTagState(id: string, state: string): void {
    const h = this.tags[id]
    if (!h) return
    this.tagStates[id] = state
    const c = h.hovered || state === "active" ? COLOR.cyan : state === "relevant" ? COLOR.amber : COLOR.white
    h.label.textFill.color = new vec4(c.x, c.y, c.z, state === "dim" && !h.hovered ? this.dimAlpha : 1)
  }

  showExpected(pointId: string, pos: vec3, text: string): void {
    if (!this.expectedSO) {
      this.expectedSO = makeObj(this.sceneObject, "ExpectedTag")
      this.expectedPlate = this.expectedSO.createComponent(BackPlate.getTypeName()) as BackPlate
      this.expectedPlate.style = "dark"
      const l = makeObj(this.expectedSO, "Label", new vec3(0, 0, 0.6))
      this.expectedLabel = this.makeLabel(l, "", this.overlayEmCm, this.overlayMaxWidthCm - 0.8, true)
      this.expectedLabel.textFill.color = COLOR.cyan
    }
    const box = this.boxFor(text, this.overlayEmCm, this.overlayMaxWidthCm)
    this.expectedSO.enabled = true
    this.expectedSO.getTransform().setLocalPosition(pos)
    ;(this.expectedPlate as BackPlate).size = new vec2(box.w, box.h)
    const lbl = this.expectedLabel as Text
    lbl.layoutRect = Rect.create(-(box.w - 0.8) / 2, (box.w - 0.8) / 2, -box.h / 2, box.h / 2)
    // Display only: break before the condition so it reads "Expected 12 V" / "(S1 UP)".
    lbl.text = box.h > this.overlayEmCm * 1.6 ? text.replace(" (", "\n(") : text
    this.expectedPointId = pointId
    this.expectedText = text
  }

  hideExpected(): void {
    if (this.expectedSO) this.expectedSO.enabled = false
    this.expectedPointId = ""
    this.expectedText = ""
  }

  /** Small badge at the point: value + ✓ / ✗ / ?, colored per class. */
  setBadge(pointId: string, pos: vec3, text: string, colorWord: string): void {
    let b = this.badges[pointId]
    if (!b) {
      const so = makeObj(this.sceneObject, "Badge_" + pointId)
      const plate = so.createComponent(BackPlate.getTypeName()) as BackPlate
      plate.style = "dark"
      const l = makeObj(so, "Label", new vec3(0, 0, 0.6))
      const label = this.makeLabel(l, "", this.overlayEmCm, 12)
      b = {so, plate, label}
      this.badges[pointId] = b
    }
    b.so.enabled = true
    b.so.getTransform().setLocalPosition(pos)
    b.plate.size = new vec2(text.length * CHAR_W * this.overlayEmCm + 0.8, this.overlayEmCm * 1.5)
    b.label.text = text
    b.label.textFill.color = colorForWord(colorWord)
    this.badgeTexts[pointId] = text
    if (this.expectedPointId === pointId) this.hideExpected()
  }

  clearBadges(): void {
    for (const k of Object.keys(this.badges)) this.badges[k].so.enabled = false
    this.badgeTexts = {}
  }

  showTagInfo(id: string, text: string): void {
    const a = this.anchors[id]
    if (!a) return
    const maxW = this.overlayMaxWidthCm + 4.4
    if (!this.infoSO) {
      this.infoSO = makeObj(this.sceneObject, "TagInfo")
      this.infoPlate = this.infoSO.createComponent(BackPlate.getTypeName()) as BackPlate
      this.infoPlate.style = "dark"
      const l = makeObj(this.infoSO, "Label", new vec3(0, 0, 0.6))
      this.infoLabel = this.makeLabel(l, "", this.overlayEmCm, maxW - 0.8, true)
      this.infoLabel.textFill.color = COLOR.white
    }
    const box = this.boxFor(text, this.overlayEmCm, maxW)
    this.infoSO.enabled = true
    this.infoSO.getTransform().setLocalPosition(a.infoPos)
    ;(this.infoPlate as BackPlate).size = new vec2(box.w, box.h)
    const lbl = this.infoLabel as Text
    lbl.layoutRect = Rect.create(-(box.w - 0.8) / 2, (box.w - 0.8) / 2, -box.h / 2, box.h / 2)
    lbl.text = text
    this.tagInfoText = text
  }

  hideTagInfo(): void {
    if (this.infoSO) this.infoSO.enabled = false
    this.tagInfoText = ""
  }

  /** Plate size for text wrapped to at most maxW cm wide. */
  private boxFor(text: string, em: number, maxW: number): {w: number; h: number} {
    const oneLine = text.length * CHAR_W * em + 0.8
    if (oneLine <= maxW) return {w: oneLine, h: em * 1.5}
    const lines = Math.ceil((text.length * CHAR_W * em) / (maxW - 0.8)) + 0.4 // word-wrap slack
    return {w: maxW, h: Math.ceil(lines) * em * LINE_H + em * 0.6}
  }

  private makeLabel(so: SceneObject, text: string, emCm: number, w: number, wrap: boolean = false): Text {
    const t = so.createComponent("Component.Text") as Text
    t.text = text
    t.depthTest = true
    t.size = sizeForEmCm(emCm)
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = wrap ? HorizontalOverflow.Wrap : HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-w / 2, w / 2, -emCm, emCm)
    return t
  }
}
