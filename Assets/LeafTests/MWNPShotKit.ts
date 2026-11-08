// Helper for the cabinet screenshot scenarios (not a component).
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {MWNPLeafInteractor} from "./MWNPLeafInteractor"

export async function prepareShot(hide: boolean): Promise<any> {
  const ui = new MWNPLeafInteractor()
  await ui.startExtendDiagnosis()
  const app = (global as any).mwnpAssistant
  const sparky = (global as any).mwnpSparky
  if (sparky) sparky.setAsrEnabled(false)
  if (hide) app.setDisplayHidden(true)
  await sleep(1500)
  return app
}
