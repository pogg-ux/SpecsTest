// MWNPDisplayFader.ts — fades the display (cards, tags, badges, schematic) out and back in, in the same state.
//
// Owns: a short alpha fade over every visual under the given roots, then disables those roots (so nothing
// invisible can be clicked); fading back in enables them first and ramps the alpha up again. Nothing is
// destroyed or rebuilt, so the display returns exactly as it was. An optional overlay fader (the cabinet's
// traces / outlines / probe markers, which live on the model, not under the roots) is faded in step.
// API: setHidden(hidden), toggle(), readable: hidden (target), alpha (0..1), isFading, fullyHidden.
// Must not: know what the display shows. Main owns the roots and decides when to hide or show.

import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {RoundedRectangle} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"

export interface OverlayFade {
  fadeOverlays(alpha: number): void
}

interface Target {
  /** Scales this visual's alpha to a (1 restores the original). */
  set(a: number): void
}

/**
 * One property of one kind of visual (text color, plate opacity, ...) with its TRUE value remembered once per object, no
 * matter how many faders (card open, card close, Hide / Show, Library hide) touch it. Each fader contributes a factor; the
 * visual shows base x product of the factors. A fader that starts while another is mid-way therefore never mistakes a
 * half-faded value for the real one (that made cards come back dim). If other code writes the property itself (a status
 * color, say), that write becomes the new base.
 */
class Channel<K extends object, V> {
  private entries = new WeakMap<K, {base: V; written: V; factors: Map<DisplayFader, number>}>()

  constructor(
    private read: (k: K) => V,
    private write: (k: K, v: V) => void,
    private scale: (v: V, a: number) => V,
    private same: (a: V, b: V) => boolean
  ) {}

  ensure(k: K): void {
    if (this.entries.has(k)) return
    const cur = this.read(k)
    this.entries.set(k, {base: cur, written: cur, factors: new Map()})
  }

  set(k: K, who: DisplayFader, a: number): void {
    this.ensure(k)
    const e = this.entries.get(k)!
    const cur = this.read(k)
    if (!this.same(cur, e.written)) e.base = cur
    if (a >= 1) e.factors.delete(who)
    else e.factors.set(who, a)
    let f = 1
    e.factors.forEach((v) => (f *= v))
    this.write(k, f >= 1 ? e.base : this.scale(e.base, f))
    e.written = this.read(k)
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.002
const sameVec4 = (a: vec4, b: vec4) => near(a.x, b.x) && near(a.y, b.y) && near(a.z, b.z) && near(a.w, b.w)
const copyVec4 = (v: vec4) => new vec4(v.x, v.y, v.z, v.w)
const fillColor = new Channel<Text, vec4>((t) => copyVec4(t.textFill.color), (t, v) => (t.textFill.color = copyVec4(v)), (v, a) => new vec4(v.x, v.y, v.z, v.w * a), sameVec4)
const outlineColor = new Channel<Text, vec4>((t) => copyVec4(t.outlineSettings.fill.color), (t, v) => (t.outlineSettings.fill.color = copyVec4(v)), (v, a) => new vec4(v.x, v.y, v.z, v.w * a), sameVec4)
const buttonOpacity = new Channel<Button, number>((b) => b.opacity, (b, v) => (b.opacity = v), (v, a) => v * a, near)
const plateOpacity = new Channel<RoundedRectangle, number>((r) => r.opacity, (r, v) => (r.opacity = v), (v, a) => v * a, near)
// These materials blend with premultiplied alpha, so scale rgb together with alpha.
const matColor = new Channel<Material, vec4>((m) => copyVec4(m.mainPass.baseColor), (m, v) => (m.mainPass.baseColor = copyVec4(v)), (v, a) => new vec4(v.x * a, v.y * a, v.z * a, v.w * a), sameVec4)

export class DisplayFader {
  /** Where the display is heading: true = hidden. */
  hidden = false
  /** 0 = invisible, 1 = fully shown. */
  alpha = 1
  isFading = false
  private targets: Target[] = []
  private seen = new Map<object, WeakSet<object>>()

  constructor(
    owner: BaseScriptComponent,
    private roots: SceneObject[],
    private overlays: OverlayFade | null,
    private seconds: number = 0.35,
    /** Keep the roots' enabled state equal to the fader's state (used for the Hide / Show faders, whose button label must be true). */
    private keepRootsInSync: boolean = false
  ) {
    owner.createEvent("UpdateEvent").bind(() => this.update())
  }

  /** True when the display is shown (or on its way) AND really enabled, i.e. what a person can see. */
  get visible(): boolean {
    return !this.hidden && (this.isFading || this.roots.every((r) => r.enabled))
  }

  /** Jumps to fully shown without animation (cancels a fade-out in progress). */
  snapShown(): void {
    this.hidden = false
    this.alpha = 1
    this.isFading = false
    this.collect()
    this.apply(1)
    for (const r of this.roots) r.enabled = true
  }

  get fullyHidden(): boolean {
    return this.hidden && !this.isFading && this.alpha === 0
  }

  /** Plays a short fade-in from invisible over the (already enabled) roots; used when a card opens. */
  fadeIn(): void {
    this.collect()
    this.hidden = false
    this.alpha = 0
    this.apply(0)
    this.isFading = true
  }

  toggle(): void {
    this.setHidden(!this.hidden)
  }

  setHidden(hidden: boolean): void {
    if (hidden === this.hidden && !this.isFading && this.roots.every((r) => r.enabled === !hidden)) return
    this.hidden = hidden
    this.collect()
    if (!hidden) {
      // Start the fade-in from invisible: apply the current alpha before the roots become visible.
      this.apply(this.alpha)
      for (const r of this.roots) r.enabled = true
    }
    this.isFading = true
  }

  private update(): void {
    try {
      this.step()
    } catch (e) {
      // Never let one fader's failure stop the frame; give up on this fade so it cannot throw again every frame.
      this.isFading = false
      print("[MWNP] fader error: " + e)
    }
  }

  private step(): void {
    if (!this.isFading) {
      if (this.keepRootsInSync) {
        for (const r of this.roots) if (r.enabled === this.hidden) r.enabled = !this.hidden
      }
      return
    }
    const step = getDeltaTime() / Math.max(0.01, this.seconds)
    this.alpha = this.hidden ? Math.max(0, this.alpha - step) : Math.min(1, this.alpha + step)
    this.apply(this.alpha)
    if (this.alpha === (this.hidden ? 0 : 1)) {
      this.isFading = false
      if (this.hidden) {
        for (const r of this.roots) r.enabled = false
        // Put every visual's own alpha back (the roots are disabled, so nothing shows); the display is
        // then in exactly its normal state the moment it is enabled again.
        for (const t of this.targets) t.set(1)
      }
    }
  }

  private apply(a: number): void {
    for (const t of this.targets) t.set(a)
    if (this.overlays) this.overlays.fadeOverlays(a)
  }

  private collect(): void {
    this.targets = []
    this.seen = new Map<object, WeakSet<object>>()
    const walk = (so: SceneObject) => {
      const text = so.getComponent("Component.Text") as Text
      if (text) this.addText(text)
      const btn = so.getComponent(Button.getTypeName()) as Button | null
      if (btn) this.add(buttonOpacity, btn)
      const plate = so.getComponent(BackPlate.getTypeName()) as BackPlate | null
      if (plate) {
        const rr = (plate as any).roundedRectangle as RoundedRectangle | undefined
        if (rr) this.add(plateOpacity, rr)
      }
      // Label plates on the model: a bare rounded rectangle (no BackPlate / Button around it).
      if (so.name === "LabelPlate") {
        const rr = so.getComponent(RoundedRectangle.getTypeName()) as RoundedRectangle | null
        if (rr) this.add(plateOpacity, rr)
      }
      // Plain images / meshes (schematic drawing, highlight bars, label plates). Skip UIKit's own rounded
      // rectangles: their opacity is handled above.
      if (!so.getComponent(RoundedRectangle.getTypeName())) {
        const img = so.getComponent("Component.Image") as Image
        if (img && img.mainMaterial) this.add(matColor, img.mainMaterial)
        const rmv = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
        if (rmv && rmv.mainMaterial) this.add(matColor, rmv.mainMaterial)
      }
      for (let i = 0; i < so.getChildrenCount(); i++) walk(so.getChild(i))
    }
    for (const r of this.roots) walk(r)
  }

  private add<K extends object, V>(ch: Channel<K, V>, k: K): void {
    ch.ensure(k)
    let set = this.seen.get(ch)
    if (!set) this.seen.set(ch, (set = new WeakSet<object>()))
    if (set.has(k)) return
    set.add(k)
    this.targets.push({
      set: (a) => {
        // A visual destroyed mid-fade (a card rebuilt or swapped) must never throw: an exception in an UpdateEvent aborts
        // the rest of that frame's updates, which left every later fader stuck half-faded.
        if (isNull(k as any)) return
        try {
          ch.set(k, this, a)
        } catch (e) {
          // The object died between the check and the write; nothing to fade any more.
        }
      },
    })
  }

  private addText(t: Text): void {
    this.add(fillColor, t)
    if (t.outlineSettings.enabled) this.add(outlineColor, t)
  }
}
