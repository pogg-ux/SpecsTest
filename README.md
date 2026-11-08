# FaultLens — a SPECS Lens

**FaultLens: Hands-Free AR Field Assistant**

A hands-free troubleshooting assistant for industrial machine technicians, built for **Learn AR with SPECS** (Devpost × Snap).

The tech reports a symptom. The assistant answers **only from the machine's own job files** — wiring netlist, tolerances, check order — highlights the parts on the machine, traces the wire run, shows the expected voltage at each test point, logs the tech's meter readings, and flags the fault. If a reading doesn't match anything in the files, it says so instead of guessing.

Demo machine: the **MWNP 1.0**, a 12 VDC bench trainer I designed (SPDT toggle, two fused branches, EXTEND / RETRACT lamps standing in for an actuator).

## What it does (v1)
- **Library menu** docked upper left (collapsible, always reachable) → Job, Job control, Job report, Camera, Notes, Options
- **Job control:** End job files the report as Complete (readings, notes, pictures) and leaves a clean board and empty report; New job files any job in progress as "Ended early" and starts fresh; Save files a copy without ending the job. Every action has a Yes/No confirm, and previous jobs stay viewable read-only
- **Notes:** time-stamped tech notes (quick picks in preview, keyboard on device) plus automatic "Agent" notes at key moments, all included in the Job report
- **Symptom → path:** "EXTEND doesn't work" → outlines TS-4, F1, L1; draws the 2a/2b/2c trace; cites the schematic
- **Guided check order** with a number pad for real meter readings (not pass/fail)
- **Tolerance from the files:** each test point carries its own nominal, min/max and source; green / red / amber decided by rules in `netlist.json`
- **No-guess:** an unexplained reading (e.g. 6.0 V where 12 V or 0 V is expected) turns amber with "doesn't match any fault in the job files — recheck leads"
- **Finding card:** "F1 open", evidence, next action (lockout/tagout, replace with 0.5 A fast-blow, don't upsize), retest
- **Job report:** every reading with test point, value, range, time, plus snapshots
- **Camera card:** snapshot of the tech's view with labels; photo (device)
- **Hide / Show:** clear the view to work; labels can stay up
- **Options:** labels, hide behavior, card style, text size, schematic size
- **Zoomed, labeled schematic** of the active path

## How to open it
1. Lens Studio **5.23.2** (SPECS).
2. Open `SpecsTest.esproj`.
3. Preview panel → Interactive Preview, device SPECS. The workbench backdrop loads automatically (the `BenchBackdrop` object under the camera, preview only; it is disabled on Spectacles). No Multimedia mode setup needed.
4. Mouse click = pinch. Right-drag to look, scroll to move closer.

No SPECS glasses needed — everything runs in the Lens Studio preview.

## Key files
| Path | What |
|---|---|
| `devpost/design-brief.md` | The design brief (planned with the Devpost Learn skill pack) |
| `Assets/MWNP/netlist.json` | Job data: components, wires, test points, tolerances, reading rules, faults, check order |
| `Assets/MWNP/MWNP_1.0_wiring.png` / `.drawio` | Schematic (original work) |
| `Assets/MWNP/MWNP_1.0_panel_layout.png` | Panel layout the 3D model is built from |
| `Assets/Scripts/MWNP*.ts` | Lens logic (rule-based agent, cards, cabinet) |
| `Assets/LeafTests/` | LEAF test scenarios (11, all passing) |

## Preview stand-ins
- The 3D trainer stands in for a real cabinet; the tech marks parts by pinching (no live recognition in preview).
- Grab gesture and camera photos are device-only.
- **Sparky (voice) works in this build.** Say "Sparky, next", "back", "repeat", "log twelve point zero", "undo", "show schematic", "close", "open library", "open report", "open camera", "open job", "open options", "hide" / "show" (the cards), "fixed" / "not fixed", "end job" (asks yes or no first), "report symptom", "open notes", "note <text>" then "save note" (dictation), "retest", "new job", "yes" / "no", "more" / "less" and "cancel", or "highlight wire three b". It acts only on phrases that start with "Sparky" (TV and side talk are ignored), acts on a command as soon as it is complete, and shows what it heard next to the chips. It needs the microphone and an internet connection (speech recognition). Preview-tested with a headset in a noisy room. Every action still has a button; voice is on top, not instead. On the glasses, speech plus camera needs Extended or Transparent Permission (not tested on a device yet).
- **Ask Sparky (optional, needs a connection and a token).** "Sparky, ask why that terminal", "Sparky, what is the fuse rating", "Sparky, why ..." send the question to OpenAI chat through Snap's Remote Service Gateway with only the job files (netlist, tolerances, check order) and the current job (step, readings so far) as context. The answer is 1 to 2 short sentences, spoken with text-to-speech and shown on a small card under the mic icon; if the job files do not contain the answer, Sparky says exactly "I can't confirm that from the job files." The rule engine still decides every fact (which test point, pass or fail, the finding); the AI only answers questions from the files. Steps and responses keep using the pre-recorded clips (instant, offline).
  - **A fresh clone needs its own token for "ask"; everything else works without it.** Generate an OpenAI token in Lens Studio (Window > Remote Service Gateway Token), then create `Assets/Local/RsgSecret.json` containing `{"openai": "<your token>"}`. That folder is in `.gitignore`, so the token is never committed (it is also never put in the scene). In the Inspector, drag that file into **SparkyVoice > Rsg Secret** (it shows as empty on a fresh clone). Without the token, or offline, "ask" answers "Live answers need a connection."
- The agent is rule-based by design: no AI decides anything in the diagnosis, so it cannot invent a finding. The optional "ask" answers questions only from the job files and refuses otherwise.

## Where the data goes
v1 keeps job reports, readings, notes and pictures **for the session only** ("Save (this session)"); nothing leaves the glasses. The planned v2 path:
1. **On the glasses** — Persistent Cloud Storage so reports survive between sessions.
2. **To the tech's phone** — Spectacles Mobile Kit to save or share the report as a PDF.
3. **To job history** — Snap Cloud storage per machine, feeding a dashboard, printable reports, or a maintenance system (e.g. a completed work order).
Reports with photos sent online will use SPECS' transparent permission prompt.

## What's next (v2)
Live part recognition and label reading → component manual lookup (with permission), per-machine job history and printable reports, magnified view and camera filters, voice notes, AI-phrased answers grounded only in the job files, pneumatic and hydraulic schematics. Work in progress on the `v2-dev` branch.

## Safety
Reference aid only. Always verify with a meter and follow lockout/tagout.
