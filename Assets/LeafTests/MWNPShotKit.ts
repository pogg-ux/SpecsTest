// Helper for the cabinet screenshot scenarios (not a component).
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor} from "./MWNPLeafInteractor"

/** How much farther from the camera the cabinet is placed for shots, so the whole enclosure (hinges, bottom edge) fits with a margin. */
const SHOT_PULLBACK = 1.3

export async function prepareShot(hide: boolean): Promise<any> {
  const ui = new MWNPLeafInteractor()
  await ui.startExtendDiagnosis()
  const app = (global as any).mwnpAssistant
  const sparky = (global as any).mwnpSparky
  if (sparky) sparky.setAsrEnabled(false)
  if (hide) app.setDisplayHidden(true)
  // Library menu closed: only its small chip remains (it is above the cabinet, outside the crop).
  if (app.libraryCard) app.libraryCard.collapse()
  frameCabinet(app)
  await sleep(1500)
  return app
}

/** Pushes the cabinet back along the line of sight (position only, so nothing is re-laid-out) so it fits the preview with a small margin. */
function frameCabinet(app: any): void {
  const camSO = app.findUserCamera ? app.findUserCamera() : null
  if (!camSO) return
  const cam = camSO.getTransform().getWorldPosition()
  const t = app.sceneObject.getTransform()
  const p = t.getWorldPosition()
  t.setWorldPosition(cam.add(p.sub(cam).uniformScale(SHOT_PULLBACK)))
}
