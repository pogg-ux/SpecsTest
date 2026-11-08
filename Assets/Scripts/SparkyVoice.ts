// SparkyVoice.ts — "Sparky", the voice layer: a continuous ASR session that acts only on phrases that start with the wake word.
//
// Owns: the ASR session (restarted on error or after a long silence), wake-word / command parsing per transcript, acting on a
// PARTIAL as soon as it holds a complete command (arguments such as "log twelve" wait until the text settles or the final
// arrives), dedup (the same command within 2 s is ignored), the small listening indicator (mic icon + the last heard command)
// beside the chips, and a typed-text hook so every command can be tested without a microphone.
// API: inject(text, isFinal?), setAsrEnabled(on), acted (log of what ran), listening (state), indicatorText.
// Must not: decide what a command does (MWNPMain.voiceCommand maps it to the same actions the buttons run), or touch cards.
// Test handles: scene object "SparkyVoice", "SparkyIndicator", global.mwnpSparky.

import {normalize, parseCommand, VoiceCommand, wakeSegments} from "./MWNPSpeech"

const micIcon = requireAsset("../Icons/mic.png") as Texture
const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material

const DEDUP_SEC = 2.0
const SETTLE_SEC = 1.0 // a command with an argument acts when its text has not changed for this long (or on the final)
const HEARD_SEC = 2.0
const MESSAGE_SEC = 4.0
const SILENCE_RESTART_SEC = 45

const GREEN = new vec4(0.2, 1, 0.4, 1)
const AMBER = new vec4(1, 0.72, 0, 1)
const RED = new vec4(1, 0.23, 0.19, 1)
const GRAY = new vec4(0.7, 0.7, 0.7, 1)

@component
export class SparkyVoice extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SparkyVoice – wake word "Sparky", continuous ASR, commands</span>')
  @ui.separator
  @input
  @hint("Listen with the microphone. Off = only typed-text injection (tests).")
  enableAsr: boolean = true
  @input
  @hint("Pre-recorded Sparky clips from Assets/Audio/Sparky, matched by file name (step_EXTEND_2, logged, undone, ...). A clip that is not here is skipped silently.")
  clips: AudioTrackAsset[]

  /** Clip names each command asked for (whether or not the file exists): for tests and the log. */
  requested: string[][] = []
  /** True while a clip is playing and ASR is stopped. */
  asrPaused: boolean = false

  /** What ran, in order: for tests and for the log. */
  acted: {name: string; arg: string; result: string}[] = []
  /** True while an ASR session is believed to be running. */
  listening: boolean = false
  /** The line the indicator is showing right now ("" = none). */
  indicatorText: string = ""

  private main: any = null
  private asr: AsrModule | null = null
  private asrEnabled = true
  // Per-utterance state (reset on every final).
  private handled = 0
  private lastText = ""
  private lastChangeT = 0
  private lastSegs: string[] = []
  private lastIsFinal = false
  private recent: {[key: string]: number} = {}
  // ASR session management.
  private lastUpdateT = 0
  private restartAt = -1
  private restartAttempts = 0
  private errorShown = false
  // Indicator.
  private indRoot: SceneObject | null = null
  private indText: Text | null = null
  private indIconMat: Material | null = null
  private heardText = ""
  private heardUntil = 0
  private msgText = ""
  private msgUntil = 0
  private lastPlacedKey = ""
  // Clips.
  private audio: AudioComponent | null = null
  private queue: string[] = []
  private clipTimer: DelayedCallbackEvent | null = null
  private clipToken = 0
  /** Test aid: clip name -> seconds. A fake clip "plays" silently for that long, so the ASR pause / resume can be tested without audio files. */
  private fakeClips: {[name: string]: number} = {}

  onAwake() {
    ;(global as any).mwnpSparky = this
    this.asrEnabled = this.enableAsr
    this.createEvent("OnStartEvent").bind(() => this.start())
    this.createEvent("UpdateEvent").bind(() => this.tick())
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Typed-text hook: handles `text` exactly as a transcript from ASR (a final by default). */
  inject(text: string, isFinal: boolean = true): void {
    this.onTranscript(text, isFinal)
  }

  /** Test aid: registers a silent stand-in clip of `seconds` (see fakeClips). */
  addFakeClip(name: string, seconds: number): void {
    this.fakeClips[name.toLowerCase()] = seconds
  }

  /** Names of the real clips that are loaded (lower case, no extension). */
  clipNames(): string[] {
    const out: string[] = []
    for (const c of this.clips || []) if (c) out.push(c.name.toLowerCase().replace(/\.[a-z0-9]+$/, ""))
    return out
  }

  setAsrEnabled(on: boolean): void {
    this.asrEnabled = on
    if (!on) {
      this.listening = false
      if (this.asr) {
        try {
          this.asr.stopTranscribing()
        } catch (e) {
          /* already stopped */
        }
      }
    } else this.startAsr()
    this.refreshIndicator()
  }

  // ── Startup ───────────────────────────────────────────────────────────────

  private log(msg: string): void {
    print("[SPARKY-VOICE] t=" + getTime().toFixed(2) + "s " + msg)
  }

  private start(): void {
    this.main = (global as any).mwnpAssistant
    this.buildIndicator()
    if (this.asrEnabled) this.startAsr()
    this.refreshIndicator()
  }

  private startAsr(): void {
    if (!this.asrEnabled) return
    try {
      if (!this.asr) this.asr = require("LensStudio:AsrModule") as AsrModule
      const options = AsrModule.AsrTranscriptionOptions.create()
      options.mode = AsrModule.AsrMode.HighAccuracy
      options.silenceUntilTerminationMs = 600
      options.onTranscriptionUpdateEvent.add((e: AsrModule.TranscriptionUpdateEvent) => {
        this.lastUpdateT = getTime()
        this.restartAttempts = 0
        this.errorShown = false
        this.onTranscript(e.text, e.isFinal)
      })
      options.onTranscriptionErrorEvent.add((code: AsrModule.AsrStatusCode) => {
        if (this.asrPaused) return // stopped on purpose while a clip plays
        this.log("ASR error " + code + ": restarting")
        this.listening = false
        this.errorShown = true
        this.scheduleRestart()
        this.refreshIndicator()
      })
      this.lastUpdateT = getTime()
      this.handled = 0
      this.lastText = ""
      this.asr.startTranscribing(options) // starting again cancels a running session and begins a new one
      this.listening = true
      this.log("ASR session started")
    } catch (e) {
      this.log("ASR could not start: " + e)
      this.listening = false
      this.errorShown = true
      this.scheduleRestart()
    }
    this.refreshIndicator()
  }

  private scheduleRestart(): void {
    this.restartAttempts++
    this.restartAt = getTime() + Math.min(10, 1.5 * this.restartAttempts)
  }

  // ── Transcripts ───────────────────────────────────────────────────────────

  private onTranscript(text: string, isFinal: boolean): void {
    if (this.asrPaused) return // a clip is playing: Sparky must not hear itself
    const now = getTime()
    const segs = wakeSegments(text)
    if (segs.length > 0) this.log((isFinal ? "final: " : "partial: ") + '"' + text + '"')
    if (text !== this.lastText) {
      this.lastText = text
      this.lastChangeT = now
    }
    this.lastSegs = segs
    this.lastIsFinal = isFinal
    this.process(isFinal ? "final" : "partial")
    if (isFinal) {
      this.handled = 0
      this.lastText = ""
      this.lastSegs = []
    }
  }

  /** Acts on every complete command not yet handled in this utterance. kind: "partial" | "settled" | "final". */
  private process(kind: string): void {
    for (let i = this.handled; i < this.lastSegs.length; i++) {
      const seg = this.lastSegs[i]
      const isLast = i === this.lastSegs.length - 1
      const cmd = parseCommand(seg)
      if (!cmd || !cmd.complete) {
        if (isLast && kind !== "final") break // may still grow into a command
        this.handled = i + 1
        if (kind === "final" && seg.length > 0) this.showMessage("Didn't catch that: " + seg)
        continue
      }
      if (cmd.needsSettle && isLast && kind === "partial") break // "log twelve" may become "log twelve point five"
      this.act(cmd)
      this.handled = i + 1
    }
  }

  private act(cmd: VoiceCommand): void {
    const now = getTime()
    const key = cmd.name + ":" + normalize(cmd.arg)
    if (this.recent[key] !== undefined && now - this.recent[key] < DEDUP_SEC) {
      this.log("ignored repeat: " + key)
      return
    }
    this.recent[key] = now
    const label = cmd.name === "log" || cmd.name === "highlight" ? cmd.name + " " + cmd.arg : cmd.name.replace(/_/g, " ")
    this.heardText = "Heard: " + label
    this.heardUntil = now + HEARD_SEC
    let result = "Not ready"
    try {
      if (this.main) result = this.main.voiceCommand(cmd.name, cmd.arg)
    } catch (e) {
      result = "Error: " + e
    }
    this.acted.push({name: cmd.name, arg: cmd.arg, result})
    this.log("ACT " + key + " -> " + result)
    this.showMessage(result)
    const wanted: string[] = ((this.main && this.main.voiceClips) || []).filter((n: string) => n.length > 0)
    this.requested.push(wanted.slice())
    this.playClips(wanted)
  }

  // ── Pre-recorded clips ────────────────────────────────────────────────────

  private hasClip(name: string): boolean {
    const n = name.toLowerCase()
    return this.fakeClips[n] !== undefined || this.clipNames().indexOf(n) >= 0
  }

  /** Plays the clips that exist, in order; ASR is stopped while they play and restarted after. A missing clip is skipped silently. */
  private playClips(names: string[]): void {
    const have = names.filter((n) => this.hasClip(n))
    if (have.length === 0) return
    this.queue = this.queue.concat(have)
    if (!this.asrPaused) this.pauseAsr()
    if (this.queue.length === have.length) this.playNext()
  }

  private pauseAsr(): void {
    this.asrPaused = true
    this.listening = false
    if (this.asr && this.asrEnabled) {
      try {
        this.asr.stopTranscribing()
      } catch (e) {
        /* nothing running */
      }
    }
    this.handled = 0
    this.lastText = ""
    this.lastSegs = []
    this.refreshIndicator()
  }

  private resumeAsr(): void {
    this.asrPaused = false
    this.startAsr()
  }

  private playNext(): void {
    const name = this.queue.shift()
    if (name === undefined) {
      this.resumeAsr()
      return
    }
    const key = name.toLowerCase()
    const token = ++this.clipToken
    const next = () => {
      if (token !== this.clipToken) return // superseded
      this.playNext()
    }
    let seconds = 0.2
    if (this.fakeClips[key] !== undefined) seconds = this.fakeClips[key]
    else {
      let asset: AudioTrackAsset | null = null
      for (const c of this.clips || []) if (c && c.name.toLowerCase().replace(/\.[a-z0-9]+$/, "") === key) asset = c
      try {
        if (!this.audio) this.audio = this.sceneObject.createComponent("Component.AudioComponent") as AudioComponent
        this.audio.audioTrack = asset as AudioTrackAsset
        this.audio.play(1)
        seconds = Math.max(0.2, this.audio.duration || 1)
      } catch (e) {
        this.log("clip " + name + " could not play: " + e)
      }
    }
    this.log("clip " + name + " (" + seconds.toFixed(1) + " s)")
    if (!this.clipTimer) this.clipTimer = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    this.clipTimer.bind(next)
    this.clipTimer.reset(seconds + 0.3) // a short tail so the room's last echo is gone before ASR restarts
  }

  // ── Indicator ─────────────────────────────────────────────────────────────

  private showMessage(text: string): void {
    this.msgText = text
    this.msgUntil = getTime() + MESSAGE_SEC
    this.refreshIndicator()
  }

  private buildIndicator(): void {
    if (!this.main) return
    const root = global.scene.createSceneObject("SparkyIndicator")
    root.setParent(this.main.sceneObject)
    root.createComponent("Component.Canvas")
    this.indRoot = root
    const iconSO = global.scene.createSceneObject("SparkyMic")
    iconSO.setParent(root)
    const img = iconSO.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = micIcon
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    iconSO.getTransform().setLocalScale(new vec3(2.4, 2.4, 1))
    this.indIconMat = mat
    const textSO = global.scene.createSceneObject("SparkyHeard")
    textSO.setParent(root)
    textSO.getTransform().setLocalPosition(new vec3(1.8, 0, 0))
    const t = textSO.createComponent("Component.Text") as Text
    t.size = 44 // about 1.0 cm tall in the world (size / 43.886)
    t.horizontalAlignment = HorizontalAlignment.Left
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(0, 28, -1.5, 1.5)
    t.textFill.color = new vec4(1, 1, 1, 1)
    t.text = ""
    this.indText = t
  }

  private refreshIndicator(): void {
    const now = getTime()
    let text = ""
    if (now < this.msgUntil) text = this.msgText
    else if (now < this.heardUntil) text = this.heardText
    this.indicatorText = text
    if (this.indText && this.indText.text !== text) this.indText.text = text
    if (this.indIconMat) {
      const c = !this.asrEnabled ? GRAY : this.errorShown || !this.listening ? RED : now < this.heardUntil || now < this.msgUntil ? AMBER : GREEN
      this.indIconMat.mainPass.baseColor = new vec4(c.x, c.y, c.z, 1)
    }
  }

  private placeIndicator(): void {
    if (!this.indRoot || !this.main) return
    const p: vec3 = this.main.voiceIndicatorPos
    const key = p.x.toFixed(2) + "," + p.y.toFixed(2) + "," + p.z.toFixed(2)
    if (key === this.lastPlacedKey) return
    this.lastPlacedKey = key
    const t = this.indRoot.getTransform()
    t.setLocalPosition(p)
    // Same tilt as the cards (the Library's host carries the layout's rotation).
    t.setWorldRotation(this.main.libraryCard.sceneObject.getTransform().getWorldRotation())
  }

  // ── Per-frame ─────────────────────────────────────────────────────────────

  private tick(): void {
    const now = getTime()
    this.placeIndicator()
    this.refreshIndicator()
    // A command with an argument whose text has stopped changing.
    if (!this.lastIsFinal && this.lastSegs.length > 0 && now - this.lastChangeT >= SETTLE_SEC) this.process("settled")
    if (this.asrEnabled && !this.asrPaused) {
      if (this.restartAt >= 0 && now >= this.restartAt) {
        this.restartAt = -1
        this.startAsr()
      } else if (this.listening && now - this.lastUpdateT > SILENCE_RESTART_SEC) {
        this.log("silence for " + SILENCE_RESTART_SEC + " s: restarting the ASR session")
        this.startAsr()
      }
    }
  }
}
