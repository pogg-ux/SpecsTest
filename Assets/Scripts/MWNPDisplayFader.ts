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

export class DisplayFader {
  /** Where the display is heading: true = hidden. */
  hidden = false
  /** 0 = invisible, 1 = fully shown. */
  alpha = 1
  isFading = false
  private targets: Target[] = []

  constructor(
    owner: BaseScriptComponent,
    private roots: SceneObject[],
    private overlays: OverlayFade | null,
    private seconds: number = 0.35
  ) {
    owner.createEvent("UpdateEvent").bind(() => this.update())
  }

  get fullyHidden(): boolean {
    return this.hidden && !this.isFading && this.alpha === 0
  }

  toggle(): void {
    this.setHidden(!this.hidden)
  }

  setHidden(hidden: boolean): void {
    if (hidden === this.hidden && !this.isFading) return
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
    if (!this.isFading) return
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
    const seenMats = new Set<Material>()
    const walk = (so: SceneObject) => {
      const text = so.getComponent("Component.Text") as Text
      if (text) this.addText(text)
      const btn = so.getComponent(Button.getTypeName()) as Button | null
      if (btn) {
        const base = btn.opacity
        this.targets.push({set: (a) => (btn.opacity = base * a)})
      }
      const plate = so.getComponent(BackPlate.getTypeName()) as BackPlate | null
      if (plate) {
        const rr = (plate as any).roundedRectangle as RoundedRectangle | undefined
        if (rr) {
          const base = rr.opacity
          this.targets.push({set: (a) => (rr.opacity = base * a)})
        }
      }
      // Label plates on the model: a bare rounded rectangle (no BackPlate / Button around it).
      if (so.name === "LabelPlate") {
        const rr = so.getComponent(RoundedRectangle.getTypeName()) as RoundedRectangle | null
        if (rr) {
          const base = rr.opacity
          this.targets.push({set: (a) => (rr.opacity = base * a)})
        }
      }
      // Plain images / meshes (schematic drawing, highlight bars, label plates). Skip UIKit's own rounded
      // rectangles: their opacity is handled above.
      if (!so.getComponent(RoundedRectangle.getTypeName())) {
        const img = so.getComponent("Component.Image") as Image
        if (img) this.addMaterials(img.mainMaterial ? [img.mainMaterial] : [], seenMats)
        const rmv = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
        if (rmv) this.addMaterials(rmv.mainMaterial ? [rmv.mainMaterial] : [], seenMats)
      }
      for (let i = 0; i < so.getChildrenCount(); i++) walk(so.getChild(i))
    }
    for (const r of this.roots) walk(r)
  }

  private addText(t: Text): void {
    // Copy the numbers now: the colors are values that other code rewrites while the display is hidden.
    const f = t.textFill.color
    const fr = f.x, fg = f.y, fb = f.z, fa = f.w
    const hasOutline = t.outlineSettings.enabled
    const o = hasOutline ? t.outlineSettings.fill.color : null
    const or = o ? o.x : 0, og = o ? o.y : 0, ob = o ? o.z : 0, oa = o ? o.w : 0
    this.targets.push({
      set: (a) => {
        t.textFill.color = new vec4(fr, fg, fb, fa * a)
        if (hasOutline) t.outlineSettings.fill.color = new vec4(or, og, ob, oa * a)
      },
    })
  }

  private addMaterials(mats: Material[], seen: Set<Material>): void {
    for (const m of mats) {
      if (seen.has(m)) continue
      seen.add(m)
      const base = m.mainPass.baseColor
      // These materials blend with premultiplied alpha, so scale rgb together with alpha.
      this.targets.push({set: (a) => (m.mainPass.baseColor = new vec4(base.x * a, base.y * a, base.z * a, base.w * a))})
    }
  }
}
