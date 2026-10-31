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
export function applyTextRole(t: Text, role: TextRole, distanceCm: number): void {
  t.size = roleSize(role, distanceCm)
  ;(t as Text & {weight?: number}).weight = TYPE_SCALE[role].weight
}

// ── Palette (additive display: nothing near-black) ──
export const COLOR = {
  white: new vec4(1, 1, 1, 1),
  dim: new vec4(1, 1, 1, 0.6),
  faint: new vec4(1, 1, 1, 0.45),
  green: new vec4(0.45, 0.95, 0.55, 1),
  red: new vec4(1.0, 0.45, 0.42, 1),
  amber: new vec4(1.0, 0.76, 0.28, 1),
  cyan: new vec4(0.5, 0.88, 1.0, 1),
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
}

/** A Text cell of fixed w×h registered as a FlexItem of `parent`. */
export function addText(parent: SceneObject, name: string, text: string, w: number, h: number, opts?: TextOpts): Text {
  const so = makeObj(parent, name)
  const t = so.createComponent("Component.Text") as Text
  t.text = text
  t.depthTest = true
  applyTextRole(t, opts?.role ?? "Body", opts?.distanceCm ?? 75)
  const a = opts?.align ?? "left"
  t.horizontalAlignment =
    a === "left" ? HorizontalAlignment.Left : a === "right" ? HorizontalAlignment.Right : HorizontalAlignment.Center
  t.verticalAlignment = VerticalAlignment.Center
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
  opts?: {role?: TextRole; distanceCm?: number; inFlex?: boolean}
): ButtonHandle {
  const so = makeObj(parent, name)
  const btn = so.createComponent(Button.getTypeName()) as Button
  btn.size = new vec3(w, h, 1) // BEFORE init
  const labelSO = makeObj(so, "Label", new vec3(0, 0, BUTTON_LABEL_Z))
  const t = labelSO.createComponent("Component.Text") as Text
  t.text = label
  t.depthTest = true
  applyTextRole(t, opts?.role ?? "Button", opts?.distanceCm ?? 75)
  t.horizontalAlignment = HorizontalAlignment.Center
  t.verticalAlignment = VerticalAlignment.Center
  t.horizontalOverflow = HorizontalOverflow.Overflow
  t.verticalOverflow = VerticalOverflow.Overflow
  t.layoutRect = Rect.create(-(w - 0.5) / 2, (w - 0.5) / 2, -h / 2, h / 2)
  t.textFill.color = COLOR.white
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

/** A BackPlate card: body (plate) + content (column FlexLayout lifted +0.6). Plate hugs content. */
export function makeCardBody(host: SceneObject, name: string, width: number, pad: number, gap: number): CardBody {
  const body = makeObj(host, name)
  const plate = body.createComponent(BackPlate.getTypeName()) as BackPlate
  plate.style = "dark"
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
