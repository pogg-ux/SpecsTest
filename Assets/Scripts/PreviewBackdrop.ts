/**
 * Keeps the bench backdrop (a far-away textured plane under the camera) visible
 * only in the Lens Studio editor / preview. On Spectacles it is disabled so the
 * real world shows through.
 */
@component
export class PreviewBackdrop extends BaseScriptComponent {
  @input
  @hint("The BenchBackdrop scene object. Defaults to this object.")
  backdrop: SceneObject;

  onAwake() {
    const target = this.backdrop ?? this.getSceneObject();
    target.enabled = global.deviceInfoSystem.isEditor();
  }
}
