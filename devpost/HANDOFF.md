# MWNP Lens — Handoff (2026-10-31, 4:15 PM)

## Where we are
- Lens Studio 5.23.2, project `C:\Users\Phestes\Documents\SpecsLens\SpecsTest`, repo github.com/pogg-ux/SpecsTest
- CLAD (ls-clad) installed, lens-studio MCP connected, design brief approved: `devpost/design-brief.md`
- Build done: all 5 LEAF done criteria PASS + layout test. Cabinet at 100 cm, translucent cards.
- Job data: `Assets/MWNP/netlist.json` (tolerances, reading rules), `MWNP_1.0_wiring.png`, `MWNP_1.0_panel_layout.png`

## UPDATE Nov 1, 4:30 PM — WHERE WE ARE
v1 tagged `v1.0-submission` (move it after final fixes: `git tag -f v1.0-submission` then `git push -f origin v1.0-submission`).
Done: docked Library (Job, Job report, Camera, Notes, Options), matching Hide/Show, polish pass, End/New job, Notes, 12 LEAF tests. README, VIDEO_SCRIPT, DEVPOST_DESCRIPTION in repo.
Monday mid-review: could not confirm it exists. Real one = SPECS Live Review Thu Nov 5, 12 PM ET (registered on Luma).

### Next prompts for Claude Code (in order)
A) (if not done) New job → fresh report immediately, old one to "Previous jobs"; Notes "Other" free text (Expanding Text Input in Preview, else labeled placeholder); Photo viewer (tap thumbnail → large, Prev/Next, Delete w/ confirm, Close).
B) Final workflow check — walk every path by mouse, no dead ends, placeholders labeled, button feedback, Hide/Show + Options at every step, hide Lens bench slab, "Save (this session)" + "Export report — coming in v2" placeholder. Re-run LEAF, re-capture ALL screenshots to devpost/screenshots.
Then: save.bat → move tag → FEATURE FREEZE.

### Discord how-to (for the Nov 5 review — post by Wed)
1. Join Devpost Discord (link on the hackathon page / Resources tab), accept rules.
2. Left sidebar → find channel #devpost-learn-feedback (it may be a Forum channel).
3. Click "New Post", title "FaultLens", paste the drafted text, drag in 2–3 screenshots, add tags "Will It Ship" + "Learn AR with SPECS", Post.

### Then
OBS (Window Capture, crop to Preview, 1080p/30) → silent takes → Clipchamp narration per VIDEO_SCRIPT → YouTube Public → Devpost submit before Mon Nov 9, 5 PM ET (video, repo URL, description).

## UPDATE Nov 1, 11:35 AM — NEXT PROMPT (paste into Claude Code)
Done since last: readable cards, labeled schematic, vivid colors, 3 cm keypad, S1 UP/DOWN retest buttons, Hide/Show, bench backdrop (Multimedia mode, Media/bench_backdrop.jpg, lowered 10%), brighter labels. 9 LEAF tests passing. save.bat in project root commits+pushes.

> Navigation and options rework:
> 1. Library card = home. After the safety notice, show a Library card (same spot/style as the step card) listing buttons that jump straight to: Job (diagnosis flow), Job report, Camera, Options. Every other card gets a "Library" button to return home. Each card keeps its state when you leave and come back.
> 2. Options card, toggles apply immediately, persist for the session:
>    - Labels: Always on / Hide with cards (default Always on).
>    - Hide button behavior: Cards only / Everything.
>    - Card style: Translucent / Opaque.
>    - Text size: Normal / Large / Extra large (cards grow; never cover TS-4, F1, L1, S1; stay in view).
>    - Schematic: Normal / Enlarged.
> 3. Camera card (if not built): Snapshot with labels (render-target capture of Lens view, works in Preview), Photo (device CaptureSession; placeholder in Preview), Close. Snapshots attach to the active test point and show in the Job report. No internet alongside camera.
> 4. Every card reachable and closable with mouse clicks in Interactive Preview.
> LEAF: Library reaches every card and returns; each Options toggle works; labels stay up with cards hidden when Always on. Re-run all LEAF tests. Screenshot Library and Options cards over the backdrop.

THEN FEATURE FREEZE → README, video script, Devpost description (Claude in chat drafts these), record (Win+Alt+R), YouTube public, Discord post before Thu Nov 5 12 PM ET, submit before Mon Nov 9 5 PM ET, git tag v1.0-submission, then v2-dev branch/worktree for parked features.

## UPDATE 4:18 PM (older) — layout fix DONE (matches panel image, 6/6 LEAF pass, preview env = Plane, head-anchored)
Next prompt for Claude Code:

> Three fixes:
> 1. Step card text (step line, schematic citation, reasoning, readout) must be readable in a 1080p screen recording: at least 1.0 cm text, fewer words per line. Make the card taller if needed rather than shrinking text. Keep the number pad as is.
> 2. Schematic panel: crop/zoom the image to the active path (TS-4 → F1 → L1) and make the highlighted wire thick and bright.
> 3. Hide all LEAF on-screen output unless a test is running, so a normal Preview shows no test banners.
> Also: switch the spare holes to 3 rows to match MWNP_1.0_panel_layout.png.
> Re-run all 6 LEAF tests and screenshot the step card state.

## Earlier problem (resolved)
Preview looks wrong: cabinet doesn't match `MWNP_1.0_panel_layout.png` (plates render as big hole grids), wires hang off the board, tags/safety text unreadable, washed out in Sunlit Room.
Fix prompt for Claude Code (if not already sent / finished):

> The cabinet model doesn't match my layout. Rebuild it to match Assets/MWNP/MWNP_1.0_panel_layout.png exactly:
> - Switch/lamp plate: ONE narrow strip, 25 × 5 cm, single row of ~6 plugged spare holes right of S1/L1/L2. Not a large perforated panel.
> - Fuse plate: ONE strip, 29 × 7.5 cm, F1 and F2 on the left, 6 empty dashed fuse spots. Not a grid.
> - PS1 at top, DIN rail with TS-1 to TS-5 below it, as in the image.
> - All wires stay inside the 46 × 46 cm backboard, routed along the edges. Nothing hangs off the board.
> - Part tags readable from 100 cm (≥1.5 cm text). Safety notice centered, fully in view, readable, translucent smoke-gray card.
> Then screenshot the preview, compare side by side with MWNP_1.0_panel_layout.png, and re-run all LEAF tests.

Also: switch Preview environment from "Sunlit Room" to a darker room.

## After that
1. Review in Interactive Preview (dismiss → Report symptom → EXTEND → 12.1 → 12.0 → 0.0 → retest → summary)
2. If text hard to read: raise card opacity 0.55 → 0.75, enlarge tags
3. Extras if time: AI phrasing via Remote Service Gateway (fallback to rules), Offscreen Locator arrow
4. Video (<3 min, Lens working in first 10 s), Devpost description, final push
5. Post in Discord #devpost-learn-feedback before Thu Nov 5 12:00 PM ET (tags: Will It Ship, Learn AR with SPECS)
6. Round 1 deadline: Mon Nov 9, 5:00 PM ET

## Notes
- Use Sonnet in Claude Code for builds (saves usage). Auto mode on.
- If Lens Studio hangs: quit without saving, reopen SpecsTest.esproj, tell Claude Code "it's started".
- `.agents/skills/plan-lens` keeps getting removed by Lens Studio — ignore; `.claude/skills/plan-lens` is the one used.
- Physical MWNP build is optional, last priority (closing video clip).
