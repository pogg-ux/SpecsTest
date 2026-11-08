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
import {COLOR, colorForWord, LabelPlate, makeLabelPlate, makeObj, MIN_TEXT_EM_CM, PLATE_EDGE_IDLE, sizeForEmCm, styleLabelText, textWidthCm} from "./MWNPSharedUI"

export interface TagAnchor {
  id: string
  pos: vec3
  rotDeg: number
  infoPos: vec3
  /** Terminal tags only: the terminal strip's top and bottom edges (cabinet cm) and the terminal's order, so the tags can be staggered. */
  strip?: {top: number; bottom: number; index: number}
}

/** A wire's route (cabinet cm): its cream sleeve markers are placed along it, one near each end. */
export interface WireRoute {
  wireName: string
  text: string
  pts: [number, number][]
}

/** A rectangle the sleeves keep off: parts and the spots the technician reaches. */
export interface AvoidRect {
  cx: number
  cy: number
  w: number
  h: number
}

/** Cream sleeve marker look: cream fill, thin tan edge, dark text. */
const SLEEVE_FILL = new vec4(0.98, 0.92, 0.76, 1)
const SLEEVE_EDGE = new vec4(0.72, 0.6, 0.38, 1)
const SLEEVE_TEXT = new vec4(0.16, 0.13, 0.08, 1)

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
/** Right edge (cabinet cm) of the terminal tags, so bubbles and badges for terminals can sit to their right. */
const TS_TAGS_RIGHT = -3.8
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
  noteEmCm: number = 1.0
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

  private tags: {[id: string]: {so: SceneObject; label: Text; plate: LabelPlate; hovered: boolean; leader: SceneObject | null}} = {}
  private wireLabelSOs: {[name: string]: SceneObject} = {}
  private wireEndSOs: {[wireName: string]: SceneObject[]} = {}
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

  private boardNoteSO: SceneObject | null = null

  /** The "Not drawn: ..." footnote along the board's bottom edge. Off by default; the "More" view turns it on. */
  setBoardNoteVisible(visible: boolean): void {
    if (this.boardNoteSO) this.boardNoteSO.enabled = visible
  }

  get boardNoteVisible(): boolean {
    return !!this.boardNoteSO && this.boardNoteSO.enabled
  }

  /** Footprints of the ID tags and wire-number plates in cabinet-local cm (for layout checks). */
  labelBoxes(): LabelBox[] {
    return this.boxes
  }

  build(anchors: TagAnchor[], wireLabels: WireLabel[], note: {text: string; pos: vec3} | null = null, routes: WireRoute[] = [], avoid: AvoidRect[] = []): void {
    // The cabinet may be scaled down to fit the frame: raise each label size (in cabinet cm) so that, after that scale,
    // every label is still at least MIN_TEXT_EM_CM (1.0 cm) tall in the real world.
    const floorEm = MIN_TEXT_EM_CM / Math.max(0.05, this.sceneObject.getTransform().getWorldScale().y)
    this.tagEmCm = Math.max(this.tagEmCm, floorEm)
    this.overlayEmCm = Math.max(this.overlayEmCm, floorEm)
    this.wireEmCm = Math.max(this.wireEmCm, floorEm)
    this.noteEmCm = Math.max(this.noteEmCm, floorEm)
    // Bubbles keep their real width (so their text wraps at words, not mid-word) when the cabinet is scaled down.
    this.overlayMaxWidthCm = this.overlayMaxWidthCm / Math.max(0.05, this.sceneObject.getTransform().getWorldScale().y)
    const pending: {name: string; so: SceneObject; w: number; h: number; pts: [number, number][]; fromEnd: boolean}[] = []
    for (const wl of wireLabels) {
      const so = makeObj(this.sceneObject, wl.name, wl.pos)
      this.wireLabelSOs[wl.name] = so
      const t = this.makeLabel(makeObj(so, "Label", new vec3(0, 0, 0.05)), wl.text, this.wireEmCm, 4)
      styleLabelText(t, SLEEVE_TEXT)
      const w = textWidthCm(wl.text, this.wireEmCm, true) + PAD_X
      const h = this.wireEmCm * PLATE_H
      makeLabelPlate(so, w, h, SLEEVE_EDGE, -0.06, SLEEVE_FILL)
      const route = routes.filter((r) => r.wireName === wl.name)[0]
      if (route) {
        // With a route the sleeve is placed on the wire after the tags are placed (see placeSleeves); the twin goes near the other end.
        const twinName = "WireEnd_" + wl.name
        const tso = makeObj(this.sceneObject, twinName, wl.pos)
        const tt = this.makeLabel(makeObj(tso, "Label", new vec3(0, 0, 0.05)), wl.text, this.wireEmCm, 4)
        styleLabelText(tt, SLEEVE_TEXT)
        makeLabelPlate(tso, w, h, SLEEVE_EDGE, -0.06, SLEEVE_FILL)
        this.wireEndSOs[wl.name] = [tso]
        pending.push({name: wl.name, so, w, h, pts: route.pts, fromEnd: false})
        pending.push({name: twinName, so: tso, w, h, pts: route.pts, fromEnd: true})
      } else {
        this.boxes.push({name: wl.name, cx: wl.pos.x, cy: wl.pos.y, w, h})
      }
    }
    if (note) {
      // Footnote: hidden in the default view, shown only through setBoardNoteVisible (the "More" view).
      const so = makeObj(this.sceneObject, "BoardNote", note.pos)
      const box = this.boxFor(note.text, this.noteEmCm, 44)
      const t = this.makeLabel(makeObj(so, "Label", new vec3(0, 0, 0.05)), note.text, this.noteEmCm, box.w, box.h > this.noteEmCm * 1.5)
      t.layoutRect = Rect.create(-box.w / 2, box.w / 2, -box.h / 2, box.h / 2)
      styleLabelText(t)
      makeLabelPlate(so, box.w + 0.4, box.h)
      so.enabled = false
      this.boardNoteSO = so
    }
    const em = this.tagEmCm
    for (const a of anchors) {
      const w = textWidthCm(a.id, em, true) + PAD_X
      const h = em * PLATE_H
      // Where the tag actually sits (cabinet cm). With every label showing, tags must stay off the probe points, F1 IN / OUT and
      // the S1 toggle, and off each other: the terminal tags are staggered above and below the strip (the far ones get a
      // leader line to their terminal); F1's tag moves beside its fuse; the L1 / L2 tags clear the S1 toggle.
      let pos = a.pos
      let leader: {x: number; y0: number; y1: number} | null = null
      if (a.strip) {
        const gap = 0.3
        const len = w // the tag is vertical: its length is the plate's width
        if (a.strip.index === 0) {
          pos = new vec3(a.pos.x - 0.5, a.strip.bottom - gap - len / 2, a.pos.z) // below the strip, nudged away from S1
        } else if (a.strip.index % 2 === 1) {
          pos = new vec3(a.pos.x, a.strip.top + gap + len / 2, a.pos.z + 1.5) // just above the strip (in front of the PS1 box)
        } else {
          const y = a.strip.top + gap + len + gap + len / 2 // a second row above, with a leader line down to the terminal
          pos = new vec3(a.pos.x, y, a.pos.z + 1.5)
          leader = {x: a.pos.x, y0: a.strip.top, y1: y - len / 2 - 0.06} // stops 0.6 mm short of the tag, so the two never overlap
        }
      } else if (a.id === "F1") {
        pos = new vec3(a.pos.x - 0.75 - 0.3 - w / 2, a.pos.y, a.pos.z) // beside the fuse, off F1 IN / OUT
      } else if (a.id === "F2") {
        pos = new vec3(a.pos.x + 0.75 + 0.3 + w / 2, a.pos.y, a.pos.z) // beside the fuse, on the free side (the space left of F2 is only 1.75 cm, F1 is there)
      } else if (a.id === "S1") {
        // Right beside the toggle, never on it: the tag's left edge clears the toggle's key area (right edge at -8.8 cm) by 0.2 cm.
        pos = new vec3(Math.max(a.pos.x, -8.8 + 0.2 + w / 2), a.pos.y, a.pos.z)
      } else if (a.id === "L1" || a.id === "L2") {
        // Clear of the S1 toggle, and nudged away from it (L1 up, L2 down) so the S1 tag fits between them, right beside the toggle.
        pos = new vec3(Math.max(a.pos.x, -8.5 + w / 2), a.pos.y + (a.id === "L1" ? 0.8 : -0.7), a.pos.z)
      }
      // S1: the tag stays at its anchor, directly right of the toggle's plate.
      const so = makeObj(this.sceneObject, "Tag_" + a.id, pos)
      let leaderSO: SceneObject | null = null
      if (leader) {
        leaderSO = makeObj(this.sceneObject, "TagLeader_" + a.id, new vec3(leader.x, (leader.y0 + leader.y1) / 2, a.pos.z - 0.8))
        makeLabelPlate(leaderSO, 0.16, Math.max(0.2, leader.y1 - leader.y0), PLATE_EDGE_IDLE, 0)
        this.boxes.push({name: "TagLeader_" + a.id, cx: leader.x, cy: (leader.y0 + leader.y1) / 2, w: 0.3, h: leader.y1 - leader.y0}) // sleeves keep off the leader line too
      }
      if (a.rotDeg !== 0) so.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0, (a.rotDeg * Math.PI) / 180))
      // Printed label: pure white bold text on a dark plate (terminal labels are vertical, as on the panel drawing).
      const plate = makeLabelPlate(so, w, h)
      const label = this.makeLabel(makeObj(so, "Label", new vec3(0, 0, 0.05)), a.id, em, w)
      styleLabelText(label)
      const rotated = Math.abs(a.rotDeg % 180) === 90
      this.boxes.push({name: "Tag_" + a.id, cx: pos.x, cy: pos.y, w: rotated ? h : w, h: rotated ? w : h})
      // Invisible pinch target the size of the plate.
      const col = so.createComponent("Physics.ColliderComponent") as ColliderComponent
      const shape = Shape.createBoxShape()
      shape.size = new vec3(w, h, 1.0)
      col.shape = shape
      col.fitVisual = false // like UIKit's own colliders: never re-fit to a visual
      const tag = {so, label, plate, hovered: false, leader: leaderSO}
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
    this.placeSleeves(pending, avoid)
  }

  /**
   * Places each wire's two cream sleeves ON the wire, the first near its start and the twin near its end: walking along the route from that
   * end, the first spot where the sleeve is inside the backplate and clear of every tag, every sleeve already placed, the key spots and the
   * parts. Falls back to the spot nearest the end (and says so in the log) if a wire has no clear spot.
   */
  private placeSleeves(pending: {name: string; so: SceneObject; w: number; h: number; pts: [number, number][]; fromEnd: boolean}[], avoid: AvoidRect[]): void {
    const margin = 21.3
    for (const p of pending) {
      const pts = p.fromEnd ? p.pts.slice().reverse() : p.pts.slice()
      const fits = (x: number, y: number): boolean => {
        if (Math.abs(x) + p.w / 2 > margin || Math.abs(y) + p.h / 2 > margin) return false
        for (const o of this.boxes) if (Math.abs(x - o.cx) < (p.w + o.w) / 2 + 0.1 && Math.abs(y - o.cy) < (p.h + o.h) / 2 + 0.1) return false
        for (const a of avoid) if (Math.abs(x - a.cx) < (p.w + a.w) / 2 + 0.1 && Math.abs(y - a.cy) < (p.h + a.h) / 2 + 0.1) return false
        return true
      }
      let total = 0
      for (let k = 0; k < pts.length - 1; k++) total += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1])
      const at = (d: number): [number, number] => {
        let left = d
        for (let k = 0; k < pts.length - 1; k++) {
          const len = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1])
          if (left <= len) {
            const f = left / Math.max(0.001, len)
            return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f]
          }
          left -= len
        }
        return pts[pts.length - 1]
      }
      let chosen: [number, number] | null = null
      for (let d = 0.9; d <= total && !chosen; d += 0.3) {
        const c = at(d)
        if (fits(c[0], c[1])) chosen = c
      }
      if (!chosen && p.fromEnd) {
        // A short wire has room for one sleeve only (the other end is taken by a probe point, a lamp or another label): drop the twin.
        p.so.destroy()
        const wireName = p.name.substring("WireEnd_".length)
        this.wireEndSOs[wireName] = (this.wireEndSOs[wireName] || []).filter((s) => s !== p.so)
        print("[PartTags] " + p.name + ": no clear spot, one sleeve only")
        continue
      }
      if (!chosen) {
        chosen = at(Math.min(1.9, total))
        print("[PartTags] no clear spot for " + p.name + "; left near the end of its wire")
      }
      // z 2.2: in front of the wire tubes (top at 1.23), the focus wire (1.43) and the trace overlays (1.73), so a sleeve on a traced wire is not hidden.
      p.so.getTransform().setLocalPosition(new vec3(chosen[0], chosen[1], 2.2))
      this.boxes.push({name: p.name, cx: chosen[0], cy: chosen[1], w: p.w, h: p.h})
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

  /**
   * Label focus ("Labels: This step only"): only the tags in `tagIds` and the wire label named `wireName` show; every
   * other tag and wire label hides. `null` shows them all (start screen, "Always on").
   */
  setLabelFocus(tagIds: string[] | null, wireName: string | null): void {
    for (const id of Object.keys(this.tags)) {
      const on = !tagIds || tagIds.indexOf(id) >= 0
      this.tags[id].so.enabled = on
      const l = this.tags[id].leader
      if (l) l.enabled = on
    }
    for (const name of Object.keys(this.wireLabelSOs)) this.wireLabelSOs[name].enabled = !tagIds || name === wireName
    for (const name of Object.keys(this.wireEndSOs)) for (const so of this.wireEndSOs[name]) so.enabled = !tagIds || name === wireName
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
    // Terminal readings: the bubble sits at the cabinet's spot, in the open space right of the PS1 wires.
    if (pointId.indexOf("TS-") === 0) pos = new vec3(pos.x, pos.y, pos.z + 0.5)
    // F1's tag sits beside its fuse (left): the bubble goes to the right of the fuse row, over the empty fuse spots, not over the tag.
    if (pointId.indexOf("F1:") === 0) pos = new vec3(-6.8 + box.w / 2, pos.y, pos.z + 0.5)
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
    const bw = textWidthCm(text, this.overlayEmCm, true) + PAD_X
    // Terminal readings sit to the right of the terminal tags (which are staggered above the strip), not on them.
    if (pointId.indexOf("TS-") === 0) pos = new vec3(TS_TAGS_RIGHT + 0.5 + bw / 2, pos.y, pos.z + 0.5)
    const f1Tag = pointId.indexOf("F1:") === 0 ? this.boxes.filter((b) => b.name === "Tag_F1")[0] : null
    if (f1Tag) pos = new vec3(f1Tag.cx - f1Tag.w / 2 - 0.3 - bw / 2, pos.y, pos.z + 0.5)
    b.so.getTransform().setLocalPosition(pos)
    this.popBadge(b.so)
    b.plate.setSize(bw, this.overlayEmCm * 1.5)
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

  /** Point ids that currently have a badge showing (for undo). */
  getBadgeIds(): string[] {
    return Object.keys(this.badges).filter((k) => this.badges[k].so.enabled)
  }

  /** Removes one point's badge (undo of that reading). */
  removeBadge(pointId: string): void {
    if (this.badges[pointId]) this.badges[pointId].so.enabled = false
    delete this.badgeTexts[pointId]
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
