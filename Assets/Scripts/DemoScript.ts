// DemoScript.ts — the demo's 16 lines: which spoken clip goes with which command.
//
// Copied from devpost/demo_commands.txt (clip|command, one per line). A Lens cannot read files outside Assets/ at runtime, so the
// lines live here as a constant; if devpost/demo_commands.txt changes, change DEMO_LINES to match. Used only by DemoDriver.ts.

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
  {clip: "tech_04.mp3", command: "Sparky, log twelve point one"},
  {clip: "tech_05.mp3", command: "Sparky, log twelve point zero"},
  {clip: "tech_06.mp3", command: "Sparky, log zero"},
  {clip: "tech_07.mp3", command: "Sparky, why that terminal"},
  {clip: "tech_08.mp3", command: "Sparky, what's the torque spec on the terminals"},
  {clip: "tech_09.mp3", command: "Sparky, note replaced F1, half amp fast-blow"},
  {clip: "tech_10.mp3", command: "Sparky, save note"},
  {clip: "tech_11.mp3", command: "Sparky, retest"},
  {clip: "tech_12.mp3", command: "Sparky, log twelve point zero"},
  {clip: "tech_13.mp3", command: "Sparky, yes fixed"},
  {clip: "tech_14.mp3", command: "Sparky, end job"},
  {clip: "tech_15.mp3", command: "Sparky, yes"},
  {clip: "tech_16.mp3", command: "Sparky, show labels"},
]

/** The clips, in the same order as DEMO_LINES (static references so Lens Studio imports and bundles them). */
export const DEMO_CLIPS: AudioTrackAsset[] = [
  requireAsset("../Audio/Tech/tech_01.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_02.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_03.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_04.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_05.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_06.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_07.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_08.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_09.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_10.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_11.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_12.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_13.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_14.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_15.mp3") as AudioTrackAsset,
  requireAsset("../Audio/Tech/tech_16.mp3") as AudioTrackAsset,
]
