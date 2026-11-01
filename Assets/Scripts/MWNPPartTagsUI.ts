// MWNPPartTagsUI.ts — all text that lives ON the trainer model.
//
// Owns: component ID tags (printed on each part, as on the panel drawing, with an invisible pinch target that
// highlights on hover), wire-number labels, the board footnote, the single "Expected …" tag beside the active
// test point, per-point result badges ("12.1 V ✓"), and the tag-info bubble (e.g. TS-3 spare).
// Every label is pure white bold text on a small backing plate (the cards' 90% smoke-gray with a thin bright
// edge), so it reads over the light board and the backdrop: idle labels are never dimmed; active / relevant
// ones turn amber (#FFB800) with an amber edge; pass / fail badges are green (#00FF66) / red (#FF3B30);
// wire-number plates carry the wire's color on their edge.
// Positions come from MWNPCabinet's layout (this object is a child of the cabinet root with
// identity transform, so cabinet-local positions apply directly).
// Text sizes are physical (em height in cm) so they read from the ~100 cm working distance:
// ID tags tagEmCm (≥1.5 cm), overlays overlayEmCm, wire labels wireEmCm.
// API: build(), setTagState(), showExpected(), hideExpected(), setBadge(), clearBadges(),
//      showTagInfo(), labelBoxes(), readable fields, onTagPinched(id).
// Must not: decide expected values or pass/fail — Main passes finished strings.
// Test handles: "Tag_<ID>" (e.g. "Tag_TS-3"), "WireLabel_<wire>_<n>", "ExpectedTag", "Badge_<pointId>", "TagInfo",
//               "BoardNote"; each has a "Label" (Text) and a "LabelPlate" child.

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {COLOR, colorForWord, LabelPlate, makeLabelPlate, makeObj, PLATE_EDGE_IDLE, sizeForEmCm, styleLabelText, textWidthCm} from "./MWNPSharedUI"

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

/** A label's footprint on the board, in cabinet-local cm (axis-aligned, rotation applied). */
export interface LabelBox {
  name: string
  cx: number
  cy: number
  w: number
  h: number
}

/** Approximate advance width of one character, as a fraction of the em height (for wrapped bubbles). */
const CHAR_W = 0.6
const LINE_H = 1.2
/** Padding around label text inside its plate, cm. */
const PAD_X = 0.7
const PLATE_H = 1.3 // plate height as a multiple of the text's em height

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
  @widget(new ColorWidget())
  @hint("Edge color of the plate behind +12 V wire numbers")
  supplyWireColor: vec4 = new vec4(1.0, 0.16, 0.12, 1)
  @input
  @widget(new ColorWidget())
  @hint("Edge color of the plate behind 0 V return wire numbers")
  returnWireColor: vec4 = new vec4(0.22, 0.42, 1.0, 1)
  @ui.group_end

  // Readable state for tests
  expectedPointId: string = ""
  expectedText: string = ""
  badgeTexts: {[pointId: string]: string} = {}
  tagStates: {[id: string]: string} = {}
  tagInfoText: string = ""

  private tags: {[id: string]: {so: SceneObject; label: Text; plate: LabelPlate; hovered: boolean}} = {}
  private anchors: {[id: string]: TagAnchor} = {}
  private boxes: LabelBox[] = []
  private expectedSO: SceneObject | null = null
  private expectedPlate: LabelPlate | null = null
  private expectedLabel: Text | null = null
  private badges: {[pointId: string]: {so: SceneObject; plate: LabelPlate; label: Text}} = {}
  private infoSO: SceneObject | null = null
  private infoPlate: LabelPlate | null = null
  private infoLabel: Text | null = null
  private _onTagPinched = new Event<string>()
  get onTagPinched(): PublicApi<string> {
    return this._onTagPinched.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  /** Footprints of the ID tags and wire-number plates in cabinet-local cm (for layout checks). */
  labelBoxes(): LabelBox[] {
    return this.boxes
  }

  build(anchors: TagAnchor[], wireLabels: WireLabel[], note: {text: string; pos: vec3} | null = null): void {
    for (const wl of wireLabels) {
      const so = makeObj(this.sceneObject, wl.name, wl.pos)
      const t = this.makeLabel(makeObj(so, "Label", new vec3(0, 0, 0.05)), wl.text, this.wireEmCm, 4)
      styleLabelText(t)
      const w = textWidthCm(wl.text, this.wireEmCm, true) + PAD_X
      const h = this.wireEmCm * PLATE_H
      makeLabelPlate(so, w, h, wl.isReturn ? this.returnWireColor : this.supplyWireColor)
      this.boxes.push({name: wl.name, cx: wl.pos.x, cy: wl.pos.y, w, h})
    }
    if (note) {
      const so = makeObj(this.sceneObject, "BoardNote", note.pos)
      const t = this.makeLabel(makeObj(so, "Label", new vec3(0, 0, 0.05)), note.text, this.noteEmCm, 44)
      styleLabelText(t)
      makeLabelPlate(so, textWidthCm(note.text, this.noteEmCm, true) + 1.0, this.noteEmCm * 1.7)
    }
    const em = this.tagEmCm
    for (const a of anchors) {
      const w = textWidthCm(a.id, em, true) + PAD_X
      const h = em * PLATE_H
      const so = makeObj(this.sceneObject, "Tag_" + a.id, a.pos)
      if (a.rotDeg !== 0) so.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0, (a.rotDeg * Math.PI) / 180))
      // Printed label: pure white bold text on a dark plate (terminal labels are vertical, as on the panel drawing).
      const plate = makeLabelPlate(so, w, h)
      const label = this.makeLabel(makeObj(so, "Label", new vec3(0, 0, 0.05)), a.id, em, w)
      styleLabelText(label)
      const rotated = Math.abs(a.rotDeg % 180) === 90
      this.boxes.push({name: "Tag_" + a.id, cx: a.pos.x, cy: a.pos.y, w: rotated ? h : w, h: rotated ? w : h})
      // Invisible pinch target the size of the plate.
      const col = so.createComponent("Physics.ColliderComponent") as ColliderComponent
      const shape = Shape.createBoxShape()
      shape.size = new vec3(w, h, 1.0)
      col.shape = shape
      col.fitVisual = false // like UIKit's own colliders: never re-fit to a visual
      const tag = {so, label, plate, hovered: false}
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

  /**
   * "dim" (idle) | "relevant" | "active". Idle tags stay at full brightness (white); relevant and active ones are
   * amber with an amber edge; a tag under the pointer shows cyan.
   */
  setTagState(id: string, state: string): void {
    const h = this.tags[id]
    if (!h) return
    this.tagStates[id] = state
    const lit = state === "active" || state === "relevant"
    h.label.textFill.color = h.hovered ? COLOR.cyan : lit ? COLOR.amber : COLOR.white
    h.plate.setEdge(lit ? COLOR.amber : PLATE_EDGE_IDLE)
  }

  /** Back to the idle look for every tag (New job). */
  resetTags(): void {
    for (const id of Object.keys(this.tags)) this.setTagState(id, "dim")
  }

  showExpected(pointId: string, pos: vec3, text: string): void {
    if (!this.expectedSO) {
      this.expectedSO = makeObj(this.sceneObject, "ExpectedTag")
      this.expectedPlate = makeLabelPlate(this.expectedSO, 4, 2, COLOR.amber)
      const l = makeObj(this.expectedSO, "Label", new vec3(0, 0, 0.3))
      this.expectedLabel = this.makeLabel(l, "", this.overlayEmCm, this.overlayMaxWidthCm - 0.8, true)
      styleLabelText(this.expectedLabel)
    }
    const box = this.boxFor(text, this.overlayEmCm, this.overlayMaxWidthCm)
    this.expectedSO.enabled = true
    this.expectedSO.getTransform().setLocalPosition(pos)
    ;(this.expectedPlate as LabelPlate).setSize(box.w, box.h)
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

  /** Small badge at the point: value + ✓ / ✗ / ?, colored per class (green / red text and edge). */
  setBadge(pointId: string, pos: vec3, text: string, colorWord: string): void {
    let b = this.badges[pointId]
    if (!b) {
      const so = makeObj(this.sceneObject, "Badge_" + pointId)
      const plate = makeLabelPlate(so, 4, 2)
      const label = this.makeLabel(makeObj(so, "Label", new vec3(0, 0, 0.3)), "", this.overlayEmCm, 12)
      styleLabelText(label)
      b = {so, plate, label}
      this.badges[pointId] = b
    }
    b.so.enabled = true
    b.so.getTransform().setLocalPosition(pos)
    this.popBadge(b.so)
    b.plate.setSize(textWidthCm(text, this.overlayEmCm, true) + PAD_X, this.overlayEmCm * 1.5)
    b.label.text = text
    const c = colorForWord(colorWord)
    b.label.textFill.color = c
    b.plate.setEdge(c)
    this.badgeTexts[pointId] = text
    if (this.expectedPointId === pointId) this.hideExpected()
  }

  private pops: {so: SceneObject; t0: number}[] = []

  /** Badges pop in gently: scale 0.75 -> 1 with an ease-out over 0.2 s. */
  private popBadge(so: SceneObject): void {
    so.getTransform().setLocalScale(new vec3(0.75, 0.75, 0.75))
    this.pops = this.pops.filter((p) => p.so !== so)
    this.pops.push({so, t0: getTime()})
    if (!this.popEvent) {
      const ev = this.createEvent("UpdateEvent")
      ev.bind(() => {
        for (const p of this.pops) {
          if (isNull(p.so)) continue
          const k = Math.min(1, (getTime() - p.t0) / 0.2)
          const s = 0.75 + 0.25 * (1 - (1 - k) * (1 - k))
          p.so.getTransform().setLocalScale(new vec3(s, s, s))
        }
        this.pops = this.pops.filter((p) => !isNull(p.so) && getTime() - p.t0 < 0.2)
        if (this.pops.length === 0) ev.enabled = false
      })
      this.popEvent = ev
    } else this.popEvent.enabled = true
  }
  private popEvent: SceneEvent | null = null

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
      this.infoPlate = makeLabelPlate(this.infoSO, 4, 2)
      const l = makeObj(this.infoSO, "Label", new vec3(0, 0, 0.3))
      this.infoLabel = this.makeLabel(l, "", this.overlayEmCm, maxW - 0.8, true)
      styleLabelText(this.infoLabel)
    }
    const box = this.boxFor(text, this.overlayEmCm, maxW)
    this.infoSO.enabled = true
    this.infoSO.getTransform().setLocalPosition(a.infoPos)
    ;(this.infoPlate as LabelPlate).setSize(box.w, box.h)
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
