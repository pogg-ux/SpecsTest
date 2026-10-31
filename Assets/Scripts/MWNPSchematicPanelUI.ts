// MWNPSchematicPanelUI.ts — schematic panel above the step card, showing MWNP_1.0_wiring.png.
//
// Owns: the panel, the schematic image, and a highlight frame over the current wire.
// API: open(wireId), close(), toggle(wireId), highlight(wireId), isOpen, highlightedWire.
// Must not: decide which wire is current — Main passes it.
// Note: WIRE_LABEL_PX is image metadata (where each wire label sits on the PNG),
// not circuit data; the circuit itself comes from netlist.json.
// Test handle: card "SchematicCard", highlight "SchematicHighlight".

import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {addText, COLOR, makeCardBody, makeObj} from "./MWNPSharedUI"

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material

// Pixel position of each wire-number label on Assets/MWNP/MWNP_1.0_wiring.png (1335 × 926).
const IMG_W_PX = 1335
const IMG_H_PX = 926
const WIRE_LABEL_PX: {[wire: string]: [number, number]} = {
  "1": [300, 250],
  "2a": [661, 190],
  "2b": [828, 180],
  "2c": [1038, 180],
  "3a": [661, 328],
  "3b": [828, 382],
  "3c": [1038, 382],
  "0": [800, 658],
}

@component
export class MWNPSchematicPanelUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Schematic Panel – wiring diagram with wire highlight</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Schematic image (Assets/MWNP/MWNP_1.0_wiring.png)")
  schematicTexture: Texture
  @input
  @hint("Highlight frame icon drawn over the current wire")
  highlightIcon: Texture
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(20, 40, 0.5))
  @hint("Panel width in cm (brief default 30)")
  widthCm: number = 30
  @input
  @widget(new ColorWidget())
  @hint("Highlight frame color")
  highlightColor: vec4 = new vec4(1.0, 0.85, 0.2, 1)
  @ui.group_end

  isOpen: boolean = false
  highlightedWire: string = ""

  private body: SceneObject | null = null
  private highlightSO: SceneObject | null = null
  private imageW = 0
  private imageH = 0

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
    if (!this.highlightSO) return
    const px = WIRE_LABEL_PX[wireId]
    if (!px) {
      this.highlightSO.enabled = false
      return
    }
    this.highlightSO.enabled = true
    // Highlight is a child of the image; image local space spans -0.5..0.5 per axis.
    const x = px[0] / IMG_W_PX - 0.5
    const y = 0.5 - px[1] / IMG_H_PX
    const t = this.highlightSO.getTransform()
    t.setLocalPosition(new vec3(x, y, 0.02))
    t.setLocalScale(new vec3(3.2 / this.imageW, 3.2 / this.imageH, 1))
  }

  private build(): void {
    const w = this.widthCm
    const inner = w - 2.4
    const card = makeCardBody(this.sceneObject, "SchematicCard", w, 1.2, 0.5)
    this.body = card.body
    addText(card.content, "SchematicTitle", "Schematic · MWNP_1.0_wiring.png", inner, 1.4, {role: "Caption", color: COLOR.dim})

    this.imageW = inner
    this.imageH = inner * (IMG_H_PX / IMG_W_PX)
    const imgSO = makeObj(card.content, "SchematicImage")
    imgSO.getTransform().setLocalScale(new vec3(this.imageW, this.imageH, 1))
    const img = imgSO.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = this.schematicTexture
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    const item = imgSO.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideWidth = this.imageW
    item.overrideHeight = this.imageH
    ;(card.content.getComponent(FlexLayout.getTypeName()) as FlexLayout).addItems([item])

    this.highlightSO = makeObj(imgSO, "SchematicHighlight")
    const hi = this.highlightSO.createComponent("Component.Image") as Image
    const hmat = imageMaterial.clone()
    hmat.mainPass.baseTex = this.highlightIcon
    hmat.mainPass.baseColor = this.highlightColor
    hmat.mainPass.depthTest = true
    hmat.mainPass.depthWrite = false
    hi.clearMaterials()
    hi.addMaterial(hmat)
  }
}
