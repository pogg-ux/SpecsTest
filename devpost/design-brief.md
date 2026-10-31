---
status: approved
---

# Design brief: MWNP No-Guess Field Assistant

## The one spatial moment
Seated at the bench in front of a 3D model of my MWNP 1.0 12 VDC trainer, I report "EXTEND doesn't work." The agent cites the schematic, outlines the EXTEND path on the panel, draws the wire run 2a → 2b → 2c, and shows "Expected 12 V (S1 UP)" right beside each test point. It walks me through the check order while I log my meter readings, until it flags F1 as open.

## Why it belongs on glasses
- Uses: draws in the world (guidance sits on the actual component being probed), leaves your body free (both hands stay on the meter leads; eyes stay on the cabinet).
- Why it's better than the phone or laptop version: on a laptop I look away from the cabinet to find the schematic, then find the wire, then find the expected value. Here the expected voltage is at the part, the trace is drawn on the panel, and the step card floats beside the active part in the same view.

## Product or overlay
- Type: overlay. It responds to a real machine, demonstrated on a 3D model of my real bench trainer.
- What the real version would sense: the electrical cabinet and its components (live labeling, anchoring to the machine), plus voice input.
- Stand-in for the preview:
  - A 3D model of the MWNP 1.0 trainer stands in for the real cabinet, placed on the bench in front of the user.
  - The symptom is chosen from a list (no recognition needed).
  - Meter readings are typed in on a number pad. The Lens never measures anything itself.
  - The "agent" is rule-based and reads only `Assets/MWNP/netlist.json` (components, wires, functions, test_points with tolerances, faults with check_order). Every statement it makes is pulled from and cited to that file. No live AI decides anything, so the demo never depends on one, and nothing can be invented (see the optional phrasing stretch goal).

## Where things live
- Where the user is looking during the main task: at the active test point on the panel; the step card and the cabinet are in view together, so no head turn is needed.
- Trainer cabinet model: upright backboard about 46 × 46 cm (18 × 18 in), cabinet-style junction box, on a virtual bench in front of the seated user, about 100 cm away, centered horizontally and a little below eye level (about 9 cm, ~5°). At 100 cm the full 46 cm board spans about 26° of the SPECS view's ~32° width.
  - Top: PS1 power supply.
  - Below it: DIN rail with terminals TS-1 to TS-5 (TS-3 spare).
  - Below the rail: switch/lamp plate, smoke-gray plexi, about 5 × 25 cm (2 × 10 in), precut plugged holes. S1 on the left side with L1 (EXTEND) above it and L2 (RETRACT) below it. No other switches or lamps.
  - Below that: fuse board, smoke-gray plexi, about 7.5 × 29 cm (3 × 11.5 in), F1 and F2 plus open spots for more fuses.
  - Anything meant to be black is smoke-gray instead (additive display).
  - Wires follow the schematic in `Assets/MWNP/MWNP_1.0_wiring.png`: red for +12 V conductors, blue for 0 V return, labeled with their wire numbers.
- At the part (small things only, never covering components):
  - Thin outline around the active component.
  - Probe markers on the active test point's terminals (e.g. F1 IN and OUT).
  - A short tag right beside the test point: "Expected 12 V (S1 UP)".
  - After a reading, the tag shrinks to a small badge with the value and a green check or red X.
- Component tags: every component has a small ID tag (PS1, TS-1…TS-5, S1, F1, F2, L1, L2), visible but dim until relevant.
- Trace line: drawn along the wires of the active path (2a, 2b, 2c), thin, on the panel surface.
- Step card: world-locked (not stuck to the view), about 75 cm from the user, floating in front of the right third of the cabinet, top edge just below eye level, turned slightly toward the user. About 18 × 17 cm. Its left edge sits just right of center, so TS-4, F1, L1 and S1 (all on the left of the board) are never covered; only PS1's right edge, plugged holes, open fuse spots and the far-right runs of wires 2b/3b/0 are behind it. Translucent dark smoke-gray background (not solid), so wires and the 2b trace stay visible through it. Shows the current step, the schematic citation, the number pad, the readout and buttons.
- Schematic panel: opens just above the step card (same distance, same translucent smoke-gray background), about 18 × 14 cm, showing `MWNP_1.0_wiring.png` with the current wire highlighted. Step card and schematic both fit in view with the cabinet.
- The Job panel, Finding card and Findings summary all use the same spot, size and translucent background as the step card (each one replaces the last).
- Safety notice: one line in front of the cabinet at start.

## Hands and input
- Dismiss safety notice: pinch its button.
- Report symptom: "Report symptom" button on the Job panel opens a short list built from the `faults` in the job files: "EXTEND doesn't work", "RETRACT doesn't work", "Neither works". Pinch one.
- Open/close schematic: "Schematic" button on the step card toggles the schematic panel.
- Log a reading: number pad on the step card (0–9, decimal point, backspace, Enter), keys about 2 cm across (at 75 cm, about the same visual size as 2.5 cm keys at 100 cm), with a readout like "Reading: 12.1 V". Pinch in the meter value, then Enter.
- Fix: "Fuse replaced: retest" button on the Finding card.
- Flip S1: pinch the S1 toggle on the model to switch it UP (EXTEND) or DOWN (RETRACT).
- Save: "Save to job log" button on the Findings summary.
- Targets are big and highlight when aimed at.
- Voice (real glasses only, extra): "Agent, EXTEND doesn't work" = Report symptom; "Show schematic" = Schematic button; "Twelve point one" = number pad entry. Every voice action has its button, and the demo uses buttons only.

## When things show
- Safety notice ("Reference aid only. Verify with a meter. Follow lockout/tagout."): shows at start, hides when dismissed.
- Job panel ("Job: MWNP 1.0 bench trainer · Files loaded: wiring diagram, netlist" + "Report symptom"): shows after the notice, hides when a symptom is picked.
- Component tags: always visible but dim; parts on the active path (TS-4, F1, L1) get amber outlines once the symptom is picked; everything else stays dim.
- Step card: replaces the Job panel after the symptom is picked. It first states its reasoning with citations: "RETRACT works, so PS1, wire 1 and S1 COM are good. EXTEND path: 2a → TS-4 → 2b → F1 (0.5 A FB) → 2c → L1." Then it shows one step at a time from `check_order`, e.g. "Step 3 of 5: meter F1 OUT to TS-2" with "Schematic: wire 2b TS-4 → F1, 0.5 A fast-blow".
- Active test point: only one at a time gets the outline, probe markers and expected-voltage tag. Order from the files: TS-4, F1 IN, F1 OUT, L1+.
- Reading result: the agent compares the reading to `min_v`/`max_v` for that test point. In range shows green and the tag shrinks to a badge (e.g. "12.1 V ✓"), logs value, test point and time, and moves to the next point. Out of range shows red with ✗ and the check_order conclusion for that step. A reading near 0 V where 12 V is expected points to the open part.
- Reading that fits no fault in the files (not in range and not near 0 V; "near 0 V" = 1.0 V or less (default)), e.g. 6.0 V at F1 OUT: mark the step **amber** (not green or red) and say: "6.0 V doesn't match any fault in the job files. Recheck your meter leads and connection, then re-enter. I can't determine a cause from the files." Don't advance, don't flag a part; the same test point stays active for re-entry.
- No tolerance in the files: TS-3 (spare) has no test_points entry and no tolerance. Pinching TS-3's tag (default) shows "TS-3: Spare. No tolerance defined in the job files." Any reading at a point with no tolerance is shown raw against nominal with no pass or fail mark (per `tolerance_rule`).
- F1 flagged open (after 0.0 V at F1 OUT): F1's outline turns red, trace shows 2b green and stops at F1 with 2c grayed out. Finding card replaces the step card: "Finding: F1 open. 12.0 V at F1 IN, 0.0 V at F1 OUT. Schematic: F1 is 0.5 A fast-blow." Next action: "Lockout/tagout, remove F1, check continuity, replace with 0.5 A fast-blow. Do not upsize. If the new fuse blows, check 2c and L1 for a short." Plus "Fuse replaced: retest".
- Retest: the user flips S1 UP, L1 lights on the model, and L1+ becomes the active test point. Logging 12.0 V turns it green.
- Findings summary: replaces the step card. Shows the job, symptom, each reading (test point, value, expected range, time), the finding (F1 open), action taken and result (EXTEND restored), plus "Save to job log".
- Schematic panel: shows only when toggled open.
- If something needs attention out of view: not needed; everything stays on or right beside the cabinet.

## Done criteria
Each one can be checked in Lens Studio's preview.
1. **Symptom → path:** after pinching "Report symptom" and picking "EXTEND doesn't work", TS-4, F1 and L1 get amber outlines, the trace line draws along 2a/2b/2c, and the step card shows the schematic citation (wire 2b, TS-4 → F1, 0.5 A fast-blow).
2. **Reading in spec:** entering 12.1 V at TS-4 with the number pad turns the step green, the TS-4 tag shrinks to a "12.1 V ✓" badge, and F1 IN becomes the active test point with "Expected 12 V (S1 UP)".
3. **Fault flagged:** entering 0.0 V at F1 OUT turns F1's outline red, the trace stops at F1 with 2c grayed out, and the Finding card appears with "F1 open" and the next action (lockout/tagout, check continuity, replace with 0.5 A fast-blow, don't upsize).
4. **No-guess:** entering 6.0 V at F1 OUT marks the step amber (not green or red), the card says "6.0 V doesn't match any fault in the job files. Recheck your meter leads and connection, then re-enter. I can't determine a cause from the files.", F1 OUT stays the active test point, and no part is flagged. Separately, TS-3 (spare) shows "no tolerance defined".
5. **Fix and summary:** after "Fuse replaced: retest", flipping S1 UP lights L1 on the model, and logging 12.0 V at L1+ turns it green. Then the Findings summary shows every reading with its test point, value, range and time, plus the finding and the result.

## Stretch goal (only if time allows, after all done criteria pass)
- Use Gemini through the Remote Service Gateway only to phrase the agent's answers more naturally.
- Its only input is `netlist.json` plus the rule result for the current step. Instruct it to never add facts.
- Fall back to the rule-based text if the call fails or isn't available in the preview. The demo must never depend on it.
- Findings and pass/fail/amber decisions always come from the rules, never from the AI.

## Out of scope
- Live recognition or labeling of a real electrical box; anchoring to a real machine.
- AI deciding anything (only the optional phrasing stretch goal above); internet lookup of component manuals.
- Loading arbitrary job files, work orders, PM checklists, pneumatic/hydraulic schematics.
- Asset history across jobs, printable reports. "Save to job log" keeps the log for the current session only in this version.
- Enhanced low-light view for dark cabinets.
- Voice input (buttons carry everything in the demo).

## Risks and open questions
- The 1.0 V "near 0 V" threshold is a default, not from the job files. Consider adding it to `netlist.json` so the rule stays file-driven.
- The number pad is the smallest set of targets in the design (3 cm keys). It works with a mouse, but real hand tracking is "feel unproven".
- The panel model is built from my description and the schematic, not a scan, so exact positions are approximate.
- Feel unproven: comfort of seated probing over a full job, readability of small tags on real glasses.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.
- All agent text (reasoning, steps, expected values, tolerances, findings, citations) must come from `Assets/MWNP/netlist.json`; don't hard-code circuit facts in scripts that aren't in that file. The schematic image is `Assets/MWNP/MWNP_1.0_wiring.png`.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
