// LeafIndex.ts — registers the MWNP done-criteria LEAF scenarios (C1..C5). Test-only.

import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {MWNPC1SymptomPathScenario} from "./MWNPC1SymptomPathScenario"
import {MWNPC2ReadingInSpecScenario} from "./MWNPC2ReadingInSpecScenario"
import {MWNPC3FaultFlaggedScenario} from "./MWNPC3FaultFlaggedScenario"
import {MWNPC4NoGuessScenario} from "./MWNPC4NoGuessScenario"
import {MWNPC5FixAndSummaryScenario} from "./MWNPC5FixAndSummaryScenario"
import {MWNPLayoutScenario} from "./MWNPLayoutScenario"
import {MWNPLayoutCardsScenario} from "./MWNPLayoutCardsScenario"
import {MWNPRetestControlsScenario} from "./MWNPRetestControlsScenario"
import {MWNPDisplayToggleScenario} from "./MWNPDisplayToggleScenario"
import {MWNPCameraCardScenario} from "./MWNPCameraCardScenario"
import {MWNPLibraryOptionsScenario} from "./MWNPLibraryOptionsScenario"
import {MWNPGalleryScenario} from "./MWNPGalleryScenario"
import {MWNPJobNotesScenario} from "./MWNPJobNotesScenario"
import {MWNPPhotoViewerScenario} from "./MWNPPhotoViewerScenario"
import {MWNPWorkflowScenario} from "./MWNPWorkflowScenario"
import {MWNPReportPagesScenario} from "./MWNPReportPagesScenario"
import {MWNPCameraCloseScenario} from "./MWNPCameraCloseScenario"
import {MWNPCardTextScenario} from "./MWNPCardTextScenario"
import {MWNPSparkyVoiceScenario} from "./MWNPSparkyVoiceScenario"
import {MWNPSparkyClipsScenario} from "./MWNPSparkyClipsScenario"
import {MWNPVerifyFixScenario} from "./MWNPVerifyFixScenario"
import {MWNPSparkyHiddenScenario} from "./MWNPSparkyHiddenScenario"
import {MWNPSparkyNotesScenario} from "./MWNPSparkyNotesScenario"
import {MWNPSparkyAskScenario} from "./MWNPSparkyAskScenario"
import {MWNPSparkyAskCardScenario} from "./MWNPSparkyAskCardScenario"
import {MWNPCabinetLockScenario} from "./MWNPCabinetLockScenario"
import {MWNPCabinetShotScenario} from "./MWNPCabinetShotScenario"
import {MWNPCabinetShotOnScenario} from "./MWNPCabinetShotOnScenario"
import {MWNPCabinetShotFullScenario} from "./MWNPCabinetShotFullScenario"
import {MWNPCabinetShotLabelsScenario} from "./MWNPCabinetShotLabelsScenario"
import {MWNPLabelsClearScenario} from "./MWNPLabelsClearScenario"
import {MWNPCardAlignmentScenario} from "./MWNPCardAlignmentScenario"

/** LEAF's on-screen output: the log strip camera and the diagnostic report camera (both created lazily by Leaf.lspkg). */
const LEAF_OVERLAY_ROOTS = ["LeafDebugUICamera", "LeafDiagnosticReportCamera"]
/** LEAF creates one child of this object per running scenario and destroys it when the scenario ends. */
const LEAF_SCENARIO_OWNER = "LeafScenarioManager"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {id: "mwnp-c1-symptom-path", typename: MWNPC1SymptomPathScenario.getTypeName()},
    {id: "mwnp-c2-reading-in-spec", typename: MWNPC2ReadingInSpecScenario.getTypeName()},
    {id: "mwnp-c3-fault-flagged", typename: MWNPC3FaultFlaggedScenario.getTypeName()},
    {id: "mwnp-c4-no-guess", typename: MWNPC4NoGuessScenario.getTypeName()},
    {id: "mwnp-c5-fix-and-summary", typename: MWNPC5FixAndSummaryScenario.getTypeName()},
    {id: "mwnp-layout-clear-view", typename: MWNPLayoutScenario.getTypeName()},
    {id: "mwnp-layout-cards", typename: MWNPLayoutCardsScenario.getTypeName(), parameters: {stop_at: "summary"}},
    {id: "mwnp-retest-controls", typename: MWNPRetestControlsScenario.getTypeName(), parameters: {stop_after: ""}},
    {id: "mwnp-display-toggle", typename: MWNPDisplayToggleScenario.getTypeName()},
    {id: "mwnp-camera-card", typename: MWNPCameraCardScenario.getTypeName(), parameters: {stop_at: ""}},
    {id: "mwnp-library-options", typename: MWNPLibraryOptionsScenario.getTypeName(), parameters: {stop_at: ""}},
    {id: "mwnp-job-notes", typename: MWNPJobNotesScenario.getTypeName()},
    {id: "mwnp-photo-viewer", typename: MWNPPhotoViewerScenario.getTypeName()},
    {id: "mwnp-workflow", typename: MWNPWorkflowScenario.getTypeName()},
    {id: "mwnp-report-pages", typename: MWNPReportPagesScenario.getTypeName()},
    {id: "mwnp-camera-close", typename: MWNPCameraCloseScenario.getTypeName()},
    {id: "mwnp-card-text", typename: MWNPCardTextScenario.getTypeName()},
    {id: "mwnp-sparky-voice", typename: MWNPSparkyVoiceScenario.getTypeName()},
    {id: "mwnp-sparky-clips", typename: MWNPSparkyClipsScenario.getTypeName()},
    {id: "mwnp-verify-fix", typename: MWNPVerifyFixScenario.getTypeName()},
    {id: "mwnp-sparky-hidden", typename: MWNPSparkyHiddenScenario.getTypeName()},
    {id: "mwnp-sparky-notes", typename: MWNPSparkyNotesScenario.getTypeName()},
    {id: "mwnp-sparky-ask", typename: MWNPSparkyAskScenario.getTypeName()},
    {id: "mwnp-sparky-ask-card", typename: MWNPSparkyAskCardScenario.getTypeName()},
    {id: "mwnp-cabinet-lock", typename: MWNPCabinetLockScenario.getTypeName()},
    {id: "mwnp-cabinet-shot", typename: MWNPCabinetShotScenario.getTypeName()},
    {id: "mwnp-cabinet-shot-on", typename: MWNPCabinetShotOnScenario.getTypeName()},
    {id: "mwnp-cabinet-shot-full", typename: MWNPCabinetShotFullScenario.getTypeName()},
    {id: "mwnp-cabinet-shot-labels", typename: MWNPCabinetShotLabelsScenario.getTypeName()},
    {id: "mwnp-labels-clear", typename: MWNPLabelsClearScenario.getTypeName()},
    {id: "mwnp-card-alignment", typename: MWNPCardAlignmentScenario.getTypeName(), parameters: {shot: ""}},
    {id: "mwnp-gallery", typename: MWNPGalleryScenario.getTypeName(), parameters: {shot: "start"}},
  ]

  private overlays: {[name: string]: SceneObject} = {}

  onAwake() {
    // Test banners and reports show only while a scenario is running, so a normal Preview is clean.
    this.createEvent("UpdateEvent").bind(() => this.gateLeafOverlays())
    // Test aid: pressing P in the Preview prints the screen position of every enabled control, so real
    // clicks (InjectPreviewGesture) can be aimed without estimating from screenshots.
    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
      if (e.key === Keys.P) this.probeTargets()
    })
  }

  private probeTargets(): void {
    let cam: Camera | null = null
    const find = (o: SceneObject) => {
      if (cam) return
      const c = o.getComponent("Component.Camera") as Camera
      if (c && o.isEnabledInHierarchy) cam = c
      for (let i = 0; i < o.getChildrenCount(); i++) find(o.getChild(i))
    }
    for (let i = 0; i < global.scene.getRootObjectsCount(); i++) find(global.scene.getRootObject(i))
    if (!cam) return
    const camera = cam as Camera
    const lines: string[] = []
    const scan = (o: SceneObject) => {
      if (!o.isEnabledInHierarchy) return
      if (/^(Key_|Btn_|S1_Toggle|Tag_TS-3)/.test(o.name) && o.getComponent(Interactable.getTypeName())) {
        const sp = camera.worldSpaceToScreenSpace(o.getTransform().getWorldPosition())
        lines.push(o.name + "=" + sp.x.toFixed(3) + "," + sp.y.toFixed(3))
      }
      for (let i = 0; i < o.getChildrenCount(); i++) scan(o.getChild(i))
    }
    for (let i = 0; i < global.scene.getRootObjectsCount(); i++) scan(global.scene.getRootObject(i))
    print("[PROBE] " + lines.join(" "))
  }

  private findRoot(name: string): SceneObject | null {
    const cached = this.overlays[name]
    if (cached && !isNull(cached)) return cached
    for (let i = 0; i < global.scene.getRootObjectsCount(); i++) {
      const o = global.scene.getRootObject(i)
      if (o.name === name) {
        this.overlays[name] = o
        return o
      }
    }
    return null
  }

  private gateLeafOverlays(): void {
    const owner = this.findRoot(LEAF_SCENARIO_OWNER)
    const running = !!owner && owner.getChildrenCount() > 0
    for (const name of LEAF_OVERLAY_ROOTS) {
      const so = this.findRoot(name)
      if (so && so.enabled !== running) so.enabled = running
    }
  }
}
