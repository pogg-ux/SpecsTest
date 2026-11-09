// DemoDriver.ts — preview-only demo driver: a keyboard-stepped script of spoken clips and the commands they stand for.
//
// OFF unless DEMO_DRIVER is true (below). When on, and only in the Lens Studio preview:
//   Right arrow  plays the next clip (Assets/Audio/Tech) through the Lens audio and, at the same moment, sends its command through
//                mwnpSparky.inject(command, true) - exactly like a final transcript from live speech.
//   Left arrow   steps back one line without playing anything (the next Right arrow plays that line again).
// Live ASR is switched off while it runs, so the speakers cannot trigger Sparky. It shows nothing on screen; it only logs "[DEMO] ...".
// Owns: the cursor over the 16 DemoScript lines, the key polling, the clip playback. Must not: act on a command (SparkyVoice does).
// Test handle: global.mwnpDemo (only when it is running); DemoRunner is the cursor logic, tested on its own.

import {DEMO_CLIPS, DEMO_LINES, DemoLine} from "./DemoScript"

/** Set to true to turn the demo driver on (preview only). */
export const DEMO_DRIVER = false

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
}

@component
export class DemoDriver extends BaseScriptComponent {
  private runner: DemoRunner | null = null
  private audio: AudioComponent | null = null
  private sparky: any = null
  private armed = false
  private rightWas = false
  private leftWas = false

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
      this.runner = new DemoRunner(
        DEMO_LINES,
        (i) => this.playClip(i),
        (command, isFinal) => {
          const dropped = this.sparky.droppedWhileSpeaking
          this.sparky.inject(command, isFinal)
          if (this.sparky.droppedWhileSpeaking > dropped) print("[DEMO] dropped: Sparky was still speaking when this line was sent")
        },
        (msg) => print("[DEMO] " + msg)
      )
      ;(global as any).mwnpDemo = this.runner
      print("[DEMO] driver on: live ASR off. Right arrow = next line (plays + sends), Left arrow = back one (silent)")
    }
    const right = KeyboardManager.isKeyPressed(Keys.Right)
    const left = KeyboardManager.isKeyPressed(Keys.Left)
    if (right && !this.rightWas && this.runner) this.runner.next()
    if (left && !this.leftWas && this.runner) this.runner.back()
    this.rightWas = right
    this.leftWas = left
  }

  private playClip(i: number): void {
    try {
      if (!this.audio) this.audio = this.sceneObject.createComponent("Component.AudioComponent") as AudioComponent
      this.audio.stop(false) // a clip still playing from the previous line is cut
      this.audio.audioTrack = DEMO_CLIPS[i]
      this.audio.play(1)
    } catch (e) {
      print("[DEMO] clip " + DEMO_LINES[i].clip + " could not play: " + e)
    }
  }
}
