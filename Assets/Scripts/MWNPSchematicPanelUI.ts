// MWNPSchematicPanelUI.ts — schematic panel above the step card, showing MWNP_1.0_wiring.png.
//
// Owns: the panel, the schematic image cropped/zoomed to the active path (EXTEND row TS-4 → F1 → L1,
// RETRACT row TS-5 → F2 → L2, or the whole drawing for the common wires), and a thick bright overlay
// drawn along the current wire. The card grows upward from its host's origin: the host sits at the
// card's bottom-center, just above the step card.
// API: open(wireId), close(), toggle(wireId), highlight(wireId), isOpen, highlightedWire.
// Must not: decide which wire is current — Main passes it.
// Note: CROPS, WIRE_PATH_PX and WIRE_LABEL_PX are image metadata (where things sit on the PNG, in
// pixels of MWNP_1.0_wiring.png, 1335 × 926), not circuit data; the circuit itself comes from netlist.json.
// Test handles: card "SchematicCard", image "SchematicImage", overlay "SchematicHighlight".

import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {addText, COLOR, makeCardBody, makeObj} from "./MWNPSharedUI"

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material

const IMG_W_PX = 1335
const IMG_H_PX = 926

interface CropPx {
  x0: number
  y0: number
  x1: number
  y1: number
}
type P = [number, number]

/** Image windows. Each shows one branch from its switch contact to its lamp. */
const CROPS: {[name: string]: CropPx} = {
  extend: {x0: 598, y0: 104, x1: 1244, y1: 262}, // S1 UP → 2a → TS-4 → 2b → F1 → 2c → L1
  retract: {x0: 598, y0: 307, x1: 1244, y1: 465}, // S1 DOWN → 3a → TS-5 → 3b → F2 → 3c → L2
  full: {x0: 0, y0: 0, x1: IMG_W_PX, y1: IMG_H_PX},
}

/** Which window each wire is shown in. */
const WIRE_CROP: {[wire: string]: string} = {"2a": "extend", "2b": "extend", "2c": "extend", "3a": "retract", "3b": "retract", "3c": "retract"}

/** Polyline of each branch wire on the PNG (pixel centers of the drawn line). */
const WIRE_PATH_PX: {[wire: string]: P[]} = {
  "2a": [[616, 215], [661.5, 215], [661.5, 189.5], [706, 189.5]],
  "2b": [[789, 189.5], [867, 189.5]],
  "2c": [[999, 189.5], [1077, 189.5]],
  "3a": [[616, 293], [661.5, 293], [661.5, 392.5], [706, 392.5]],
  "3b": [[789, 392.5], [867, 392.5]],
  "3c": [[999, 392.5], [1077, 392.5]],
}

/** Wires without a polyline above (shown on the full drawing with a frame marker at the label). */
const WIRE_LABEL_PX: {[wire: string]: P} = {
  "1": [300, 250],
  "0": [800, 658],
}

const HI_CORE = new vec4(1.0, 0.6, 0.05, 1) // bright orange, same as the active-path outline on the model
const HI_CASING = new vec4(0.1, 0.1, 0.16, 1) // dark casing so the core pops off the white drawing

@component
export class MWNPSchematicPanelUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Schematic Panel – wiring diagram cropped to the active path</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Schematic image (Assets/MWNP/MWNP_1.0_wiring.png)")
  schematicTexture: Texture
  @input
  @hint("Frame icon used to mark wires that have no drawn path (wire 1, wire 0)")
  highlightIcon: Texture
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(20, 40, 0.5))
  @hint("Panel width in card units (cm before scaling)")
  widthCm: number = 32
  @input
  @widget(new SliderWidget(0.2, 1.0, 0.05))
  @hint("Highlighted wire thickness in real cm (the drawn wire is about 0.12 cm)")
  highlightThicknessCm: number = 0.5
  @input
  @widget(new SliderWidget(0.5, 1.5, 0.05))
  @hint("Panel title text size: em height in real cm")
  titleEmCm: number = 0.8
  @ui.group_end

  isOpen: boolean = false
  highlightedWire: string = ""
  /** "extend" | "retract" | "full" — which window of the drawing is showing. */
  cropName: string = ""
  /** Pixel window of the PNG currently shown. */
  cropRect: CropPx = CROPS.full
  /** Thickness of the highlight in real cm and in PNG pixels (wire itself is about 4 px). */
  highlightThickCm: number = 0
  highlightThickPx: number = 0
  highlightColor: vec4 = HI_CORE

  private body: SceneObject | null = null
  private imgSO: SceneObject | null = null
  private imgItem: FlexItem | null = null
  private builder: MeshBuilder | null = null
  private hiRoot: SceneObject | null = null
  private segs: {casing: SceneObject; core: SceneObject}[] = []
  private marker: SceneObject | null = null
  private whiteTex: Texture | null = null
  private coreMat: Material | null = null
  private casingMat: Material | null = null
  private imageW = 0
  private scaleY = 1

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  open(wireId: string): void {
    if (!this.body) this.build()
    ;(this.body as SceneObject).enabled = true
    this.isOpen = true
    this.highlight(wireId)
  }

  close(): void {
    if (this.body) this.body.enabled = false
    this.isOpen = false
  }

  toggle(wireId: string): void {
    if (this.isOpen) this.close()
    else this.open(wireId)
  }

  highlight(wireId: string): void {
    this.highlightedWire = wireId
    if (!this.imgSO) return
    const name = WIRE_CROP[wireId] ?? "full"
    this.setCrop(name)
    const rect = this.cropRect
    const cw = rect.x1 - rect.x0
    const ch = rect.y1 - rect.y0
    // pixel → image-local normalized (-0.5..0.5, y up)
    const nx = (x: number) => (x - rect.x0) / cw - 0.5
    const ny = (y: number) => 0.5 - (y - rect.y0) / ch

    const cmPerPx = (this.imageW / cw) * this.scaleY
    const thick = Math.max(6, this.highlightThicknessCm / cmPerPx)
    this.highlightThickCm = thick * cmPerPx
    this.highlightThickPx = thick

    const path = WIRE_PATH_PX[wireId]
    const label = WIRE_LABEL_PX[wireId]
    ;(this.hiRoot as SceneObject).enabled = !!path || !!label
    for (const s of this.segs) {
      s.casing.enabled = false
      s.core.enabled = false
    }
    ;(this.marker as SceneObject).enabled = false
    if (path) {
      for (let k = 0; k < path.length - 1; k++) {
        const seg = this.segFor(k)
        const a = path[k]
        const b = path[k + 1]
        const cx = (a[0] + b[0]) / 2
        const cy = (a[1] + b[1]) / 2
        const w = Math.abs(b[0] - a[0])
        const h = Math.abs(b[1] - a[1])
        this.place(seg.casing, nx(cx), ny(cy), (w + thick * 1.7) / cw, (h + thick * 1.7) / ch, 0.03)
        this.place(seg.core, nx(cx), ny(cy), (w + thick) / cw, (h + thick) / ch, 0.06)
        seg.casing.enabled = true
        seg.core.enabled = true
      }
    } else if (label) {
      const m = this.marker as SceneObject
      this.place(m, nx(label[0]), ny(label[1]), 70 / cw, 70 / ch, 0.06)
      m.enabled = true
    }
  }

  // ── Build ────────────────────────────────────────────────────────────────

  private setCrop(name: string): void {
    const rect = CROPS[name]
    this.cropName = name
    this.cropRect = rect
    const cw = rect.x1 - rect.x0
    const ch = rect.y1 - rect.y0
    const imageH = this.imageW * (ch / cw)
    const t = (this.imgSO as SceneObject).getTransform()
    t.setLocalScale(new vec3(this.imageW, imageH, 1))
    ;(this.imgItem as FlexItem).overrideHeight = imageH
    // Quad UVs = the crop window (texture v runs bottom → top).
    const u0 = rect.x0 / IMG_W_PX
    const u1 = rect.x1 / IMG_W_PX
    const vT = 1 - rect.y0 / IMG_H_PX
    const vB = 1 - rect.y1 / IMG_H_PX
    const b = this.builder as MeshBuilder
    b.setVertexInterleaved(0, [-0.5, -0.5, 0, u0, vB])
    b.setVertexInterleaved(1, [0.5, -0.5, 0, u1, vB])
    b.setVertexInterleaved(2, [0.5, 0.5, 0, u1, vT])
    b.setVertexInterleaved(3, [-0.5, 0.5, 0, u0, vT])
    b.updateMesh()
  }

  private place(so: SceneObject, x: number, y: number, w: number, h: number, z: number): void {
    const t = so.getTransform()
    t.setLocalPosition(new vec3(x, y, z))
    t.setLocalScale(new vec3(w, h, 1))
  }

  private segFor(k: number): {casing: SceneObject; core: SceneObject} {
    while (this.segs.length <= k) {
      const i = this.segs.length
      const mk = (name: string, mat: Material): SceneObject => {
        const so = makeObj(this.hiRoot as SceneObject, name + i)
        const img = so.createComponent("Component.Image") as Image
        img.clearMaterials()
        img.addMaterial(mat)
        return so
      }
      this.segs.push({casing: mk("WireCasing", this.casingMat as Material), core: mk("WireCore", this.coreMat as Material)})
    }
    return this.segs[k]
  }

  private solidMaterial(color: vec4): Material {
    const m = imageMaterial.clone()
    m.mainPass.baseTex = this.whiteTex as Texture
    m.mainPass.baseColor = color
    m.mainPass.depthTest = true
    m.mainPass.depthWrite = false
    return m
  }

  private build(): void {
    const w = this.widthCm
    const inner = w - 2.4
    this.scaleY = Math.max(0.05, this.sceneObject.getTransform().getWorldScale().y)
    const card = makeCardBody(this.sceneObject, "SchematicCard", w, 1.2, 0.5, "bottom")
    this.body = card.body
    addText(card.content, "SchematicTitle", "Schematic · MWNP_1.0_wiring.png", inner, (this.titleEmCm / this.scaleY) * 1.4, {
      emCm: this.titleEmCm / this.scaleY,
      color: COLOR.dim,
    })

    // Image: a quad whose UVs select the crop window; same ImageMaterial as UI images.
    this.imageW = inner
    this.imgSO = makeObj(card.content, "SchematicImage")
    const rmv = this.imgSO.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    const b = new MeshBuilder([
      {name: "position", components: 3},
      {name: "texture0", components: 2},
    ])
    b.topology = MeshTopology.Triangles
    b.indexType = MeshIndexType.UInt16
    b.appendVerticesInterleaved([-0.5, -0.5, 0, 0, 0, 0.5, -0.5, 0, 1, 0, 0.5, 0.5, 0, 1, 1, -0.5, 0.5, 0, 0, 1])
    b.appendIndices([0, 1, 2, 0, 2, 3])
    rmv.mesh = b.getMesh()
    b.updateMesh()
    this.builder = b
    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = this.schematicTexture
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    rmv.mainMaterial = mat
    this.imgItem = this.imgSO.createComponent(FlexItem.getTypeName()) as FlexItem
    this.imgItem.overrideWidth = this.imageW
    this.imgItem.overrideHeight = this.imageW * (IMG_H_PX / IMG_W_PX)
    this.imgItem.flexShrink = 0
    ;(card.content.getComponent(FlexLayout.getTypeName()) as FlexLayout).addItems([this.imgItem])

    // Overlay: solid bars (casing + core) along the wire; frame icon for wires without a drawn path.
    this.whiteTex = whitePixel()
    this.coreMat = this.solidMaterial(HI_CORE)
    this.casingMat = this.solidMaterial(HI_CASING)
    this.hiRoot = makeObj(this.imgSO, "SchematicHighlight")
    this.marker = makeObj(this.hiRoot, "WireMarker")
    const mi = this.marker.createComponent("Component.Image") as Image
    const hmat = imageMaterial.clone()
    hmat.mainPass.baseTex = this.highlightIcon
    hmat.mainPass.baseColor = HI_CORE
    hmat.mainPass.depthTest = true
    hmat.mainPass.depthWrite = false
    mi.clearMaterials()
    mi.addMaterial(hmat)
    this.marker.enabled = false
    this.setCrop("extend")
  }
}

/** 1×1 white texture so a material's baseColor becomes the visible solid color. */
function whitePixel(): Texture {
  const tex = ProceduralTextureProvider.createWithFormat(1, 1, TextureFormat.RGBA8Unorm)
  const provider = tex.control as ProceduralTextureProvider
  provider.setPixels(0, 0, 1, 1, new Uint8Array([255, 255, 255, 255]))
  return tex
}
