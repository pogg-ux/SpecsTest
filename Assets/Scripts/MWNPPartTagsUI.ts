// MWNPPartTagsUI.ts — all text that lives ON the trainer model.
//
// Owns: component ID tags (small UIKit Buttons — pinchable, dim until relevant),
// wire-number labels, the single "Expected …" tag beside the active test point,
// per-point result badges ("12.1 V ✓"), and the tag-info bubble (e.g. TS-3 spare).
// Positions come from MWNPCabinet's layout (this object is a child of the cabinet
// root with identity transform, so cabinet-local positions apply directly).
// API: build(), setTagState(), showExpected(), hideExpected(), setBadge(), clearBadges(),
//      showTagInfo(), readable fields, onTagPinched(id).
// Must not: decide expected values or pass/fail — Main passes finished strings.
// Test handles: "Tag_<ID>" (e.g. "Tag_TS-3"), "ExpectedTag", "Badge_<pointId>", "TagInfo".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {addButton, applyTextRole, ButtonHandle, COLOR, colorForWord, makeObj, TextRole} from "./MWNPSharedUI"

export interface TagAnchor {
  id: string
  pos: vec3
  width: number
}

export interface WireLabel {
  name: string
  text: string
  pos: vec3
  isReturn: boolean
}

@component
export class MWNPPartTagsUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Part Tags – ID tags, wire labels, expected tags and badges</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(40, 110, 1))
  @hint("Viewing distance used to size tag text (cm)")
  viewDistanceCm: number = 65
  @input
  @widget(new SliderWidget(0.1, 1, 0.05))
  @hint("Opacity of tag labels that are not relevant yet")
  dimAlpha: number = 0.45
  @input
  @widget(new ColorWidget())
  @hint("Wire label color for +12 V conductors")
  supplyWireColor: vec4 = new vec4(1.0, 0.5, 0.45, 1)
  @input
  @widget(new ColorWidget())
  @hint("Wire label color for 0 V return conductors")
  returnWireColor: vec4 = new vec4(0.55, 0.7, 1.0, 1)
  @ui.group_end

  // Readable state for tests
  expectedPointId: string = ""
  expectedText: string = ""
  badgeTexts: {[pointId: string]: string} = {}
  tagStates: {[id: string]: string} = {}
  tagInfoText: string = ""

  private tags: {[id: string]: ButtonHandle} = {}
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

  build(anchors: TagAnchor[], wireLabels: WireLabel[]): void {
    for (const wl of wireLabels) {
      const so = makeObj(this.sceneObject, wl.name, wl.pos)
      const t = this.makeLabel(so, wl.text, "Caption", 2.0)
      t.textFill.color = wl.isReturn ? this.returnWireColor : this.supplyWireColor
    }
    for (const a of anchors) {
      const h = addButton(this.sceneObject, "Tag_" + a.id, a.id, a.width, 1.3, () => this._onTagPinched.invoke(a.id), {
        role: "Caption",
        distanceCm: this.viewDistanceCm,
        inFlex: false,
      })
      h.so.getTransform().setLocalPosition(a.pos)
      this.tags[a.id] = h
      this.setTagState(a.id, "dim")
    }
  }

  /** "dim" | "relevant" | "active" */
  setTagState(id: string, state: string): void {
    const h = this.tags[id]
    if (!h) return
    this.tagStates[id] = state
    const c = state === "active" ? COLOR.cyan : state === "relevant" ? COLOR.amber : COLOR.white
    h.label.textFill.color = new vec4(c.x, c.y, c.z, state === "dim" ? this.dimAlpha : 1)
  }

  showExpected(pointId: string, pos: vec3, text: string): void {
    if (!this.expectedSO) {
      this.expectedSO = makeObj(this.sceneObject, "ExpectedTag")
      this.expectedPlate = this.expectedSO.createComponent(BackPlate.getTypeName()) as BackPlate
      this.expectedPlate.style = "dark"
      const l = makeObj(this.expectedSO, "Label", new vec3(0, 0, 0.6))
      this.expectedLabel = this.makeLabel(l, "", "Body", 1.6)
      this.expectedLabel.textFill.color = COLOR.cyan
    }
    const w = text.length * 0.36 + 1.4
    this.expectedSO.enabled = true
    this.expectedSO.getTransform().setLocalPosition(pos)
    ;(this.expectedPlate as BackPlate).size = new vec2(w, 1.9)
    ;(this.expectedLabel as Text).text = text
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
      const label = this.makeLabel(l, "", "Caption", 1.3)
      b = {so, plate, label}
      this.badges[pointId] = b
    }
    b.so.enabled = true
    b.so.getTransform().setLocalPosition(pos)
    b.plate.size = new vec2(text.length * 0.3 + 1.0, 1.4)
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
    const h = this.tags[id]
    if (!h) return
    if (!this.infoSO) {
      this.infoSO = makeObj(this.sceneObject, "TagInfo")
      this.infoPlate = this.infoSO.createComponent(BackPlate.getTypeName()) as BackPlate
      this.infoPlate.style = "dark"
      const l = makeObj(this.infoSO, "Label", new vec3(0, 0, 0.6))
      this.infoLabel = this.makeLabel(l, "", "Caption", 1.6)
      this.infoLabel.textFill.color = COLOR.white
    }
    const p = h.so.getTransform().getLocalPosition()
    this.infoSO.enabled = true
    this.infoSO.getTransform().setLocalPosition(new vec3(p.x, p.y - 2.6, p.z + 1.5))
    ;(this.infoPlate as BackPlate).size = new vec2(text.length * 0.3 + 1.4, 2.0)
    ;(this.infoLabel as Text).text = text
    this.tagInfoText = text
  }

  hideTagInfo(): void {
    if (this.infoSO) this.infoSO.enabled = false
    this.tagInfoText = ""
  }

  private makeLabel(so: SceneObject, text: string, role: TextRole, h: number): Text {
    const t = so.createComponent("Component.Text") as Text
    t.text = text
    t.depthTest = true
    applyTextRole(t, role, this.viewDistanceCm)
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-4, 4, -h / 2, h / 2)
    return t
  }
}
