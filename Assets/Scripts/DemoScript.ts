// DemoScript.ts — the demo's 17 lines: which spoken clip goes with which command, in the order they are stepped through.
//
// Copied from devpost/demo_commands.txt (clip|command, one per line). A Lens cannot read files outside Assets/ at runtime, so the
// lines live here as a constant; if devpost/demo_commands.txt changes, change DEMO_LINES (and DEMO_CLIPS, same order) to match.
// tech_15 ("yes") is not part of the script; tech_17 ("hide") and tech_18 ("show") are. Used only by DemoDriver.ts.

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
  {clip: "tech_05.mp3", command: "Sparky, log twelve point zero"},
  {clip: "tech_18.mp3", command: "Sparky, show"},
  {clip: "tech_06.mp3", command: "Sparky, log zero"},
  {clip: "tech_07.mp3", command: "Sparky, why that terminal"},
  {clip: "tech_08.mp3", command: "Sparky, what's the torque spec on the terminals"},
  {clip: "tech_11.mp3", command: "Sparky, retest"},
  {clip: "tech_12.mp3", command: "Sparky, log twelve point zero"},
  {clip: "tech_13.mp3", command: "Sparky, yes fixed"},
  {clip: "tech_09.mp3", command: "Sparky, note replaced F1, half amp fast-blow"},
  {clip: "tech_10.mp3", command: "Sparky, save note"},
  {clip: "tech_14.mp3", command: "Sparky, end job"},
  {clip: "tech_16.mp3", command: "Sparky, show labels"},
]

/**
 * Autoplay (P key): seconds to hold after each line - once its clip, its command and any Sparky speech (clip, TTS, live answer) have
 * fully finished - before the next line starts. Same order as DEMO_LINES; tweak the numbers here.
 */
export const DEMO_HOLD_SEC: number[] = [
  7, //   1  understood
  2, //   2  report symptom
  10, //  3  extend doesn't work (labels fade)
  10, //  4  hide
  1.5, // 5  log twelve point one
  1.5, // 6  log twelve point zero
  1.5, // 7  show
  6, //   8  log zero
  1.5, // 9  why that terminal
  6, //   10 what's the torque spec
  2, //   11 retest (S1 is flipped to UP when this line has finished)
  2, //   12 log twelve point zero
  1.5, // 13 yes fixed
  1.5, // 14 note
  1.5, // 15 save note
  5, //   16 end job
  15, //  17 show labels
]

/** Autoplay: seconds to wait after P before the first line (the Sparky intro gets added in the edit). */
export const DEMO_INTRO_HOLD_SEC = 15

/** The clips, in the same order as DEMO_LINES (static references so Lens Studio imports and bundles them). */
export const DEMO_CLIPS: AudioTrackAsset[] = [
  requireAsset("../Audio/Tech/tech_01.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_02.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_03.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_17.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_04.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_05.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_18.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_06.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_07.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_08.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_11.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_12.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_13.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_09.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_10.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_14.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_16.mp3") as AudioTrackAsset,
]
