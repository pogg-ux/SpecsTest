// DemoDriver.ts — preview-only demo driver: a keyboard-stepped script of spoken clips and the commands they stand for.
//
// OFF unless DEMO_DRIVER is true (below). When on, and only in the Lens Studio preview:
//   N  plays the next clip (Assets/Audio/Tech) through the Lens audio and, when the clip has ended, sends its command through
//      mwnpSparky.inject(command, true) - exactly like a final transcript from live speech - so Sparky's reply plays after the
//      tech's line, not over it. (Pressing N again before that sends the pending command at once, so none is lost or reordered.)
//   B  steps back one line without playing anything (the next N plays that line again).
//   P  autoplay: starts from line 1 (the cursor is reset first) and plays the whole script; P again stops it. Per line: the clip,
//      then its command, then it waits until the clip AND all Sparky speech (clip, TTS, live Ask answer) have fully finished, then
//      holds DEMO_HOLD_SEC[line] seconds. DEMO_INTRO_HOLD_SEC passes before the first line. When "retest" has finished, S1 is flipped
//      to UP (the retest waits for it). N / B are ignored while autoplay runs.
// (Not the arrow keys, W/A/S/D or Q/E: the Spectacles preview uses those for camera movement.)
// Live ASR is switched off while it runs, so the speakers cannot trigger Sparky. It shows nothing on screen; it only logs "[DEMO] ...".
// Owns: the cursor over the DemoScript lines, the key polling, the clip playback, the autoplay timing. Must not: act on a command
// (SparkyVoice does).
// Test handle: global.mwnpDemo (only when it is running); DemoRunner and DemoAutoplay are the cursor / timing logic, tested on their own.

import {DEMO_CLIPS, DEMO_HOLD_SEC, DEMO_INTRO_HOLD_SEC, DEMO_LINES, DemoLine} from "./DemoScript"

/** Set to true to turn the demo driver on (preview only). */
export const DEMO_DRIVER = false

/** Seconds between the end of a tech clip and its command being sent. */
const CLIP_GAP_SEC = 0.2

/** The cursor over the lines. `cursor` is the line the next step forward plays. */
export class DemoRunner {
  cursor = 0
  constructor(
    private lines: DemoLine[],
    private play: (index: number) => void,
    private inject: (command: string, isFinal: boolean) => void,
    private log: (msg: string) => void
  ) {}

  get length(): number {
    return this.lines.length
  }

  /** Plays the clip of the next line and sends its command in the same call. False at the end of the script. */
  next(): boolean {
    if (this.cursor >= this.lines.length) {
      this.log("end of the script (" + this.lines.length + " lines)")
      return false
    }
    const i = this.cursor++
    const line = this.lines[i]
    this.log("line " + (i + 1) + "/" + this.lines.length + ": " + line.clip + " | " + line.command)
    this.play(i)
    this.inject(line.command, true)
    return true
  }

  /** Steps back one line without playing: the next step forward plays that line again. */
  back(): boolean {
    if (this.cursor <= 0) {
      this.log("already at the first line")
      return false
    }
    this.cursor--
    this.log("back to line " + (this.cursor + 1) + " (not played)")
    return true
  }

  /** Back to the first line. */
  reset(): void {
    this.cursor = 0
  }
}

/** What the autoplay needs from its surroundings (so it can be driven without keys or audio in a test). */
export interface AutoplayHost {
  now(): number
  /** True while the line's clip is playing, its command is waiting to be sent, or Sparky is still speaking. */
  busy(): boolean
  /** Flips S1 to UP (the retest waits for it). */
  flipS1(): void
  log(msg: string): void
}

/**
 * Plays the script by itself: intro hold, then for each line: play + send, wait until nothing is playing or being said, hold the
 * line's DEMO_HOLD_SEC, next. Call tick() every frame.
 */
export class DemoAutoplay {
  running = false
  finished = false
  /** 0-based index of the line being played or held (-1 before the first). */
  line = -1
  private state: "idle" | "intro" | "line" | "hold" = "idle"
  private until = 0
  private lineStart = 0

  constructor(
    private runner: DemoRunner,
    private host: AutoplayHost,
    private lines: DemoLine[],
    private holds: number[],
    private introSec: number,
    /** A line that is still "busy" after this long is given up on (a hung live answer must not stall the demo). */
    private maxWaitSec: number = 60
  ) {}

  /** Starts from line 1: the cursor is reset first. */
  start(): void {
    this.runner.reset()
    this.running = true
    this.finished = false
    this.line = -1
    this.state = "intro"
    this.until = this.host.now() + this.introSec
    this.host.log("autoplay started: " + this.introSec + " s before line 1")
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    this.state = "idle"
    this.host.log("autoplay stopped at line " + (this.line + 1))
  }

  private isRetest(i: number): boolean {
    return this.lines[i].command.toLowerCase().replace(/[^a-z ]/g, "").trim().endsWith("retest")
  }

  private playLine(): void {
    this.line++
    this.host.log("autoplay line " + (this.line + 1))
    this.lineStart = this.host.now()
    this.state = "line"
    this.runner.next()
  }

  tick(): void {
    if (!this.running) return
    const now = this.host.now()
    if (this.state === "intro") {
      if (now >= this.until) this.playLine()
    } else if (this.state === "line") {
      if (this.host.busy()) {
        if (now - this.lineStart < this.maxWaitSec) return
        this.host.log("autoplay line " + (this.line + 1) + " still busy after " + this.maxWaitSec + " s: moving on")
      }
      if (this.isRetest(this.line)) {
        this.host.log("autoplay: retest finished, S1 to UP")
        this.host.flipS1()
      }
      this.state = "hold"
      this.until = now + (this.line < this.holds.length ? this.holds[this.line] : 1.5)
    } else if (this.state === "hold") {
      if (now < this.until) return
      if (this.line + 1 >= this.lines.length) {
        this.running = false
        this.finished = true
        this.state = "idle"
        this.host.log("autoplay done")
      } else this.playLine()
    }
  }
}

@component
export class DemoDriver extends BaseScriptComponent {
  private runner: DemoRunner | null = null
  private autoplay: DemoAutoplay | null = null
  private audio: AudioComponent | null = null
  private sparky: any = null
  private armed = false
  private nextWas = false
  private backWas = false
  private autoWas = false
  /** Seconds the clip just started will play (the command follows it), and the command waiting for it to end. */
  private lastClipSec = 0
  private pending: string | null = null
  private sendTimer: DelayedCallbackEvent | null = null

  onAwake() {
    if (!DEMO_DRIVER) return
    if (!global.deviceInfoSystem.isEditor()) {
      print("[DEMO] DEMO_DRIVER is on but this is not the Lens Studio preview: not running")
      return
    }
    if (typeof KeyboardManager === "undefined") {
      print("[DEMO] this Lens Studio has no KeyboardManager: not running")
      return
    }
    this.createEvent("UpdateEvent").bind(() => this.tick())
  }

  private tick(): void {
    if (!this.armed) {
      // The first frame, after every OnStartEvent: SparkyVoice has started its ASR by now, so this is when it can be switched off.
      this.sparky = (global as any).mwnpSparky
      if (!this.sparky) return
      this.armed = true
      this.sparky.setAsrEnabled(false)
      const runner = new DemoRunner(
        DEMO_LINES,
        (i) => {
          this.flushPending() // a command still waiting for the previous clip goes out first
          this.lastClipSec = this.playClip(i)
        },
        (command) => this.sendAfterClip(command),
        (msg) => print("[DEMO] " + msg)
      )
      this.runner = runner
      this.autoplay = new DemoAutoplay(
        runner,
        {
          now: () => getTime(),
          busy: () => this.pending !== null || this.clipPlaying() || !!this.sparky.busySpeaking,
          flipS1: () => this.flipS1(),
          log: (msg) => print("[DEMO] " + msg),
        },
        DEMO_LINES,
        DEMO_HOLD_SEC,
        DEMO_INTRO_HOLD_SEC
      )
      ;(global as any).mwnpDemo = runner
      print("[DEMO] driver on: live ASR off. N = next line (plays, then sends), B = back one (silent), P = autoplay from line 1 / stop")
    }
    const next = KeyboardManager.isKeyPressed(Keys.N)
    const back = KeyboardManager.isKeyPressed(Keys.B)
    const auto = KeyboardManager.isKeyPressed(Keys.P)
    const autoRunning = !!this.autoplay && this.autoplay.running
    if (auto && !this.autoWas) this.toggleAutoplay()
    if (next && !this.nextWas && this.runner) {
      if (autoRunning) print("[DEMO] autoplay is running: N ignored (P stops it)")
      else this.runner.next()
    }
    if (back && !this.backWas && this.runner) {
      if (autoRunning) print("[DEMO] autoplay is running: B ignored (P stops it)")
      else this.runner.back()
    }
    this.nextWas = next
    this.backWas = back
    this.autoWas = auto
    if (this.autoplay) this.autoplay.tick()
  }

  private toggleAutoplay(): void {
    if (!this.autoplay) return
    if (this.autoplay.running) {
      this.autoplay.stop()
      this.pending = null // a command still waiting for its clip is not sent
      try {
        if (this.audio && this.audio.audioTrack) this.audio.stop(false)
      } catch (e) {
        // nothing was playing
      }
    } else {
      this.pending = null
      this.autoplay.start()
    }
  }

  private clipPlaying(): boolean {
    try {
      return !!this.audio && this.audio.isPlaying()
    } catch (e) {
      return false
    }
  }

  /** The retest waits for S1 UP: same effect as pinching the S1 toggle (MWNPMain's own S1 handler), done silently. */
  private flipS1(): void {
    const app = (global as any).mwnpAssistant
    if (!app) return
    if (app.getState().s1 === "UP") {
      print("[DEMO] S1 is already UP")
      return
    }
    print("[DEMO] S1 -> " + app.voiceCommand("s1_up"))
  }

  /** Plays the line's clip and returns how long it is (seconds; 0 if it could not play). */
  private playClip(i: number): number {
    try {
      if (!this.audio) this.audio = this.sceneObject.createComponent("Component.AudioComponent") as AudioComponent
      // The track goes in BEFORE anything else: stop() on an AudioComponent that has no track throws "Audio player is not enabled",
      // which is what silenced every clip. A new track replaces the one still playing, so no stop() is needed.
      this.audio.audioTrack = DEMO_CLIPS[i]
      this.audio.volume = 1
      this.audio.play(1)
      const sec = Math.max(0.2, this.audio.duration || 1)
      print("[DEMO] playing " + DEMO_LINES[i].clip + " (" + sec.toFixed(1) + " s); its command follows when it ends")
      return sec
    } catch (e) {
      print("[DEMO] clip " + DEMO_LINES[i].clip + " could not play: " + e)
      return 0
    }
  }

  /** Holds the command until the clip that was just started has ended (plus a breath), then sends it. */
  private sendAfterClip(command: string): void {
    this.pending = command
    if (!this.sendTimer) {
      this.sendTimer = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
      this.sendTimer.bind(() => this.flushPending())
    }
    this.sendTimer.reset(this.lastClipSec + CLIP_GAP_SEC)
  }

  private flushPending(): void {
    if (this.pending === null) return
    const command = this.pending
    this.pending = null
    const dropped = this.sparky.droppedWhileSpeaking
    this.sparky.inject(command, true)
    if (this.sparky.droppedWhileSpeaking > dropped) print("[DEMO] dropped: Sparky was still speaking when this line was sent")
  }
}
