// MWNPCapture.ts — session-only captures for the Camera card and the Job report.
//
// Owns: the Capture record, SnapshotCamera (renders the Lens's own view into a render target) and takePhoto
// (a plain camera still through the Camera Module). Nothing here touches the network (no Internet Module,
// no web sockets, no remote services, no voice recognition) and nothing is written to disk: captures live as
// textures in memory until the Lens closes, so the Lens stays publishable with the camera.
// Must not: decide which test point a capture belongs to — Main passes that in.

export interface Capture {
  id: number
  /** Test point the capture belongs to ("" when there is none), and its display form ("F1 IN"). */
  pointId: string
  pointLabel: string
  kind: "snapshot" | "photo"
  time: string
  /** The image, or null when there is none (then `placeholder` says why). */
  texture: Texture | null
  /** width / height of the image. */
  aspect: number
  /** Non-empty text shown instead of an image, e.g. "Photo (device only)". */
  placeholder: string
  caption: string
}

export const PHOTO_PLACEHOLDER = "Photo (device only)"

/**
 * Renders everything the user's camera sees (cabinet overlays, tags, badges, traces and whatever cards are
 * showing) into a fresh render target by briefly adding a second camera with the user camera's settings.
 * The device camera feed (or the Preview backdrop) is composited outside the Lens, so it is not in the image;
 * the image is the Lens's own view on a dark ground.
 */
export class SnapshotCamera {
  constructor(private owner: BaseScriptComponent, private userCamera: SceneObject) {}

  snapshot(widthPx: number): Promise<{texture: Texture; aspect: number}> {
    const main = this.userCamera.getComponent("Component.Camera") as Camera
    const aspect = main.aspect > 0.2 ? main.aspect : 16 / 9
    const rt = global.scene.createRenderTargetTexture()
    const p = rt.control as RenderTargetProvider
    p.useScreenResolution = false
    p.resolution = new vec2(widthPx, Math.round(widthPx / aspect))
    p.clearColorOption = ClearColorOption.CustomColor
    p.clearColor = new vec4(0.13, 0.14, 0.16, 1)

    const so = global.scene.createSceneObject("SnapshotCamera")
    so.setParent(this.userCamera)
    const cam = so.createComponent("Component.Camera") as Camera
    cam.type = main.type
    cam.fov = main.fov
    cam.near = main.near
    cam.far = main.far
    cam.renderLayer = main.renderLayer
    cam.renderTarget = rt

    // Let it render a few frames, then drop the camera; the render target keeps the last picture.
    return new Promise((resolve) => {
      let frames = 0
      const ev = this.owner.createEvent("UpdateEvent")
      ev.bind(() => {
        frames++
        if (frames < 3) return
        ev.enabled = false
        so.destroy()
        resolve({texture: rt, aspect})
      })
    })
  }
}

export interface PhotoResult {
  texture: Texture | null
  aspect: number
  /** How the picture was made: "device camera still", "preview camera feed", or why there is none. */
  note: string
}

/**
 * A plain camera still. On the glasses: a still image request. In the Preview (where still requests are device
 * only): one frame of the camera stream, which is the Preview backdrop, frozen into its own texture; if the
 * stream gives nothing within 1.5 s the result has no texture and the caller shows "Photo (device only)".
 */
export async function takePhoto(owner: BaseScriptComponent): Promise<PhotoResult> {
  try {
    const cameraModule = require("LensStudio:CameraModule") as CameraModule
    if (!global.deviceInfoSystem.isEditor()) {
      const req = CameraModule.createImageRequest()
      const frame = await cameraModule.requestImage(req)
      const t = frame.texture
      return {texture: t, aspect: t.getWidth() / Math.max(1, t.getHeight()), note: "device camera still"}
    }
    const req = CameraModule.createCameraRequest()
    req.cameraId = CameraModule.CameraId.Default_Color
    const tex = cameraModule.requestCamera(req)
    const provider = tex.control as CameraTextureProvider
    const gotFrame = await new Promise<boolean>((resolve) => {
      let done = false
      const reg = provider.onNewFrame.add(() => {
        if (done) return
        done = true
        provider.onNewFrame.remove(reg)
        resolve(true)
      })
      const timeout = owner.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
      timeout.bind(() => {
        if (done) return
        done = true
        resolve(false)
      })
      timeout.reset(1.5)
    })
    if (!gotFrame || tex.getWidth() < 2 || tex.getHeight() < 2) return {texture: null, aspect: 16 / 9, note: "no camera frame in the preview"}
    return {texture: ProceduralTextureProvider.createFromTexture(tex), aspect: tex.getWidth() / tex.getHeight(), note: "preview camera feed"}
  } catch (e) {
    return {texture: null, aspect: 16 / 9, note: "camera unavailable: " + e}
  }
}
