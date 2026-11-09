// DemoScript.ts — the demo's 21 lines: which spoken clip goes with which command, in the order they are stepped through.
//
// Copied from devpost/demo_commands.txt (clip|command, one per line). A Lens cannot read files outside Assets/ at runtime, so the
// lines live here as a constant; if devpost/demo_commands.txt changes, change DEMO_LINES (and DEMO_CLIPS, same order) to match.
// The Library lines (library, close) are not in the script: after "understood" the Library menu is already open. tech_15 (yes) confirms
// the readback of "log twelve point oh"; tech_20 (close) is used twice.

export interface DemoLine {
  /** Clip file name in Assets/Audio/Tech. */
  clip: string
  /** Exactly what the transcript would say (wake word included); sent through mwnpSparky.inject(command, true). */
  command: string
}

export const DEMO_LINES: DemoLine[] = [
  {clip: "tech_01.mp3", command: "Sparky, understood"},
  {clip: "tech_02.mp3", command: "Sparky, report symptom"},
  {clip: "tech_03.mp3", command: "Sparky, extend doesn't work"},
  {clip: "tech_17.mp3", command: "Sparky, hide"},
  {clip: "tech_04.mp3", command: "Sparky, log twelve point one"},
  {clip: "tech_22.mp3", command: "Sparky, log twelve point oh"},
  {clip: "tech_15.mp3", command: "Sparky, yes"},
  {clip: "tech_18.mp3", command: "Sparky, show"},
  {clip: "tech_19.mp3", command: "Sparky, show schematic"},
  {clip: "tech_20.mp3", command: "Sparky, close"},
  {clip: "tech_06.mp3", command: "Sparky, log zero"},
  {clip: "tech_07.mp3", command: "Sparky, why that terminal"},
  {clip: "tech_08.mp3", command: "Sparky, what's the torque spec on the terminals"},
  {clip: "tech_11.mp3", command: "Sparky, retest"},
  {clip: "tech_12.mp3", command: "Sparky, log twelve point zero"},
  {clip: "tech_13.mp3", command: "Sparky, yes fixed"},
  {clip: "tech_09.mp3", command: "Sparky, note replaced F1, half amp fast-blow"},
  {clip: "tech_10.mp3", command: "Sparky, save note"},
  {clip: "tech_14.mp3", command: "Sparky, end job"},
  {clip: "tech_20.mp3", command: "Sparky, close"},
  {clip: "tech_16.mp3", command: "Sparky, show labels"},
]

/**
 * Autoplay (P key): seconds to hold after each line - once its clip, its command and any Sparky speech (clip, TTS, live answer) have
 * fully finished - before the next line starts. Same order as DEMO_LINES; tweak the numbers here.
 */
export const DEMO_HOLD_SEC: number[] = [
  15, // 1   understood
  1, // 2   report symptom
  8.5, // 3   extend doesn't work
  10, // 4   hide
  1, // 5   log twelve point one
  1, // 6   log twelve point oh
  7, // 7   yes (confirms the readback)
  1, // 8   show
  4.5, // 9   show schematic
  1, // 10  close (the schematic)
  7, // 11  log zero
  1, // 12  why that terminal
  8, // 13  what's the torque spec
  2, // 14  retest (S1 is flipped to UP when this line has finished)
  1, // 15  log twelve point zero
  1, // 16  yes fixed
  1, // 17  note
  7.5, // 18  save note
  4, // 19  end job
  1, // 20  close (the report)
  18, // 21  show labels
]

/** Autoplay: seconds to hold after Sparky's spoken intro, before line 1. */
export const DEMO_INTRO_HOLD_SEC = 2

/** What Sparky says (through the same text-to-speech path as Sparky, ask): before line 1, after "end job", and after the last line's hold. */
export const DEMO_INTRO_SPEECH =
  "Hi, I'm Sparky, the no-guess assistant inside FaultLens. I only tell you what your prints and your meter can prove. Let me show you how we work together."
export const DEMO_SIGNOFF_SPEECH = "Job closed. Fault found, fixed, and logged. Nothing guessed."
export const DEMO_CLOSER_SPEECH = "Grab your meter. Let's get to work."

/** The clips, in the same order as DEMO_LINES (static references so Lens Studio imports and bundles them). */
export const DEMO_CLIPS: AudioTrackAsset[] = [
  requireAsset("../Audio/Tech/tech_01.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_02.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_03.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_17.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_04.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_22.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_15.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_18.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_19.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_20.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_06.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_07.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_08.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_11.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_12.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_13.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_09.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_10.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_14.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_20.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_16.mp3") as AudioTrackAsset,
]
