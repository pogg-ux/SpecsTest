# Sparky voice clips (for ElevenLabs)

Put the files in `Assets/Audio/Sparky/` (MP3). Names are matched by file name, case-insensitive, extension ignored, so the names below are exact. A clip that is missing is skipped silently: Sparky still acts, it just does not speak that line.

While a clip plays, Sparky stops listening and ignores anything it "hears"; it starts listening again about 0.3 s after the clip ends.

After adding files, either drag all of them into the **Clips** list on the `SparkyVoice` object's script in the Inspector, or ask Claude to "wire the Sparky clips" (it fills that list from the folder).

Spellings are written for speech (T S four, F one in), the same way as `VO_ELEVENLABS.md`. Keep one voice for every clip. Calm, clear, mid-pace.

## Step clips (spoken when a step is shown by voice: next, back, repeat, after a logged reading, after undo)

| File | Line |
|---|---|
| `step_EXTEND_1.mp3` | Step 1. Meter T S four to T S two. Expect twelve volts with S one up. |
| `step_EXTEND_2.mp3` | Step 2. Meter F one in to T S two. Expect twelve volts with S one up. |
| `step_EXTEND_3.mp3` | Step 3. Meter F one out to T S two. Expect twelve volts with S one up. |
| `step_EXTEND_4.mp3` | Step 4. Meter L one plus to T S two. Expect twelve volts with S one up. |
| `step_RETRACT_1.mp3` | Step 1. Meter T S five to T S two. Expect twelve volts with S one down. |
| `step_RETRACT_2.mp3` | Step 2. Meter F two in to T S two. Expect twelve volts with S one down. |
| `step_RETRACT_3.mp3` | Step 3. Meter F two out to T S two. Expect twelve volts with S one down. |
| `step_RETRACT_4.mp3` | Step 4. Meter L two plus to T S two. Expect twelve volts with S one down. |
| `step_Neither_1.mp3` | Step 1. Meter T S one to T S two. Expect twelve volts with the power supply on. |

(EXTEND and RETRACT have four measured steps; the fifth entry in their check order is the lamp check that ends in a finding. "Neither" has one measured step.)

## Response clips

| File | When | Line |
|---|---|---|
| `logged.mp3` | A reading was logged by voice and is in spec (or has no tolerance) | Logged. Say undo to remove it. |
| `out_of_range.mp3` | A voice reading is an open circuit (for example 0 V) | That reading is out of range for this test point. |
| `cant_confirm.mp3` | A voice reading matches nothing in the job files (the amber "can't determine" case) | I can't confirm that from the job files. Recheck your meter leads and enter it again. |
| `undone.mp3` | "Undo" removed the last reading | Undone. |
| `nothing_to_undo.mp3` | "Undo" with nothing to undo | Nothing to undo. |
| `which_wire.mp3` | "Highlight wire" with an id that is not a clear single match (for example "three d") | Which wire? |
| `dismiss_safety.mp3` | Any voice command while the safety notice is still showing | Dismiss the safety notice first. |

A reading that logs and advances plays two clips in order: `logged`, then the new step's clip. Undo plays `undone`, then the step clip it returned to.

## Total

9 step clips + 7 response clips = 16 files.
