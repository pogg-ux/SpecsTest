# MWNP No-Guess Field Assistant — a SPECS Lens

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
- Voice commands, grab gesture and camera photos are device-only; every voice action has a button.
- The agent is rule-based by design — no live AI decides anything, so it can't invent an answer.

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
