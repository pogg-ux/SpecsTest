// MWNPSharedUI.ts — shared UIKit composition helpers for every MWNP *UI.ts module.
//
// Owns: the type scale, color palette, and small builders (text cell, button,
// flex row/column, BackPlate card body) so each card module stays short.
// Every child is registered with its parent FlexLayout via addItems (UIKit
// does not reliably auto-discover runtime-created children).
//
// Must not: hold state or make decisions. Only UI modules import this file.

import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexAlign, FlexDirection, FlexJustify} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"

// ── Typography (Specs type scale; see specs-build-ui patterns → Typography) ──
const FONT_SIZE_SCALE = 1.0
export type TextRole =
  | "Title1" | "Title2" | "HeadlineXL" | "Headline1" | "Headline2"
  | "Subheadline" | "Button" | "Callout" | "Body" | "Caption"
const TYPE_SCALE: Record<TextRole, {size: number; weight: number}> = {
  Title1: {size: 105, weight: 700}, Title2: {size: 93, weight: 700},
  HeadlineXL: {size: 62, weight: 700}, Headline1: {size: 54, weight: 700},
  Headline2: {size: 48, weight: 700}, Subheadline: {size: 41, weight: 700},
  Button: {size: 39, weight: 500}, Callout: {size: 39, weight: 700},
  Body: {size: 39, weight: 500}, Caption: {size: 38, weight: 500},
}
export function roleSize(role: TextRole, distanceCm: number): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110)
}
/** World-space Text: em-square height in cm = size / 43.886 (StudioLib Text.size docs). */
export const TEXT_SIZE_PER_CM = 43.886
export function sizeForEmCm(emCm: number): number {
  return emCm * TEXT_SIZE_PER_CM
}
export function applyTextRole(t: Text, role: TextRole, distanceCm: number): void {
  t.size = roleSize(role, distanceCm)
  ;(t as Text & {weight?: number}).weight = TYPE_SCALE[role].weight
}

// ── Palette (additive display: nothing near-black) ──
export const COLOR = {
  white: new vec4(1, 1, 1, 1),
  dim: new vec4(1, 1, 1, 1), // card text is pure white; "dim" is kept only so callers need no change
  faint: new vec4(1, 1, 1, 1),
  green: new vec4(0, 1, 0.4, 1), // #00FF66
  red: new vec4(1, 0.231, 0.188, 1), // #FF3B30
  amber: new vec4(1, 0.722, 0, 1), // #FFB800
  orange: new vec4(1, 0.549, 0, 1), // #FF8C00 (traces, schematic highlight)
  cyan: new vec4(0.2, 0.9, 1, 1),
}

export function colorForWord(word: string): vec4 {
  switch (word) {
    case "green": return COLOR.green
    case "red": return COLOR.red
    case "amber": return COLOR.amber
    default: return COLOR.white
  }
}

/** Forward lift for content on top of a BackPlate / Button face (depth tie-break). */
export const CONTENT_Z = 0.6
export const BUTTON_LABEL_Z = 0.08

export function makeObj(parent: SceneObject, name: string, pos?: vec3): SceneObject {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  if (pos) so.getTransform().setLocalPosition(pos)
  return so
}

function register(parent: SceneObject, item: FlexItem): void {
  const layout = parent.getComponent(FlexLayout.getTypeName()) as FlexLayout | null
  if (layout) layout.addItems([item])
}

export interface TextOpts {
  role?: TextRole
  color?: vec4
  align?: "left" | "center" | "right"
  wrap?: boolean
  distanceCm?: number
  /** Overrides role sizing: em height in cm. */
  emCm?: number
  /** Vertical alignment inside the cell (default center). */
  valign?: "top" | "center"
}

/** A Text cell of fixed w×h registered as a FlexItem of `parent`. */
export function addText(parent: SceneObject, name: string, text: string, w: number, h: number, opts?: TextOpts): Text {
  const so = makeObj(parent, name)
  const t = so.createComponent("Component.Text") as Text
  t.text = text
  t.depthTest = true
  applyTextRole(t, opts?.role ?? "Body", opts?.distanceCm ?? 75)
  if (opts?.emCm) t.size = sizeForEmCm(opts.emCm)
  const a = opts?.align ?? "left"
  t.horizontalAlignment =
    a === "left" ? HorizontalAlignment.Left : a === "right" ? HorizontalAlignment.Right : HorizontalAlignment.Center
  t.verticalAlignment = opts?.valign === "top" ? VerticalAlignment.Top : VerticalAlignment.Center
  t.horizontalOverflow = opts?.wrap ? HorizontalOverflow.Wrap : HorizontalOverflow.Overflow
  t.verticalOverflow = VerticalOverflow.Overflow
  t.layoutRect = Rect.create(-w / 2, w / 2, -h / 2, h / 2)
  t.textFill.color = opts?.color ?? COLOR.white
  const item = so.createComponent(FlexItem.getTypeName()) as FlexItem
  item.overrideWidth = w
  item.overrideHeight = h
  item.flexShrink = 0
  register(parent, item)
  return t
}

export interface ButtonHandle {
  so: SceneObject
  button: Button
  label: Text
}

/** UIKit Button with a width-budgeted raw Text label. The SceneObject gets `name` (stable for tests). */
export function addButton(
  parent: SceneObject,
  name: string,
  label: string,
  w: number,
  h: number,
  onClick: () => void,
  opts?: {role?: TextRole; distanceCm?: number; inFlex?: boolean; emCm?: number; wrap?: boolean; bold?: boolean}
): ButtonHandle {
  // A label too long for its button wraps and the button grows (large Text size option).
  if (opts?.emCm && !opts.wrap) {
    const lines = estimateLines(label, w - 1.5, opts.emCm, !!opts.bold)
    if (lines > 1) {
      opts = {...opts, wrap: true}
      h = Math.max(h, lines * opts.emCm * LINE_H + 1.6)
    }
  }
  const so = makeObj(parent, name)
  const btn = so.createComponent(Button.getTypeName()) as Button
  btn.size = new vec3(w, h, 1) // BEFORE init
  const labelSO = makeObj(so, "Label", new vec3(0, 0, BUTTON_LABEL_Z))
  const t = labelSO.createComponent("Component.Text") as Text
  t.text = label
  t.depthTest = true
  applyTextRole(t, opts?.role ?? "Button", opts?.distanceCm ?? 75)
  if (opts?.emCm) t.size = sizeForEmCm(opts.emCm)
  t.horizontalAlignment = HorizontalAlignment.Center
  t.verticalAlignment = VerticalAlignment.Center
  t.horizontalOverflow = opts?.wrap ? HorizontalOverflow.Wrap : HorizontalOverflow.Overflow
  t.verticalOverflow = VerticalOverflow.Overflow
  t.layoutRect = Rect.create(-(w - 0.5) / 2, (w - 0.5) / 2, -h / 2, h / 2)
  t.textFill.color = COLOR.white
  if (opts?.bold) (t as Text & {weight?: number}).weight = 700
  btn.onTriggerUp.add(() => onClick())
  if (opts?.inFlex !== false) {
    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideWidth = w
    item.overrideHeight = h
    item.flexShrink = 0
    register(parent, item)
  }
  return {so, button: btn, label: t}
}

/** Nested flex container registered as an item of its parent. */
export function addFlex(
  parent: SceneObject,
  name: string,
  direction: FlexDirection,
  w: number,
  h: number,
  gap: number,
  opts?: {justify?: FlexJustify; align?: FlexAlign}
): SceneObject {
  const so = makeObj(parent, name, new vec3(0, 0, 0.02))
  const f = so.createComponent(FlexLayout.getTypeName()) as FlexLayout
  f.autoDiscoverItemsOnStart = false // children are registered explicitly via addItems
  f.width = w
  f.height = h
  f.direction = direction
  if (direction === FlexDirection.Row) f.columnGap = gap
  else f.rowGap = gap
  f.justifyContent = opts?.justify ?? FlexJustify.Start
  f.alignItems = opts?.align ?? FlexAlign.Center
  const item = so.createComponent(FlexItem.getTypeName()) as FlexItem
  item.overrideWidth = w
  item.overrideHeight = h
  item.flexShrink = 0
  register(parent, item)
  return so
}

export interface CardBody {
  body: SceneObject
  content: SceneObject
  plate: BackPlate
}

/**
 * Which edge of a card stays at its host's origin when the card's height changes with its text:
 * "center" (default), "top" (card grows downward), "bottom" (card grows upward).
 */
export type CardAnchor = "center" | "top" | "bottom"

/**
 * Translucent smoke-gray card fill (premultiplied alpha: rgb = gray * alpha) so the panel and
 * its wire traces stay visible behind cards that float in front of the cabinet.
 */
export const CARD_FILL_GRAY = 0.16
export const CARD_FILL_ALPHA = 0.9
const CARD_FILL = new vec4(CARD_FILL_GRAY * CARD_FILL_ALPHA, CARD_FILL_GRAY * CARD_FILL_ALPHA, CARD_FILL_GRAY * CARD_FILL_ALPHA, CARD_FILL_ALPHA)
const CARD_FILL_OPAQUE = new vec4(0.2, 0.2, 0.2, 1)

// Session option "Card style": every card plate, existing and future, follows it.
let cardOpaque = false
const allPlates: BackPlate[] = []

export function isCardOpaque(): boolean {
  return cardOpaque
}

function cardFill(): vec4 {
  return cardOpaque ? CARD_FILL_OPAQUE : CARD_FILL
}

export function setCardOpaque(opaque: boolean): void {
  cardOpaque = opaque
  for (let i = allPlates.length - 1; i >= 0; i--) {
    const p = allPlates[i]
    if (isNull(p)) {
      allPlates.splice(i, 1)
      continue
    }
    const rr = (p as any).roundedRectangle
    if (p.initialized && rr) rr.backgroundColor = cardFill()
  }
}

// Session option "Text size": cards build their text at textEm x this factor (their width stays, so they wrap and grow
// downward). Main sets the factor per card host before it rebuilds the card.
const emFactors: {[name: string]: number} = {}
export function setHostEmFactor(hostName: string, f: number): void {
  emFactors[hostName] = f
}
export function getHostEmFactor(hostName: string): number {
  return emFactors[hostName] || 1
}

// Option "Schematic: Enlarged": the schematic host is scaled; it sizes its labels from the host's BASE scale.
const scaleFactors: {[name: string]: number} = {}
export function setHostFactor(hostName: string, f: number): void {
  scaleFactors[hostName] = f
}
export function hostBaseScale(host: SceneObject): number {
  return Math.max(0.05, host.getTransform().getWorldScale().y / (scaleFactors[host.name] || 1))
}

/** Applies the translucent fill once the plate's RoundedRectangle has initialized (BackPlate sets its own color on start). */
function applyTranslucentFill(owner: SceneObject, plate: BackPlate): void {
  const apply = (): boolean => {
    const rr = (plate as any).roundedRectangle
    if (!plate.initialized || !rr) return false
    rr.backgroundColor = cardFill()
    return true
  }
  if (apply()) return
  const sc = owner.getComponent("Component.ScriptComponent") as ScriptComponent
  const ev = sc.createEvent("UpdateEvent")
  ev.bind(() => {
    if (apply()) ev.enabled = false
  })
}

/** A BackPlate card: body (plate) + content (column FlexLayout lifted +0.6). Plate hugs content. */
export function makeCardBody(host: SceneObject, name: string, width: number, pad: number, gap: number, anchor: CardAnchor = "center"): CardBody {
  const body = makeObj(host, name)
  const plate = body.createComponent(BackPlate.getTypeName()) as BackPlate
  plate.style = "simple"
  applyTranslucentFill(body, plate)
  allPlates.push(plate)
  const content = makeObj(body, "Content", new vec3(0, 0, CONTENT_Z))
  const flex = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
  flex.autoDiscoverItemsOnStart = false // children are registered explicitly via addItems
  flex.width = width
  flex.height = -1
  flex.direction = FlexDirection.Column
  flex.justifyContent = FlexJustify.Start
  flex.alignItems = FlexAlign.Center
  flex.rowGap = gap
  flex.paddingTop = pad
  flex.paddingBottom = pad
  flex.paddingLeft = pad
  flex.paddingRight = pad
  flex.onLayoutComplete.add((r) => {
    plate.size = new vec2(r.containerWidth, r.containerHeight)
    const y = anchor === "top" ? -r.containerHeight / 2 : anchor === "bottom" ? r.containerHeight / 2 : 0
    body.getTransform().setLocalPosition(new vec3(0, y, 0))
  })
  return {body, content, plate}
}

/** Hide now, destroy a moment later — never destroy a Button inside its own trigger callback. */
export function deferDestroy(owner: BaseScriptComponent, so: SceneObject): void {
  so.enabled = false
  const ev = owner.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
  ev.bind(() => {
    if (!isNull(so)) so.destroy()
  })
  ev.reset(0.2)
}

/** Formats wall-clock time HH:MM:SS for reading logs. */
export function clockTime(): string {
  const d = new Date()
  const p = (n: number) => (n < 10 ? "0" + n : "" + n)
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds())
}

// ── Text fitting: size a wrapped text cell from its actual words ──

/** Line height as a multiple of the em height. */
export const LINE_H = 1.25

/** Rough per-character advance (fraction of em) for the Lens default font, deliberately a little wide. */
function charAdvance(c: string): number {
  if (c === " ") return 0.28
  if (c >= "A" && c <= "Z") return 0.62
  if (c >= "0" && c <= "9") return 0.55
  if (c >= "a" && c <= "z") return 0.48
  if (".,:;'|!()ilItfj-".indexOf(c) >= 0) return 0.3
  return 0.9 // arrows, check marks, dashes, symbols
}

/** Greedy word-wrap line count for `text` in a cell `widthCm` wide at `emCm` text height. */
export function estimateLines(text: string, widthCm: number, emCm: number, bold: boolean = false): number {
  const k = emCm * (bold ? 1.05 : 1.0)
  let lines = 0
  for (const para of text.split("\n")) {
    let lineW = 0
    let n = 1
    for (const word of para.split(" ")) {
      let ww = 0
      for (const ch of word) ww += charAdvance(ch) * k
      const sp = 0.3 * k
      if (lineW > 0 && lineW + sp + ww > widthCm) {
        n++
        lineW = ww
      } else {
        lineW += (lineW > 0 ? sp : 0) + ww
      }
    }
    lines += n
  }
  return lines
}

/**
 * Sets `text` on a cell made by addText(... wrap: true) and resizes the cell (and its FlexItem, so the
 * card re-lays out) to exactly the lines the text needs, never fewer than `minLines`.
 */
export function fitText(t: Text, text: string, widthCm: number, emCm: number, minLines: number = 1, bold: boolean = false): number {
  const lines = Math.max(minLines, text.length === 0 ? 0 : estimateLines(text, widthCm, emCm, bold))
  const h = Math.max(lines, 0.0001) * emCm * LINE_H
  t.text = text
  t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -h / 2, h / 2)
  const item = t.getSceneObject().getComponent(FlexItem.getTypeName()) as FlexItem
  if (item) item.overrideHeight = h
  return lines
}

/** Width in cm of a single line of `text` at `emCm` text height (same estimate fitText uses). */
export function textWidthCm(text: string, emCm: number, bold: boolean = false): number {
  const k = emCm * (bold ? 1.05 : 1.0)
  let w = 0
  for (const ch of text) w += charAdvance(ch) * k
  return w
}

/** Body text colors for cards: bright enough to read over a translucent plate in a screen recording. */
export const TEXT_BODY = new vec4(1, 1, 1, 1)
export const TEXT_SOFT = new vec4(1, 1, 1, 1)

/**
 * Converts a real-world text height (cm) into card units for a card hosted on `host`
 * (card units are cm before the host's scale), so text keeps its physical size if the card is rescaled.
 */
export function cardEm(host: SceneObject, realCm: number): number {
  return (realCm * getHostEmFactor(host.name)) / hostBaseScale(host)
}

/** A wrapped text cell sized to its words (emLocal in card units). */
export function addFitText(
  parent: SceneObject,
  name: string,
  text: string,
  widthCm: number,
  emLocal: number,
  opts?: {color?: vec4; bold?: boolean; minLines?: number}
): Text {
  const t = addText(parent, name, "", widthCm, emLocal * LINE_H, {emCm: emLocal, color: opts?.color ?? TEXT_BODY, wrap: true, valign: "top"})
  if (opts?.bold) (t as Text & {weight?: number}).weight = 700
  fitText(t, text, widthCm, emLocal, opts?.minLines ?? 1, !!opts?.bold)
  return t
}

// ── Label plates: the backing for every label printed on the model ──

/** Thin bright edge of a label plate when the label is idle (amber when it is active / relevant). */
export const PLATE_EDGE_IDLE = new vec4(0.85, 0.95, 1.0, 1)

export interface LabelPlate {
  so: SceneObject
  /** Width / height in cabinet cm. */
  setSize(w: number, h: number): void
  /** Color of the thin edge. */
  setEdge(color: vec4): void
}

/**
 * A small backing plate in the cards' 90% smoke-gray with a thin bright edge, so text has contrast over the light
 * board and the backdrop. Visual only (no collider, so it never takes a click from the tag's own pinch target).
 * The object is named "LabelPlate" (the display fader looks for that name).
 */
export function makeLabelPlate(parent: SceneObject, w: number, h: number, edge: vec4 = PLATE_EDGE_IDLE, z: number = -0.06): LabelPlate {
  const so = makeObj(parent, "LabelPlate", new vec3(0, 0, z))
  const rr = so.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
  rr.initialize()
  rr.renderMeshVisual.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto
  rr.renderMeshVisual.mainPass.colorMask = new vec4b(true, true, true, true)
  rr.renderOrder = 5
  rr.gradient = false
  rr.backgroundColor = CARD_FILL
  rr.border = true
  rr.borderSize = 0.07
  rr.borderColor = edge
  const apply = (pw: number, ph: number) => {
    rr.cornerRadius = Math.min(0.45, ph / 2)
    rr.size = new vec2(pw, ph)
  }
  apply(w, h)
  return {
    so,
    setSize: apply,
    setEdge: (c: vec4) => {
      rr.borderColor = c
    },
  }
}

/** Label text: pure white, bold, drawn after the plate and the model (text is never lit by the scene). */
export function styleLabelText(t: Text, color: vec4 = new vec4(1, 1, 1, 1)): void {
  ;(t as Text & {weight?: number}).weight = 700
  t.textFill.color = color
  t.outlineSettings.enabled = false
  t.renderOrder = 10
  t.depthTest = true
}

/** The "Library" button every card (except the safety notice) carries; `cardKey` keeps names unique ("Btn_Library_Step"). */
export function addLibraryButton(content: SceneObject, cardKey: string, inner: number, em: number, onClick: () => void): ButtonHandle {
  return addButton(content, "Btn_Library_" + cardKey, "Library", Math.min(10, inner - 2), 3.0, onClick, {emCm: em})
}
