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
- What the real version would sense: the electrical cabinet and its components (live labeling, anchoring to the machine), plus voice input (left out of this build: speech recognition needs the internet and blocks camera frames, so the Lens could not be published with the Camera card).
- Stand-in for the preview:
  - A 3D model of the MWNP 1.0 trainer stands in for the real cabinet, placed on the bench in front of the user.
  - The symptom is chosen from a list (no recognition needed).
  - Meter readings are typed in on a number pad. The Lens never measures anything itself.
  - The "agent" is rule-based and reads only `Assets/MWNP/netlist.json` (components, wires, functions, test_points with tolerances, faults with check_order). Every statement it makes is pulled from and cited to that file. No live AI decides anything, so the demo never depends on one, and nothing can be invented (see the optional phrasing stretch goal).

## Where things live
- Where the user is looking during the main task: at the active test point on the panel; the step card and the cabinet are in view together, so no head turn is needed.
- Trainer cabinet model: upright backboard about 46 × 46 cm (18 × 18 in), cabinet-style junction box, on a virtual bench in front of the seated user, about 100 cm away, centered horizontally and a little below eye level (about 9 cm, ~5°). At 100 cm the full 46 cm board spans about 26° of the SPECS view's ~32° width. Layout matches `Assets/MWNP/MWNP_1.0_panel_layout.png`: light-gray mounting panel inside a 1 cm gray frame, everything inside the 46 × 46 cm board. The whole layout is placed relative to the user's head when the Lens starts, so these distances hold in any preview environment and on device.
  - Top: PS1 power supply.
  - Below it: DIN rail with terminals TS-1 to TS-5 (TS-3 spare), labeled vertically on the terminals as in the layout image (terminal pitch 2 cm so the labels fit).
  - Below the rail: switch/lamp plate, ONE narrow smoke-gray plexi strip, 25 × 5 cm (2 × 10 in), with 3 rows of 6 plugged spare holes to the right of S1/L1/L2 (rows level with L1, S1 and L2, as in the layout image). S1 on the left side with L1 (EXTEND) above it and L2 (RETRACT) below it. No other switches or lamps.
  - Below that: fuse plate, ONE light plexi strip, 29 × 7.5 cm (11.5 × 3 in), F1 and F2 on the left plus 6 empty dashed fuse spots.
  - Anything meant to be black is smoke-gray instead (additive display).
  - Wires follow the schematic in `Assets/MWNP/MWNP_1.0_wiring.png` and are routed like the layout image, neatly along the edges and all inside the board: red for +12 V conductors, blue for 0 V return, labeled with their wire numbers. As in the layout image, S1 DOWN → 3a → TS-5 and the lamp returns (wire 0) are not drawn; a footnote along the bottom edge lists them.
- At the part (small things only, never covering components):
  - Thin outline around the active component.
  - Probe markers on the active test point's terminals (e.g. F1 IN and OUT).
  - A short tag right beside the test point: "Expected 12 V (S1 UP)".
  - After a reading, the tag shrinks to a small badge with the value and a green check or red X.
- Component tags: every component has an ID tag (PS1, TS-1…TS-5, S1, F1, F2, L1, L2) printed on or right beside the part, text at least 1.5 cm tall (font size) so it reads from 100 cm. Every label on the model (ID tags, wire numbers, expected tags, badges, info bubbles, the footnote) is pure white bold text, never dimmed, unlit and drawn on top, on a small backing plate in the cards' 90% smoke-gray with a thin bright edge so it reads over the light board and the backdrop; terminal labels on TS-1…TS-5 are vertical on dark plates, as on the panel drawing. Active / relevant labels turn amber #FFB800 (text and edge); pass / fail badges are green #00FF66 / red #FF3B30; wire-number plates carry the wire's color on their edge; a label under the pointer shows cyan. Expected tags, badges and info bubbles use 1.0 cm text and stay inside the board, left of the step card. Labels never cover the probe points (TS-4, F1 IN, F1 OUT, L1+), the L1 lamp or the S1 toggle.
- Trace line: drawn along the wires of the active path (2a, 2b, 2c), thin, on the panel surface.
- Step card: world-locked (not stuck to the view), about 75 cm from the user, floating in front of the right third of the cabinet, top edge just below eye level, turned slightly toward the user. About 19 cm wide and 25–29 cm tall (it grows downward from its top edge as the text needs it; the tallest state, the amber "no guess" message, is about 28 cm). Its left edge sits just right of center, so TS-4, F1, L1 and S1 (all on the left of the board) are never covered; only PS1's right edge, plugged holes, open fuse spots and the far-right runs of wires 2b/3b/0 are behind it. Translucent dark smoke-gray background (not solid), so wires and the 2b trace stay visible through it. Shows the current step, the schematic citation, the number pad, the readout and buttons. All text on it (reasoning, path citation, step line, question, step citation, expected value and range, result) is at least 1.0 cm tall (font size), 1.2 cm for the readout, wrapped to about 30 characters a line, so it reads in a 1080p screen recording. The Enter and Schematic buttons use the same text size; number pad keys are about 3 cm wide with bold 1.25 cm digits.
- Schematic panel: opens just above the step card (same distance, same translucent smoke-gray background), about 25 × 9 cm (it grows upward from its bottom edge, so it always sits just above the step card), showing `MWNP_1.0_wiring.png` cropped and zoomed to the active path (EXTEND: S1 UP, 2a, TS-4, 2b, F1, 2c, L1; RETRACT: the same for the lower row; wire 1 and wire 0 show the whole drawing). The current wire is drawn over it about 0.5 cm thick (4 times the drawn wire) in bright orange with a dark edge. Because the drawing's own labels are small (about 0.4 cm), large labels (0.9 cm) are drawn over it: the part IDs above their shapes (EXTEND: TS-4, F1 0.5 A FB, L1; RETRACT: TS-5, F2 0.5 A FB, L2) and the wire numbers (2a, 2b, 2c or 3a, 3b, 3c) in place of the small originals. The labels transcribe what the drawing prints; they are not read from `netlist.json`. Step card and schematic both fit in view with the cabinet.
- The Job panel, Finding card, Camera card and Job report all use the same spot (top edge at the step card's top edge), width and translucent background as the step card (each one replaces the last), and the same text treatment: all text at least 1.0 cm tall, wrapped to about 30 characters a line, and the card grows downward as the text needs instead of shrinking it. The Finding card's headline "F1 open" is 1.8 cm, the largest text on it, with a small "Finding" line above. The Job report is the tallest card (about 28 cm), so its top edge sits higher (just above eye level, where the schematic panel would be) and the schematic is closed while it shows. Buttons on these cards use the same 1.0 cm text; a long symptom label ("Neither EXTEND nor RETRACT works") wraps onto two lines and its button grows.
- Safety notice: in front of the cabinet at start, centered and fully in view (32 cm wide at 70 cm), 1.0 cm text (wraps to two lines), on the same translucent smoke-gray card style.

## Hands and input
- Dismiss safety notice: pinch its button.
- Report symptom: "Report symptom" button on the Job panel opens a short list built from the `faults` in the job files: "EXTEND doesn't work", "RETRACT doesn't work", "Neither works". Pinch one.
- Open/close schematic: "Schematic" button on the step card toggles the schematic panel.
- Log a reading: number pad on the step card (0–9, decimal point, backspace, Enter), keys about 3 cm across with bold digits at least 1.2 cm tall, with a readout like "Reading: 12.1 V" (two lines, "Reading:" over the value, beside the pad). Pinch in the meter value, then Enter.
- Fix: "Fuse replaced: retest" button on the Finding card.
- Flip S1: pinch the S1 toggle on the model to switch it UP (EXTEND) or DOWN (RETRACT). During the retest step the step card also shows "S1 UP" / "S1 DOWN" buttons (current position in amber) as a backup that does the same thing.
- Hide / Show display: a small always-visible button at the cabinet's top-right edge (just above the step card's top-right corner) fades out every card, tag, badge and trace, and brings them back in exactly the same state. Device-only extra, skipped in the preview and safe if unavailable: make a fist (grab) to toggle. No voice control (see Camera).
- Camera: a "Camera" button on the step card opens the Camera card in the step card's place (Close brings the same step back). Same text style, vivid colors and 1.0 cm text. It attaches to the current test point (or the retest point while waiting for S1) and shows the latest capture as a thumbnail.
  - "Snapshot (with labels)": captures the Lens's own view (cabinet overlays, part tags, badges, traces, and the step card) into a picture through a render target. Works in the Preview over the Multimedia backdrop. The backdrop / device camera feed is composited outside the Lens, so it is not in a snapshot: the picture is the Lens's overlays on a dark ground.
  - "Photo": a plain camera still through the Camera Module on the glasses. In the Preview it uses one frame of the camera stream (the backdrop) when the Preview returns one; otherwise it attaches the placeholder "Photo (device only)".
  - Captures live in memory for the session only (up to 12): nothing is written to disk and nothing is sent anywhere. The Lens uses no internet features (no Internet Module, web sockets, remote services or voice recognition), so it stays publishable with the camera.
- Library (docked menu): after the safety notice a compact Library menu is docked at the upper left of the view, over the cabinet's top-left corner (left of PS1, above the DIN rail; never over TS-4, F1, L1, S1 or PS1's label). One column of buttons: Job, Job report, Camera, Options, with 1.0 cm text. At start it is expanded and no other card is open until the user picks one. The Library has its own "Hide" / "Show" button, identical to the main one (same label, size, style, color and fade) and, like it, a separate button floating just outside its card's top corner (flush with the card's right edge, the side facing the center, 1.0 above the top edge). Hiding fades the menu out and the "Show" button stays in the same spot; this is independent of the main Hide / Show button, which never hides the menu. The other cards keep the step card's spot on the right and have no Library button (Camera keeps Close). Each card keeps its state while another is shown: Job resumes the same step (entry, schematic, retest), Camera keeps its last thumbnail, and the Job report opened mid-job shows the readings so far ("Result: in progress"). Camera closes back to the card it was opened over. The menu follows the Card style option but not the Text size option (it stays compact).
- Options (session only, each button shows its value and cycles on press, applied immediately): Labels (Always on / Hide with cards), Hide button (Cards only / Everything), Card style (Translucent / Opaque), Text size (Normal / Large / Extra large), Schematic (Normal / Enlarged).
  - Hide button "Cards only" (default) with Labels "Always on" (default) fades the cards and leaves part tags, expected tags, badges, outlines and traces up; "Hide with cards" or "Everything" fades those too.
  - Text size rebuilds each card with larger text (1.25x / 1.5x) at the same width, so cards wrap and grow downward and never cover TS-4, F1, L1 or S1; a card that would run off the bottom of the view steps down to the next smaller size (the step card does this at Large and Extra large). The number pad and side buttons keep their size.
  - Schematic "Enlarged" scales the schematic panel 1.35x, shrinking it if it would leave the view.
- Save: "Save to job log" button on the Job report.
- Targets are big and highlight when aimed at.
- Voice: not in this build. Speech recognition streams audio over the internet and disables camera frame access; a Lens using both can only be published with Extended Permissions. Every action has its button; voice commands such as "take snapshot" could return in an Extended-Permissions build.

## When things show
- Safety notice ("Reference aid only. Verify with a meter. Follow lockout/tagout."): shows at start, hides when dismissed.
- Job panel ("Job: MWNP 1.0 bench trainer · Files loaded: wiring diagram, netlist" + "Report symptom"): shows after the notice, hides when a symptom is picked.
- Component tags: always visible at full brightness; parts on the active path (TS-4, F1, L1) get amber outlines and amber labels once the symptom is picked; every other label stays white.
- Step card: replaces the Job panel after the symptom is picked. It first states its reasoning with citations: "RETRACT works, so PS1, wire 1 and S1 COM are good. EXTEND path: 2a → TS-4 → 2b → F1 (0.5 A FB) → 2c → L1." Then it shows one step at a time from `check_order`, e.g. "Step 3 of 5: meter F1 OUT to TS-2" with "Schematic: wire 2b TS-4 → F1, 0.5 A fast-blow".
- Active test point: only one at a time gets the outline, probe markers and expected-voltage tag. Order from the files: TS-4, F1 IN, F1 OUT, L1+.
- Reading result: the agent compares the reading to `min_v`/`max_v` for that test point. In range shows green and the tag shrinks to a badge (e.g. "12.1 V ✓"), logs value, test point and time, and moves to the next point. Out of range shows red with ✗ and the check_order conclusion for that step. A reading near 0 V where 12 V is expected points to the open part.
- Reading that fits no fault in the files (not in range and not near 0 V; "near 0 V" = 1.0 V or less (default)), e.g. 6.0 V at F1 OUT: mark the step **amber** (not green or red) and say: "6.0 V doesn't match any fault in the job files. Recheck your meter leads and connection, then re-enter. I can't determine a cause from the files." Don't advance, don't flag a part; the same test point stays active for re-entry.
- No tolerance in the files: TS-3 (spare) has no test_points entry and no tolerance. Pinching TS-3's tag (default) shows "TS-3: Spare. No tolerance defined in the job files." Any reading at a point with no tolerance is shown raw against nominal with no pass or fail mark (per `tolerance_rule`).
- F1 flagged open (after 0.0 V at F1 OUT): F1's outline turns red, trace shows 2b green and stops at F1 with 2c grayed out. Finding card replaces the step card: "Finding: F1 open. 12.0 V at F1 IN, 0.0 V at F1 OUT. Schematic: F1 is 0.5 A fast-blow." Next action: "Lockout/tagout, remove F1, check continuity, replace with 0.5 A fast-blow. Do not upsize. If the new fuse blows, check 2c and L1 for a short." Plus "Fuse replaced: retest".
- Retest: the user flips S1 UP (pinch, or the S1 UP button), L1 lights on the model, and L1+ becomes the active test point. Logging 12.0 V turns it green. Until S1 is flipped, the number pad still takes digits, and Enter says "Flip S1 UP first (pinch it on the model or use the button), then press Enter." instead of doing nothing.
- Job report: replaces the step card. Shows the job, symptom, each reading (test point, value, expected range, time) with a thumbnail of every snapshot and photo listed right under the test point it belongs to, the finding (F1 open), action taken and result (EXTEND restored), plus "Save to job log". The Hide / Show button moves to the report's top-left edge while it shows.
- Schematic panel: shows only when toggled open.
- If something needs attention out of view: not needed; everything stays on or right beside the cabinet.

## Done criteria
Each one can be checked in Lens Studio's preview.
1. **Symptom → path:** after pinching "Report symptom" and picking "EXTEND doesn't work", TS-4, F1 and L1 get amber outlines, the trace line draws along 2a/2b/2c, and the step card shows the schematic citation (wire 2b, TS-4 → F1, 0.5 A fast-blow).
2. **Reading in spec:** entering 12.1 V at TS-4 with the number pad turns the step green, the TS-4 tag shrinks to a "12.1 V ✓" badge, and F1 IN becomes the active test point with "Expected 12 V (S1 UP)".
3. **Fault flagged:** entering 0.0 V at F1 OUT turns F1's outline red, the trace stops at F1 with 2c grayed out, and the Finding card appears with "F1 open" and the next action (lockout/tagout, check continuity, replace with 0.5 A fast-blow, don't upsize).
4. **No-guess:** entering 6.0 V at F1 OUT marks the step amber (not green or red), the card says "6.0 V doesn't match any fault in the job files. Recheck your meter leads and connection, then re-enter. I can't determine a cause from the files.", F1 OUT stays the active test point, and no part is flagged. Separately, TS-3 (spare) shows "no tolerance defined".
5. **Fix and summary:** after "Fuse replaced: retest", flipping S1 UP lights L1 on the model, and logging 12.0 V at L1+ turns it green. Then the Job report shows every reading with its test point, value, range and time, any snapshots and photos under their test points, plus the finding and the result.

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
- Voice input (buttons carry everything; see Voice above).

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
- Colors (vivid, for a screen recording): card text pure white; green #00FF66, amber #FFB800, red #FF3B30, orange traces #FF8C00; bright red and blue wires; trace lines 0.75 cm thick; cards 90% opaque (a little of the model still shows through).
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- LEAF's on-screen test banners and reports show only while a scenario is running; a normal Preview shows none.
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
