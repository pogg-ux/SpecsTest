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
import {ask, OFFLINE, readToken, speak} from "./SparkyAsk"

const micIcon = requireAsset("../Icons/mic.png") as Texture
const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material

const DEDUP_SEC = 2.0
/** Seconds without a change before new words count as a new utterance (the old one never got a final). */
const NEW_UTTERANCE_SEC = 3.0
const SETTLE_SEC = 1.0 // a command with an argument acts when its text has not changed for this long (or on the final)
const HEARD_SEC = 2.0
const MESSAGE_SEC = 4.0
const MAX_FAILURES = 6 // real ASR errors in a row before Sparky gives up (the buttons keep working)

/** Seconds after a clip or an Ask answer ends before Sparky listens again: its own last echo must not be heard as a command. */
const SPEAK_TAIL_SEC = 0.5

const BLUE = new vec4(0.35, 0.65, 1, 1)
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
  @input
  @allowUndefined
  @hint("Local secret file Assets/Local/RsgSecret.json (gitignored). Only needed for Sparky, ask ...; leave empty on a fresh clone.")
  rsgSecret: JsonAsset

  /** Clip names each command asked for (whether or not the file exists): for tests and the log. */
  requested: string[][] = []
  /** True while a clip is playing and ASR is stopped. */
  asrPaused: boolean = false
  /**
   * True while Sparky is speaking: from the start of any clip or Ask answer until SPEAK_TAIL_SEC after it ends (ASR stays stopped for
   * exactly that time). Everything "heard" meanwhile is dropped, and the mic indicator shows "Speaking...".
   */
  get speaking(): boolean {
    return this.asrPaused
  }
  /** How many transcripts were dropped because Sparky was speaking (tests, log). */
  droppedWhileSpeaking: number = 0

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
  private failures = 0
  private sessionId = 0
  private sessionStartT = 0
  private heardAudio = false
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
      this.sessionId++
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
    ;(global as any).mwnpAskTimerHost = this
    this.buildIndicator()
    this.buildAnswerCard()
    if (this.asrEnabled) this.startAsr()
    this.refreshIndicator()
  }

  private startAsr(): void {
    if (!this.asrEnabled || this.asrPaused) return
    // Every session gets an id. Starting a session while one is running cancels the old one, and that cancellation raises an
    // error callback ("InternalError", "Pipe was already closed") on the OLD session: it carries a stale id and is ignored,
    // otherwise it would look like a failure and trigger another restart, forever.
    const id = ++this.sessionId
    try {
      if (!this.asr) this.asr = require("LensStudio:AsrModule") as AsrModule
      const options = AsrModule.AsrTranscriptionOptions.create()
      options.mode = AsrModule.AsrMode.HighAccuracy
      options.silenceUntilTerminationMs = 600
      options.onTranscriptionUpdateEvent.add((e: AsrModule.TranscriptionUpdateEvent) => {
        if (id !== this.sessionId) return
        if (!this.heardAudio) {
          this.heardAudio = true
          this.log("ASR: first transcript " + (getTime() - this.sessionStartT).toFixed(1) + " s after the session started: audio is reaching ASR")
        }
        this.lastUpdateT = getTime()
        this.failures = 0
        this.errorShown = false
        this.onTranscript(e.text, e.isFinal)
      })
      options.onTranscriptionErrorEvent.add((code: AsrModule.AsrStatusCode) => {
        if (id !== this.sessionId || this.asrPaused) return // a cancelled old session, or stopped on purpose while a clip plays
        this.onAsrError(code)
      })
      this.lastUpdateT = getTime()
      this.sessionStartT = getTime()
      this.heardAudio = false
      this.handled = 0
      this.lastText = ""
      this.asr.startTranscribing(options)
      this.listening = true
      this.log("ASR session " + id + " started")
    } catch (e) {
      this.log("ASR could not start: " + e)
      this.onAsrError(-1)
    }
    this.refreshIndicator()
  }

  /** A real error on the current session: stop it, wait, start a fresh one. Gives up (red mic, a message) after a few in a row. */
  private onAsrError(code: number): void {
    this.listening = false
    this.errorShown = true
    this.failures++
    this.log("ASR error " + code + " (failure " + this.failures + " of " + MAX_FAILURES + ")")
    this.sessionId++ // anything the dying session still says is stale
    try {
      if (this.asr) this.asr.stopTranscribing()
    } catch (e) {
      /* nothing running */
    }
    if (this.failures >= MAX_FAILURES) {
      this.restartAt = -1
      this.showMessage("Voice unavailable (speech recognition error " + code + ")")
      this.log("giving up after " + this.failures + " failures; buttons still work")
    } else {
      this.restartAt = getTime() + Math.min(10, 2 * this.failures)
    }
    this.refreshIndicator()
  }

  // ── Transcripts ───────────────────────────────────────────────────────────

  private onTranscript(text: string, isFinal: boolean): void {
    if (this.speaking) {
      // A clip or an answer is playing (or just ended): Sparky must not hear itself. Typed-text injection is dropped the same way.
      this.droppedWhileSpeaking++
      this.log("dropped while speaking: " + text)
      return
    }
    const now = getTime()
    // A new utterance that follows one with no final (ASR restarted, a session replaced) must not inherit its "already handled" count,
    // or its first command is skipped ("Sparky, retest" worked, then "Sparky, show card" was swallowed).
    if (this.lastText !== "" && now - this.lastChangeT > NEW_UTTERANCE_SEC) {
      this.handled = 0
      this.lastText = ""
      this.lastSegs = []
    }
    const segs = wakeSegments(text)
    if (segs.length > 0) this.log((isFinal ? "final: " : "partial: ") + '"' + text + '"')
    else if (isFinal && text.trim().length > 0) {
      // ASR is hearing something but it does not start with the wake word: say so on screen, so a silent Sparky can be told from a deaf one.
      this.log('heard, no wake word: "' + text + '"')
      const shown = text.trim().length > 34 ? text.trim().substring(0, 34) + "..." : text.trim()
      this.heardText = 'Heard: "' + shown + '" (start with Sparky)'
      this.heardUntil = now + HEARD_SEC
    }
    // Words already acted on were replaced by different words (not just extended or re-spelled): a new utterance, so start counting again.
    for (let i = 0; i < this.handled && i < this.lastSegs.length; i++) {
      const was = this.lastSegs[i]
      const now2 = segs[i] === undefined ? "" : segs[i]
      if (!(now2.indexOf(was) === 0 || was.indexOf(now2) === 0)) {
        this.handled = 0
        break
      }
    }
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
      if (cmd.settleSec && kind === "settled" && isLast && getTime() - this.lastChangeT < cmd.settleSec) break
      this.act(cmd)
      this.handled = i + 1
    }
    // Dictation grows after it was first acted on (a pause mid-sentence): keep the dictated card up to date.
    const k = this.handled - 1
    if (k >= 0 && k < this.lastSegs.length) {
      const c = parseCommand(this.lastSegs[k])
      if (c && c.name === "note" && c.arg !== this.lastNoteArg) this.act(c)
    }
  }

  private lastNoteArg = ""

  private act(cmd: VoiceCommand): void {
    if (cmd.name === "note") this.lastNoteArg = cmd.arg
    const now = getTime()
    const key = cmd.name + ":" + normalize(cmd.arg)
    if (this.recent[key] !== undefined && now - this.recent[key] < DEDUP_SEC) {
      this.log("ignored repeat: " + key)
      return
    }
    this.recent[key] = now
    const label = cmd.name === "log" || cmd.name === "highlight" || cmd.name === "ask" ? cmd.name + " " + cmd.arg : cmd.name.replace(/_/g, " ")
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
    if (cmd.name === "close") this.hideAnswer()
    const askReq = this.main && this.main.takeAsk ? this.main.takeAsk() : null
    if (askReq) this.runAsk(askReq)
  }

  // ── Ask Sparky (grounded question, spoken + shown answer) ─────────────────

  /** Test hooks: speak the answer (needs a text-to-speech request); override the token (null = none) instead of the secret file. */
  askSpeak = true
  askTokenOverride: string | null | undefined = undefined
  /** "idle" | "thinking" | "done" | "failed" and the text on the answer card. */
  askState = "idle"
  answerText = ""
  private answerUntil = -1
  private answerRoot: SceneObject | null = null
  private answerTextComp: Text | null = null

  /** True when a token is available for "ask" (the secret file, or the test override). */
  hasAskToken(): boolean {
    return (this.askTokenOverride !== undefined ? this.askTokenOverride || "" : readToken(this.rsgSecret)).length > 0
  }

  private runAsk(req: {question: string; context: string}): void {
    if (this.askState === "thinking") {
      this.showMessage("Still thinking...")
      return
    }
    this.askState = "thinking"
    this.showAnswer("Thinking...", false)
    const token = this.askTokenOverride !== undefined ? this.askTokenOverride || "" : readToken(this.rsgSecret)
    const t0 = getTime()
    this.log("ASK question: " + req.question + " (context " + req.context.length + " chars)")
    ask(req.question, req.context, token).then(
      (text: string) => {
        this.log("ASK answer after " + (getTime() - t0).toFixed(2) + " s: " + text)
        this.answerText = text
        this.askState = "done"
        this.showAnswer(text, true)
        if (!this.askSpeak) return
        const s0 = getTime()
        speak(text, token).then(
          (track: AudioTrackAsset) => {
            this.log("ASK speech ready after " + (getTime() - s0).toFixed(2) + " s")
            this.playTrack(track)
          },
          (e: any) => this.log("ASK speech failed: " + e)
        )
      },
      (e: any) => {
        this.log("ASK failed after " + (getTime() - t0).toFixed(2) + " s: " + e)
        this.answerText = OFFLINE
        this.askState = "failed"
        this.showAnswer(OFFLINE, true)
        this.playClips(["live_needs_connection"]) // skipped silently when the clip file does not exist
      }
    )
  }

  /** Plays a spoken answer: ASR is stopped while it plays and restarted after (like the clips). */
  playTrack(track: AudioTrackAsset): void {
    this.queue = []
    const token = ++this.clipToken
    if (!this.asrPaused) this.pauseAsr()
    let len = 1
    try {
      if (!this.audio) this.audio = this.sceneObject.createComponent("Component.AudioComponent") as AudioComponent
      this.audio.audioTrack = track
      this.audio.play(1)
      len = Math.max(0.2, this.audio.duration || 1)
    } catch (e) {
      this.log("answer could not play: " + e)
    }
    this.log("ASK speaking (" + len.toFixed(1) + " s)")
    if (!this.clipTimer) this.clipTimer = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    this.clipTimer.bind(() => {
      if (token !== this.clipToken) return
      this.resumeAsr()
    })
    this.clipTimer.reset(len + SPEAK_TAIL_SEC)
    this.answerUntil = Math.max(this.answerUntil, getTime() + len + 6)
  }

  private buildAnswerCard(): void {
    if (!this.indRoot) return
    const root = global.scene.createSceneObject("SparkyAnswer")
    root.setParent(this.indRoot)
    root.getTransform().setLocalPosition(new vec3(21, -6.2, 0)) // free space right of the mic, above the cabinet, inside the display's right edge
    const bgSO = global.scene.createSceneObject("SparkyAnswerBack")
    bgSO.setParent(root)
    const img = bgSO.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    const white = ProceduralTextureProvider.create(2, 2, Colorspace.RGBA)
    ;(white.control as ProceduralTextureProvider).setPixels(0, 0, 2, 2, new Uint8Array(16).fill(255))
    mat.mainPass.baseTex = white
    mat.mainPass.baseColor = new vec4(0.3, 0.32, 0.36, 0.97) // mid grey like the cards: dark reads as transparent on the additive display
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    bgSO.getTransform().setLocalScale(new vec3(19, 9.5, 1))
    const textSO = global.scene.createSceneObject("SparkyAnswerText")
    textSO.setParent(root)
    textSO.getTransform().setLocalPosition(new vec3(0, 0, 0.05))
    const t = textSO.createComponent("Component.Text") as Text
    t.size = 40
    t.horizontalAlignment = HorizontalAlignment.Left
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Wrap
    t.verticalOverflow = VerticalOverflow.Shrink
    t.layoutRect = Rect.create(-8.6, 8.6, -4.3, 4.3)
    t.textFill.color = new vec4(1, 1, 1, 1)
    t.text = ""
    this.answerTextComp = t
    this.answerRoot = root
    root.enabled = false
  }

  /** The small answer card under the mic indicator (stays visible when the cards are hidden). */
  private showAnswer(text: string, autoHide: boolean): void {
    if (!this.answerRoot) return
    if (this.answerTextComp) this.answerTextComp.text = text
    this.answerRoot.enabled = true
    this.answerUntil = autoHide ? getTime() + 14 : -1
  }

  /** Test hook: show a given text on the answer card (to look at a long answer without a request). */
  setAnswerTextForTest(text: string): void {
    this.showAnswer(text, false)
  }

  hideAnswer(): void {
    if (this.answerRoot) this.answerRoot.enabled = false
    this.answerUntil = -1
  }

  /** True while the answer card is up (tests). */
  get answerVisible(): boolean {
    return !!this.answerRoot && this.answerRoot.enabled
  }

  // ── Pre-recorded clips ────────────────────────────────────────────────────

  /** Test hook: false = ignore the real mp3 clips (stand-ins from addFakeClip still play), so typed-text tests do not wait on audio. */
  private realClips = true
  setRealClips(on: boolean): void {
    this.realClips = on
  }

  private hasClip(name: string): boolean {
    const n = name.toLowerCase()
    return this.fakeClips[n] !== undefined || (this.realClips && this.clipNames().indexOf(n) >= 0)
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
    this.log("ASR paused for clips (session " + this.sessionId + " stopped)")
    this.asrPaused = true
    this.sessionId++ // whatever the stopping session still says is stale
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
    this.log("ASR resuming after clips")
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
    // Clips in a queue are followed by the next clip after the same gap; after the last one ASR restarts, so the room's last echo is gone.
    this.clipTimer.reset(seconds + SPEAK_TAIL_SEC)
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
    if (this.speaking) text = "Speaking..."
    else if (now < this.msgUntil) text = this.msgText
    else if (now < this.heardUntil) text = this.heardText
    this.indicatorText = text
    if (this.indText && this.indText.text !== text) this.indText.text = text
    if (this.indIconMat) {
      const c = this.speaking ? BLUE : !this.asrEnabled ? GRAY : this.errorShown || !this.listening ? RED : now < this.heardUntil || now < this.msgUntil ? AMBER : GREEN
      this.indIconMat.mainPass.baseColor = new vec4(c.x, c.y, c.z, 1)
    }
  }

  private placeIndicator(): void {
    if (!this.indRoot || !this.main) return
    const p: vec3 = this.main.voiceIndicatorPos
    const ao: vec3 = this.main.answerCardOffset
    const key = p.x.toFixed(2) + "," + p.y.toFixed(2) + "," + p.z.toFixed(2) + "|" + ao.x.toFixed(2) + "," + ao.y.toFixed(2)
    if (key === this.lastPlacedKey) return
    this.lastPlacedKey = key
    if (this.answerRoot) this.answerRoot.getTransform().setLocalPosition(ao) // right of the cabinet (MWNPMain.placeChips)
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
    if (this.answerUntil >= 0 && now > this.answerUntil) this.hideAnswer()
    // A command with an argument whose text has stopped changing.
    if (!this.lastIsFinal && this.lastSegs.length > 0 && now - this.lastChangeT >= SETTLE_SEC) this.process("settled")
    if (this.asrEnabled && !this.asrPaused) {
      if (this.restartAt >= 0 && now >= this.restartAt) {
        this.restartAt = -1
        this.startAsr()
      }
      // No restart on silence: a quiet session is normal and a restart cancels it (the spike ran 10 minutes on one session).
    }
  }
}
