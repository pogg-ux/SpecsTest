// MWNPMain.ts — orchestrator for the FaultLens.
//
// Owns: loading Assets/MWNP/netlist.json, wiring UI events to the rule-based agent
// (MWNPAgent), composing every agent sentence from netlist facts, and pushing visual
// state into the cabinet model (MWNPCabinet), part tags (MWNPPartTagsUI) and cards.
// Expects (@input): the JSON asset, the cabinet, part tags, and the six UI modules.
// Must not: create UI text itself (UI modules render), or hard-code circuit facts —
// thresholds, tolerances, steps, path, ratings and IDs all come from netlist.json.
// The templates below are phrasing only; every {placeholder} is filled from the file.
//
// Size note: ~480 lines because it composes every agent sentence; logic lives in MWNPAgent/MWNPNetlist.
//
// Testing: readable state via getState() (also global.mwnpAssistant.getState()), and
// a "[MWNP] state" print on every transition. Interactive objects have stable names
// (see each UI module header).

import {Netlist} from "./MWNPNetlist"
import {AgentSnapshot, MWNPAgent} from "./MWNPAgent"
import {resolveWire} from "./MWNPSpeech"
import {MWNPCabinet} from "./MWNPCabinet"
import {MWNPPartTagsUI} from "./MWNPPartTagsUI"
import {MWNPSafetyNoticeUI} from "./MWNPSafetyNoticeUI"
import {MWNPJobPanelUI} from "./MWNPJobPanelUI"
import {MWNPStepCardUI} from "./MWNPStepCardUI"
import {MWNPFindingCardUI} from "./MWNPFindingCardUI"
import {MWNPSummaryUI, SummaryRow, ReportCapture, SummaryData} from "./MWNPSummaryUI"
import {MWNPNotesCardUI, Note} from "./MWNPNotesCardUI"
import {MWNPPhotoViewerUI, ViewerInfo} from "./MWNPPhotoViewerUI"
import {MWNPCameraCardUI} from "./MWNPCameraCardUI"
const ICON_HIDE = requireAsset("../Icons/visibility_off.png") as Texture
const ICON_SHOW = requireAsset("../Icons/visibility.png") as Texture
import {MWNPLibraryCardUI} from "./MWNPLibraryCardUI"
import {MWNPOptionsCardUI, OptionChange} from "./MWNPOptionsCardUI"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Capture, PHOTO_PLACEHOLDER, SnapshotCamera, takePhoto} from "./MWNPCapture"
import {MWNPSchematicPanelUI} from "./MWNPSchematicPanelUI"
import {DisplayFader} from "./MWNPDisplayFader"
import {addButton, ButtonHandle, cardEm, makeObj, MIN_GAP_CM, realToLocal, setCardOpaque, setHostEmFactor, setHostFactor} from "./MWNPSharedUI"

const CHECK = "✓"
const CROSS = "×" // U+00D7: the Lens font has no U+2717 ✗ glyph

function fill(template: string, vars: {[k: string]: string}): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m))
}

function two(n: number): string {
  return n < 10 ? "0" + n : "" + n
}

function clock(): string {
  const d = new Date()
  return two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds())
}


/** What undo needs to put the last reading back: the agent's state plus the visuals and notes that reading changed. */
interface UndoState {
  agent: AgentSnapshot
  outlines: {[id: string]: string}
  badges: string[]
  notesLen: number
  lastMessage: string
  lastResultColor: string
  resultText: string
  resultColor: string
}

/** Real cm kept between the display area's edge and the card column; chip widths (real cm) for left-aligning the chips with it. */
const FRAME_MARGIN_CM = 1.0
const LIBRARY_CHIP_CM = 7.5
const STEP_CHIP_CM = 9.6

@component
export class MWNPMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">FaultLens – rule-based agent driven by netlist.json</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Job file: Assets/MWNP/netlist.json (the only source of circuit facts)")
  netlistAsset: JsonAsset
  @input
  @hint("Stand-in trainer model")
  cabinet: MWNPCabinet
  @input
  @hint("Tags, labels and badges on the trainer")
  partTags: MWNPPartTagsUI
  @input
  @hint("Safety notice shown at start")
  safetyNotice: MWNPSafetyNoticeUI
  @input
  @hint("Job panel / symptom list")
  jobPanel: MWNPJobPanelUI
  @input
  @hint("Step card with number pad")
  stepCard: MWNPStepCardUI
  @input
  @hint("Finding card")
  findingCard: MWNPFindingCardUI
  @input
  @hint("Job report (readings, finding, snapshots and photos)")
  summaryCard: MWNPSummaryUI
  @input
  @hint("Camera card (opens in the step card's place)")
  cameraCard: MWNPCameraCardUI
  @input
  @hint("Library card (home)")
  libraryCard: MWNPLibraryCardUI
  @input
  @hint("Options card")
  optionsCard: MWNPOptionsCardUI
  @input
  @hint("Notes card")
  notesCard: MWNPNotesCardUI
  @input
  @hint("Photo viewer card")
  photoViewer: MWNPPhotoViewerUI
  @input
  @hint("Schematic panel above the step card")
  schematicPanel: MWNPSchematicPanelUI
  @input
  @hint("Number pad / button click sound")
  clickSfx: AudioTrackAsset
  @input
  @hint("Reading in spec sound")
  passSfx: AudioTrackAsset
  @input
  @hint("Reading out of spec / unexplained sound")
  faultSfx: AudioTrackAsset
  @ui.group_end
  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Demo stand-in: which function is broken on the model (lamp stays off until repaired)")
  @widget(new ComboBoxWidget([new ComboBoxItem("EXTEND", "EXTEND"), new ComboBoxItem("RETRACT", "RETRACT"), new ComboBoxItem("None", "")]))
  simulatedFaultFunction: string = "EXTEND"
  @input
  @hint("Files-loaded line on the Job panel")
  filesLoadedText: string = "Files loaded: wiring diagram, netlist"
  @input
  @hint("Amber (unexplained) message. {value} = reading in V")
  amberTemplate: string =
    "{value} V doesn't match any fault in the job files. Recheck your meter leads and connection, then re-enter. I can't determine a cause from the files."
  @input
  @hint("Next action for an open fuse. {part} {rating} {downstream} {load} come from netlist.json")
  fuseActionTemplate: string =
    "Lockout/tagout, remove {part}, check continuity, replace with {rating}. Do not upsize. If the new fuse blows, check {downstream} and {load} for a short."
  @input
  @widget(new SliderWidget(0, 5, 0.1))
  @hint("Seconds the green retest result stays before the summary replaces the card")
  summaryDelaySec: number = 1.5
  @input
  @widget(new SliderWidget(0, 1, 0.05))
  @hint("Sound effect volume")
  sfxVolume: number = 0.7
  @input
  @hint("At start, move the whole assistant so the authored layout sits relative to the user's head (heading only)")
  anchorToUserAtStart: boolean = true
  @input
  @hint("Eye position the authored layout was designed around (cabinet 100 cm, cards 75 cm from here)")
  authoredEyePos: vec3 = new vec3(0, 0, 18)
  @ui.group_end

  // ── Readable state (see getState) ──
  nl: Netlist | null = null
  agent: MWNPAgent | null = null
  private _visible = "none"
  /** The last view of the job flow (job, symptoms, step, finding, summary): what the Library's Job button returns to. */
  flowCard = "job"
  get visibleCard(): string {
    return this._visible
  }
  set visibleCard(v: string) {
    this._visible = v
    if (v === "job" || v === "symptoms" || v === "step" || v === "finding" || v === "summary") this.flowCard = v
    // One card at a time, the Library included: it shows as its menu only while no card is open, else as a chip.
    if (this.libraryCard && this.libraryCard.built) {
      if (v === "home") this.libraryCard.expand()
      else if (v !== "safety") this.libraryCard.collapse()
    }
    this.updateDisplayButtonPos()
  }
  private cameraReturn = "home"
  /** Notes of the current job, newest first (agent notes and the technician's). */
  notes: Note[] = []
  /** "" | "fixed_q" (Problem solved? is showing) | "end_q" (End job? is showing on the summary). */
  private verifyState: string = ""
  private nextNoteId = 1
  /** True while a job is in progress (from the start until End job; New job starts one again). */
  jobActive = true
  get jobEnded(): boolean {
    return !this.jobActive
  }
  endTime = ""
  /** The previous job's report, kept viewable until the new job logs its first reading. */
  previousJobs: {name: string; result: string; endTime: string; label: string; status: string; data: SummaryData}[] = []
  /** Index into previousJobs of the report being viewed, or -1 for the current job's. */
  viewingPrevious = -1
  private viewerReturn = "camera"
  private viewerId = -1
  /** Index into previousJobs when the viewer shows a previous job's picture (view only), else -1. */
  private viewerPrevJob = -1
  private viewerConfirm = false
  /** Screen offset (fraction of the view) of the menu's top-left from the cabinet's top-left corner. */
  /** Real cm between the left column of cards and the cabinet's left edge (seen from the eye). */
  private columnGapCm = 1.5
  private schematicWasOpen = false
  private textFactor = 1
  private schemFactor = 1
  private placed: {so: SceneObject; basePos: vec3; baseScale: vec3; centered: boolean; bottom: boolean; width: number; factor: number}[] = []
  private cardHosts: {so: SceneObject; ui: any; built: number; cap: number; settle: number}[] = []
  private displayBtnBase: vec3 | null = null
  private hiddenFlag = false
  private libHiddenFlag = false
  private libFader: DisplayFader | null = null
  private libBtn: ButtonHandle | null = null
  private libControls: SceneObject | null = null
  lastMessage: string = ""
  lastResultColor: string = ""
  lastTagInfo: string = ""
  savedToJobLog: boolean = false
  jobLog: string[] = []
  /** Snapshots and photos of this session (memory only, never written to disk or sent anywhere). */
  captures: Capture[] = []
  private nextCaptureId = 1
  private captureBusy = false
  private snapshotCam: SnapshotCamera | null = null

  private audio: AudioComponent | null = null
  private fader: DisplayFader | null = null
  private labelsFader: DisplayFader | null = null
  private displayBtn: ButtonHandle | null = null
  private lastGrabToggle = -10
  private initialized = false

  onAwake() {
    if (!this.netlistAsset) {
      print("[MWNP] ERROR: netlistAsset not wired")
      return
    }
    this.nl = Netlist.parse(this.netlistAsset.getString())
    this.agent = new MWNPAgent(this.nl)
    ;(global as any).mwnpAssistant = this
    this.audio = this.sceneObject.createComponent("Component.AudioComponent") as AudioComponent
    this.audio.playbackMode = Audio.PlaybackMode.LowLatency
    this.createEvent("OnStartEvent").bind(() => this.start())
  }

  // ── Startup ───────────────────────────────────────────────────────────────

  /** First enabled camera that has device tracking (the user's head), else the first enabled camera. */
  private findUserCamera(): SceneObject | null {
    let any: SceneObject | null = null
    let tracked: SceneObject | null = null
    const scan = (o: SceneObject) => {
      if (tracked) return
      if (o.isEnabledInHierarchy && o.getComponent("Component.Camera")) {
        if (!any) any = o
        if (o.getComponent("Component.DeviceTracking")) tracked = o
      }
      for (let i = 0; i < o.getChildrenCount(); i++) scan(o.getChild(i))
    }
    for (let i = 0; i < global.scene.getRootObjectsCount(); i++) scan(global.scene.getRootObject(i))
    return tracked ?? any
  }

  /**
   * World-locks the layout relative to where the user is when the Lens starts: the authored eye
   * (authoredEyePos, facing -Z) is moved onto the camera, keeping only its heading so the cabinet
   * stays upright. Same result in every preview environment and on device.
   */
  private placeRelativeToUser(): void {
    if (!this.anchorToUserAtStart) return
    const camSO = this.findUserCamera()
    if (!camSO) return
    const ct = camSO.getTransform()
    const camPos = ct.getWorldPosition()
    const look = ct.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
    const yaw = Math.atan2(-look.x, -look.z)
    const rot = quat.angleAxis(yaw, vec3.up())
    const t = this.sceneObject.getTransform()
    t.setWorldRotation(rot)
    t.setWorldPosition(camPos.sub(rot.multiplyVec3(this.authoredEyePos)))
    print("[MWNP] placed relative to user: camera " + camPos + " yaw " + ((yaw * 180) / Math.PI).toFixed(1) + "°")
  }

  private start(): void {
    this.placeRelativeToUser()
    // Tracking can settle a frame or two after start; re-anchor once more shortly after.
    const settle = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    settle.bind(() => this.placeRelativeToUser())
    settle.reset(0.25)

    const missing = ["cabinet", "partTags", "safetyNotice", "jobPanel", "stepCard", "findingCard", "summaryCard", "schematicPanel", "cameraCard", "libraryCard", "optionsCard", "notesCard", "photoViewer"].filter(
      (k) => !(this as any)[k]
    )
    if (missing.length > 0 || !this.nl) {
      print("[MWNP] ERROR: missing inputs: " + missing.join(", "))
      return
    }
    const nl = this.nl
    this.readViewAngle()
    // Cards are opaque by default (they sit in front of the cabinet); the Options card style can switch back to translucent.
    setCardOpaque(this.optionsCard.value("cardStyle") === "Opaque")
    this.cabinet.build(nl)
    this.partTags.build(this.cabinet.getTagAnchors(), this.cabinet.getWireLabels(), this.cabinet.getBoardNote())
    this.placeLeftColumn()
    this.placeChips()

    this.safetyNotice.onDismiss.add(() => this.onDismissNotice())
    this.jobPanel.onReportSymptom.add(() => this.onReportSymptom())
    this.jobPanel.onSymptomPicked.add((i) => this.onSymptomPicked(i))
    this.stepCard.onKey.add((k) => this.onKey(k))
    this.stepCard.onEnter.add(() => this.onEnter())
    this.stepCard.onMore.add((open) => this.partTags.setBoardNoteVisible(open))
    // Log reading opens the keypad as its own card; Cancel goes back; the chip (after an action) reopens the step card.
    this.stepCard.onLogReading.add(() => {
      this.click()
      this.stepCard.openKeypad()
    })
    this.stepCard.onKeypadCancel.add(() => {
      this.click()
      this.stepCard.closeKeypad()
    })
    this.stepCard.onChip.add(() => {
      this.click()
      // One card at a time: the step card coming back closes the schematic that was open beside its chip.
      if (this.schematicPanel.isOpen) this.schematicPanel.close()
      this.stepCard.expand()
    })
    this.stepCard.onSchematic.add(() => this.onSchematic())
    this.stepCard.onCamera.add(() => this.openCamera())
    this.libraryCard.onPick.add((k) => this.onLibraryPick(k))
    this.jobPanel.onEndRequest.add(() => this.onJobRequest("end"))
    this.jobPanel.onNewRequest.add(() => this.onJobRequest("new"))
    this.jobPanel.onConfirm.add((c) => this.onJobConfirm(c.kind, c.yes))
    this.jobPanel.onStartJob.add(() => this.onStartJob())
    this.jobPanel.onResume.add(() => this.onResumeFlow())
    this.libraryCard.onChip.add(() => this.onLibraryChip())
    this.summaryCard.onAddNote.add(() => this.onReportAddNote())
    this.notesCard.onNote.add((n) => this.onNote(n.text, n.placeholder))
    this.notesCard.onEdit.add((e) => this.onNoteEdit(e.id, e.text))
    this.summaryCard.onPrevious.add((i) => this.onPreviousPick(i))
    this.summaryCard.onBack.add(() => this.onBackToCurrent())
    this.summaryCard.onThumbTap.add((id) => this.openViewer(id))
    this.cameraCard.onThumbTap.add((id) => this.openViewer(id))
    this.photoViewer.onPrev.add(() => this.stepViewer(-1))
    this.photoViewer.onNext.add(() => this.stepViewer(1))
    this.photoViewer.onDelete.add(() => this.askDelete())
    this.photoViewer.onConfirm.add((yes) => this.onDeleteConfirm(yes))
    this.photoViewer.onClose.add(() => this.closeViewer())
    this.optionsCard.onChange.add((c) => this.onOptionChange(c))
    this.cameraCard.onClose.add(() => this.closeCamera())
    this.cameraCard.onSnapshot.add(() => this.onSnapshot())
    this.cameraCard.onPhoto.add(() => this.onPhoto())
    this.findingCard.onRetest.add(() => this.onRetest())
    this.findingCard.onFixed.add((yes) => this.onFixed(yes))
    this.summaryCard.onEndAsk.add((yes) => this.onEndAsk(yes))
    this.summaryCard.onSave.add(() => this.onSave())
    this.cabinet.onS1Toggled.add((pos) => this.onS1Toggled(pos))
    this.stepCard.onSwitch.add((e) => this.onSwitchPicked(e.component, e.position))
    this.partTags.onTagPinched.add((id) => this.onTagPinched(id))

    // Model starts in the reported condition: switch in the broken function's position.
    const ctl = this.simulatedFaultFunction ? nl.controlOf(this.simulatedFaultFunction) : null
    this.cabinet.setS1(ctl ? ctl.position : "UP")
    this.updateLamps()

    this.safetyNotice.show()
    this.visibleCard = "safety"
    this.buildDisplayControls()
    this.setupPlacement()
    this.setupDeviceExtras()
    this.initialized = true
    this.log("start")
  }

  // ── UI handlers ───────────────────────────────────────────────────────────

  private onDismissNotice(): void {
    const nl = this.nl as Netlist
    this.click()
    this.safetyNotice.hide()
    ;(this.agent as MWNPAgent).dismissNotice()
    // The Job card is built now but stays hidden: the Library is home, its Job button opens this card.
    this.jobPanel.showJob("Job: " + nl.data.machine + " " + nl.machineKind(), this.filesLoadedText, true, this.controlStatus())
    this.jobPanel.setVisible(false)
    this.flowCard = "job"
    // The Library menu is docked (expanded) in the column left of the cabinet; no other card is open until the user picks one.
    this.buildLibraryControls()
    this.libraryCard.show()
    this.visibleCard = "home"
    this.log("notice-dismissed")
  }

  private onReportSymptom(): void {
    const nl = this.nl as Netlist
    this.click()
    ;(this.agent as MWNPAgent).openSymptoms()
    const items = []
    for (let i = 0; i < nl.faultCount(); i++) items.push({key: nl.symptomKey(i), label: nl.symptomLabel(i)})
    this.jobPanel.showSymptoms(items)
    this.visibleCard = "symptoms"
    this.log("symptoms-open")
  }

  private onSymptomPicked(i: number): void {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    this.click()
    agent.pickSymptom(i)
    this.highlightIdx = -1
    this.lastUndo = null
    this.addNote("Agent", "Symptom reported: " + nl.symptomLabel(i) + ".")
    this.jobPanel.hide()

    // Path parts amber, everything else dim.
    this.cabinet.clearOutlines()
    const pathParts = nl.activePathComponents(i)
    for (const id of pathParts) {
      this.cabinet.setOutline(id, "amber")
      this.partTags.setTagState(id, "relevant")
    }
    this.applyTrace()

    this.stepCard.show()
    this.stepCard.setReasoning(nl.reasoning(i) + "\n" + nl.pathChain(i))
    this.stepCard.setPathCitation(nl.pathCitation(i))
    this.stepCard.setResult("", "")
    this.stepCard.setReadout("— V")
    this.visibleCard = "step"
    this.refreshStep()
    this.log("symptom-picked")
  }

  private onKey(k: string): void {
    if (this.jobEnded) return
    const agent = this.agent as MWNPAgent
    if (agent.phase !== "steps" && agent.phase !== "retest" && agent.phase !== "retest_wait") return
    this.click()
    const e = agent.key(k)
    this.stepCard.setReadout((e.length > 0 ? e : "—") + " V")
  }

  private onEnter(): void {
    if (this.jobEnded) return
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    if (agent.phase === "retest_wait") {
      // The reading belongs to the retest point, which is live only once the switch is back. Say so.
      const fn = agent.functionKey
      const ctl = fn ? nl.controlOf(fn) : null
      this.click()
      this.lastResultColor = ""
      this.lastMessage = "Flip " + (ctl ? ctl.component + " " + ctl.position : "the switch") + " first (pinch it on the model or use the button), then press Enter."
      this.stepCard.setResult(this.lastMessage, "")
      this.stepCard.closeKeypad() // back to the step card, where the message and the switch buttons are
      this.log("enter-blocked")
      return
    }
    const pointId = agent.activePoint()
    const undoSnap = this.captureUndo()
    const res = agent.enter(clock())
    if (res.accepted) {
      this.lastUndo = undoSnap // voice "undo" puts this reading back
      this.highlightIdx = -1
    }
    if (!res.accepted || !res.cls) {
      this.click()
      // Enter with nothing typed: say what to do instead of doing nothing.
      if (agent.phase === "steps" || agent.phase === "retest") {
        const hint = "Type the meter reading with the number pad, then press Enter."
        this.stepCard.setResult(hint, "amber")
        this.stepCard.setKeypadHint("Type the reading, then Enter.")
      }
      return
    }
    const v = nl.fmtReading(res.value)
    const disp = nl.display(res.pointId)
    const badgePos = this.cabinet.getBadgePos(res.pointId)
    this.lastResultColor = nl.classColorWord(res.cls)
    this.stepCard.setReadout("— V")

    if (res.cls === "in_spec") {
      this.play(this.passSfx)
      this.partTags.setBadge(res.pointId, badgePos, v + " V " + CHECK, "green")
      const comp = nl.baseId(res.pointId)
      // A part goes green once every check on it has passed (F1 waits for F1 OUT).
      const nextPoint = agent.activePoint()
      if (!nextPoint || nl.baseId(nextPoint) !== comp) this.cabinet.setOutline(comp, "green")
      this.lastMessage = disp + ": " + v + " V " + CHECK + " in spec (" + nl.rangeText(res.pointId) + "). Logged " + agent.readings[agent.readings.length - 1].time + "."
    } else if (res.cls === "open") {
      this.play(this.faultSfx)
      this.partTags.setBadge(res.pointId, badgePos, v + " V " + CROSS, "red")
      const step = agent.steps[agent.finding ? agent.finding.stepIndex : agent.stepIndex]
      this.lastMessage = v + " V at " + disp + " " + CROSS + " — " + this.humanize(step ? step.conclusion : "")
    } else if (res.cls === "unexplained") {
      this.play(this.faultSfx)
      this.lastMessage = fill(this.amberTemplate, {value: v})
    } else {
      // no_tolerance: raw reading vs nominal, no pass/fail mark (tolerance_rule).
      const p = nl.point(res.pointId)
      const nom = p && typeof p.nominal_v === "number" ? " (nominal " + nl.fmtNominal(p.nominal_v) + " V)" : ""
      this.partTags.setBadge(res.pointId, badgePos, v + " V", "raw")
      this.lastMessage = disp + ": " + v + " V" + nom + ". No tolerance defined in the job files — no pass/fail."
    }
    this.applyTrace()

    if (agent.phase === "finding" && agent.finding) {
      this.showFinding(pointId as string)
    } else if (agent.phase === "done") {
      this.onRetestPassed()
    } else {
      this.stepCard.setResult(this.lastMessage, this.lastResultColor === "green" ? "green" : this.lastResultColor)
      this.refreshStep()
      // The keypad card closes after Enter and the step card shrinks to its chip ("Step X of N"); pinch it to reopen.
      this.stepCard.collapse()
    }
    this.log("enter " + res.pointId + " " + v + " " + res.cls)
  }

  private onSchematic(): void {
    this.click()
    this.schematicPanel.toggle(this.currentWireId())
    // One card at a time: the schematic opens while the step card shrinks to its chip, and it returns when the schematic closes.
    if (this.schematicPanel.isOpen) this.stepCard.collapse()
    else this.stepCard.expand()
    this.log("schematic " + (this.schematicPanel.isOpen ? "open" : "closed"))
  }

  // ── Voice (Sparky) ────────────────────────────────────────────────────────

  /** Where SparkyVoice puts its listening indicator (root-local), set by placeChips: right of the Library chip. */
  voiceIndicatorPos: vec3 = new vec3(0, 20, -56)
  /** Clip names (Assets/Audio/Sparky) the last voice command wants spoken, in order; SparkyVoice plays those it has. */
  voiceClips: string[] = []
  private lastUndo: UndoState | null = null
  /** A wire the tech asked to highlight by voice (netlist index), -1 = follow the current step's wire. */
  private highlightIdx = -1

  private captureUndo(): UndoState {
    const agent = this.agent as MWNPAgent
    const outlines: {[id: string]: string} = {}
    for (const id of Object.keys(this.cabinet.outlineStates)) outlines[id] = this.cabinet.outlineStates[id]
    return {
      agent: agent.snapshot(),
      outlines,
      badges: this.partTags.getBadgeIds(),
      notesLen: this.notes.length,
      lastMessage: this.lastMessage,
      lastResultColor: this.lastResultColor,
      resultText: this.stepCard.resultText,
      resultColor: this.stepCard.resultColorWord,
    }
  }

  /** "step_<SYMPTOM>_<n>" for the step now showing ("step_EXTEND_2"), or "" when no step is showing. */
  private stepClipName(): string {
    const agent = this.agent as MWNPAgent
    const nl = this.nl as Netlist
    return agent.phase === "steps" && agent.faultIndex >= 0 ? "step_" + nl.symptomKey(agent.faultIndex) + "_" + (agent.stepIndex + 1) : ""
  }

  /** Brings the current step back on screen and fresh: card mode, schematic closed, texts and cabinet visuals refreshed. */
  private showStepAgain(): void {
    if (this.visibleCard !== "step") {
      this.hideOpenCard()
      this.resumeFlow()
    }
    if (this.schematicPanel.isOpen) this.schematicPanel.close()
    this.stepCard.show()
    this.refreshStep()
    this.applyTrace()
  }

  private undoLastReading(): string {
    const agent = this.agent as MWNPAgent
    const u = this.lastUndo
    if (!u) return "Nothing to undo"
    const ph = agent.phase
    const valid = (ph === "steps" || ph === "finding" || ph === "retest") && agent.readings.length === u.agent.readingsLen + 1
    this.lastUndo = null
    if (!valid) return "Can't undo that one"
    agent.restore(u.agent)
    this.cabinet.clearOutlines()
    for (const id of Object.keys(u.outlines)) this.cabinet.setOutline(id, u.outlines[id])
    for (const id of this.partTags.getBadgeIds()) if (u.badges.indexOf(id) < 0) this.partTags.removeBadge(id)
    const added = this.notes.length - u.notesLen
    if (added > 0) this.notes.splice(0, added) // notes are newest first
    this.notesCard.setNotes(this.notes)
    this.lastMessage = u.lastMessage
    this.lastResultColor = u.lastResultColor
    this.highlightIdx = -1
    if (this.visibleCard === "finding") {
      this.findingCard.hide()
      this.visibleCard = "step"
    } else if (this.visibleCard !== "step") {
      this.hideOpenCard()
    }
    this.partTags.hideExpected()
    this.stepCard.show()
    this.visibleCard = "step"
    this.stepCard.setResult(u.resultText, u.resultColor)
    this.stepCard.setReadout("— V")
    this.applyTrace()
    this.refreshStep()
    this.log("undo")
    return "Undone"
  }

  /** "Sparky, log <number>": types the number on the pad's behalf and presses Enter, exactly as the buttons do. */
  private voiceLog(value: string): string {
    const agent = this.agent as MWNPAgent
    if (!this.jobActive || (agent.phase !== "steps" && agent.phase !== "retest" && agent.phase !== "retest_wait")) return "Nothing to log right now"
    if (agent.phase === "retest_wait") return "Flip the switch first"
    if (this.visibleCard !== "step") {
      this.hideOpenCard()
      this.resumeFlow()
    }
    const before = agent.readings.length
    agent.entry = ""
    for (let i = 0; i < value.length; i++) agent.key(value.charAt(i))
    this.onEnter()
    if (agent.readings.length === before) return "Couldn't log " + value
    const cls = agent.readings[agent.readings.length - 1].cls
    this.voiceClips.push(cls === "open" ? "out_of_range" : cls === "unexplained" ? "cant_confirm" : "logged")
    const next = this.stepClipName()
    if (next && cls !== "unexplained") this.voiceClips.push(next)
    return "Logged " + value + " V. Say 'undo' to remove."
  }

  /**
   * Runs one Sparky command and returns the line to show ("Logged 12.0 V. Say 'undo' to remove."). Every command maps to an
   * action the buttons already have; nothing here decides anything the agent would not.
   */
  voiceCommand(name: string, arg: string = ""): string {
    const agent = this.agent as MWNPAgent | null
    const nl = this.nl as Netlist | null
    this.voiceClips = []
    if (!agent || !nl || !this.initialized) return "Not ready"
    if (this.visibleCard === "safety" && name === "dismiss") {
      this.onDismissNotice()
      return "Safety notice dismissed"
    }
    if (this.visibleCard === "safety") {
      this.voiceClips.push("dismiss_safety")
      return "Dismiss the safety notice first"
    }
    // Hidden display: the commands that act on a card show the display first, so the tech never gets stuck. "show" / "hide" /
    // "close" / "dismiss" deal with it themselves.
    if (this.displayHidden && ["hide_display", "show_display", "close", "dismiss"].indexOf(name) < 0) {
      this.setDisplayHidden(false)
      this.log("voice auto-show for " + name)
    }
    const steps = this.jobActive && agent.phase === "steps"
    switch (name) {
      case "next":
      case "back": {
        if (!steps) return "No step to move to"
        if (!(name === "next" ? agent.stepForward() : agent.stepBack())) return name === "next" ? "Already on the last step" : "Already on the first step"
        this.highlightIdx = -1
        this.showStepAgain()
        this.log("voice " + name)
        this.voiceClips.push(this.stepClipName())
        return "Step " + (agent.stepIndex + 1) + " of " + agent.steps.length
      }
      case "repeat": {
        if (!this.jobActive || (agent.phase !== "steps" && agent.phase !== "retest" && agent.phase !== "retest_wait")) return "Nothing to repeat"
        this.highlightIdx = -1
        this.showStepAgain()
        this.log("voice repeat")
        this.voiceClips.push(this.stepClipName())
        return "Repeating the step"
      }
      case "log":
        return this.voiceLog(arg)
      case "undo": {
        const r = this.undoLastReading()
        if (r === "Undone") {
          this.voiceClips.push("undone")
          this.voiceClips.push(this.stepClipName())
        } else if (r === "Nothing to undo") this.voiceClips.push("nothing_to_undo")
        return r
      }
      case "show_schematic": {
        if (!this.jobActive || (agent.phase !== "steps" && agent.phase !== "retest" && agent.phase !== "retest_wait")) return "The schematic is for a step"
        if (this.schematicPanel.isOpen) return "The schematic is open"
        if (this.visibleCard !== "step") {
          this.hideOpenCard()
          this.resumeFlow()
        }
        this.onSchematic()
        return "Schematic"
      }
      case "close": {
        if (this.schematicPanel.isOpen) {
          this.onSchematic()
          return "Closed the schematic"
        }
        if (this.stepCard.isKeypadOpen) {
          this.stepCard.closeKeypad()
          return "Closed the keypad"
        }
        if (this.visibleCard !== "home") {
          this.hideOpenCard()
          return "Closed"
        }
        return "Nothing to close"
      }
      case "open_library":
        if (this.visibleCard === "home") return "The Library is open"
        this.onLibraryChip()
        return "Library"
      case "open_report":
        this.onLibraryPick("report")
        return "Report"
      case "open_camera":
        this.onLibraryPick("camera")
        return "Camera"
      case "dismiss":
        return "Nothing to dismiss"
      case "symptom": {
        if (!this.jobActive || (agent.phase !== "job" && agent.phase !== "symptoms")) return "Not asking for a symptom now"
        let idx = -1
        for (let i = 0; i < nl.faultCount(); i++) if (nl.symptomKey(i).toLowerCase() === arg.toLowerCase()) idx = i
        if (idx < 0) return "Unknown symptom"
        if (this.visibleCard !== "symptoms") {
          this.hideOpenCard()
          this.onReportSymptom()
        }
        this.onSymptomPicked(idx)
        return "Symptom: " + nl.symptomLabel(idx)
      }
      case "retest":
        if (this.visibleCard !== "finding" || agent.phase !== "finding" || this.verifyState !== "") return "No retest to start"
        this.onRetest()
        return "Retest"
      case "new_job":
        if (!this.jobActive) {
          this.onStartJob()
          return "New job"
        }
        this.askConfirm("new")
        return "Start a new job? Say yes or no"
      case "yes":
      case "no": {
        const yes = name === "yes"
        if (this.visibleCard === "confirm") {
          this.onJobConfirm(this.confirmKind, yes)
          return yes ? "Yes" : "No"
        }
        if (this.visibleCard === "viewer" && this.photoViewer.view === "confirm") {
          this.onDeleteConfirm(yes)
          return yes ? "Deleted" : "Kept"
        }
        if (this.verifyState === "end_q") {
          this.onEndAsk(yes)
          return yes ? "Job ended" : "Job stays open"
        }
        return "Nothing to confirm"
      }
      case "not_yet":
        if (this.verifyState !== "end_q") return "Nothing to answer"
        this.onEndAsk(false)
        return "Job stays open"
      case "more":
      case "less":
        if (!this.stepCard.isVisible || this.stepCard.isCollapsed || this.stepCard.isKeypadOpen || this.visibleCard !== "step") return "No More button showing"
        this.stepCard.setMore(name === "more")
        return name === "more" ? "More" : "Less"
      case "cancel":
        if (this.stepCard.isKeypadOpen) {
          this.click()
          this.stepCard.closeKeypad()
          return "Cancelled"
        }
        if (this.visibleCard === "notes" && this.notesCard.cancel()) return "Cancelled"
        return "Nothing to cancel"
      case "s1_up":
      case "s1_down": {
        const pos = name === "s1_up" ? "UP" : "DOWN"
        const s1c = nl.component("S1")
        if (!s1c || !s1c.terminals || s1c.terminals.indexOf(pos) < 0) return "No S1 switch"
        this.onSwitchPicked("S1", pos)
        return "S1 " + pos
      }
      case "hide_display":
        this.setDisplayHidden(true)
        return "Cards hidden"
      case "show_display":
        this.setDisplayHidden(false)
        return "Cards shown"
      case "open_job":
        this.onLibraryPick("job")
        return "Job"
      case "open_options":
        this.onLibraryPick("options")
        return "Options"
      case "fixed":
      case "not_fixed":
        if (this.verifyState !== "fixed_q") return "Nothing to confirm yet"
        this.onFixed(name === "fixed")
        return name === "fixed" ? "Fixed" : "Not fixed"
      case "end_job":
        if (this.verifyState === "end_q") {
          this.onEndAsk(true)
          return "Job ended"
        }
        if (!this.jobActive) return "No job to end"
        this.askConfirm("end")
        return "End job? Say yes or no"
      case "highlight": {
        const ids: string[] = []
        nl.data.wires.forEach((w) => {
          if (ids.indexOf(w.id) < 0) ids.push(w.id)
        })
        const r = resolveWire(arg, ids)
        const idx = r.id ? nl.wireIndicesById(r.id)[0] : undefined
        if (!r.id || idx === undefined) {
          this.voiceClips.push("which_wire")
          return "Which wire?"
        }
        this.highlightIdx = idx
        this.applyTrace()
        if (this.schematicPanel.isOpen) this.schematicPanel.highlight(r.id)
        this.log("voice highlight " + r.id)
        return "Highlighting wire " + r.id
      }
    }
    return "Didn't understand"
  }

  // ── Camera card ───────────────────────────────────────────────────────────

  /** Display form of the test point a capture would attach to right now ("" when none). */
  private captureTargetId(): string {
    const agent = this.agent as MWNPAgent
    if (agent.phase === "retest_wait") return agent.retestPointId || ""
    return agent.activePoint() || ""
  }

  private openCamera(): void {
    if (this.visibleCard !== "step") return
    this.hideOpenCard()
    this.openCameraCard("step")
  }

  /** Opens the Camera card; Close returns to the view named `from` ("home" = no card). */
  private openCameraCard(from: string): void {
    this.click()
    const nl = this.nl as Netlist
    const id = this.captureTargetId()
    this.cameraReturn = from
    this.cameraCard.show(id ? "Attaches to test point: " + nl.display(id) : "No active test point")
    this.visibleCard = "camera"
    this.log("camera-open")
  }

  private closeCamera(): void {
    if (this.visibleCard !== "camera") return
    this.click()
    this.cameraCard.hide()
    this.showView(this.cameraReturn)
    this.log("camera-closed")
  }

  // ── Docked Library menu / Options navigation ──────────────────────────────

  /** Hides whatever card is open without losing its state; nothing is open afterwards ("home"). */
  private hideOpenCard(): void {
    const v = this.visibleCard
    if (v === "job" || v === "symptoms") this.jobPanel.setVisible(false)
    else if (v === "step") {
      this.schematicWasOpen = this.schematicPanel.isOpen
      this.schematicPanel.close()
      this.stepCard.hide()
    } else if (v === "finding") this.findingCard.setVisible(false)
    else if (v === "summary") this.summaryCard.setVisible(false)
    else if (v === "report") this.summaryCard.hide()
    else if (v === "camera") this.cameraCard.hide()
    else if (v === "options") this.optionsCard.hide()
    else if (v === "notes") this.notesCard.hide()
    else if (v === "viewer") this.photoViewer.hide()
    else if (v === "jobhome") this.jobPanel.hide()
    else if (v === "confirm") this.jobPanel.hideAux()
    this.visibleCard = "home"
  }

  /** Shows a view again as it was left ("home" = no card). */
  private showView(v: string): void {
    if (v === "report") {
      this.buildReport(false)
    } else if (v === "options") {
      this.optionsCard.show()
      this.visibleCard = "options"
    } else if (v === "notes") {
      this.notesCard.show(this.notes)
      this.visibleCard = "notes"
    } else if (v === "jobhome") {
      this.openJobHome()
    } else if (v === "home" || v === "confirm") {
      this.visibleCard = "home"
    } else {
      this.flowCard = v
      this.resumeFlow()
    }
  }

  /** Shows the job flow's current card again, exactly as it was left. */
  private resumeFlow(): void {
    switch (this.flowCard) {
      case "job":
      case "symptoms":
        this.jobPanel.setVisible(true)
        break
      case "step":
        this.stepCard.show()
        if (this.schematicWasOpen) this.schematicPanel.open(this.currentWireId())
        break
      case "finding":
        this.findingCard.setVisible(true)
        break
      case "summary":
        this.summaryCard.setVisible(true)
        break
    }
    this.visibleCard = this.flowCard
  }

  private onLibraryPick(key: string): void {
    const v = this.visibleCard
    this.click()
    if (key === "job") {
      if (v === "jobhome") return this.pulseCard(this.jobPanel.sceneObject)
      const beyondJobCard = this.flowCard === "step" || this.flowCard === "finding" || this.flowCard === "summary"
      if (!beyondJobCard) {
        // Before a symptom is reported the Job card is the flow card; if it is already showing, the press just pulses it.
        if (v === this.flowCard) return this.pulseCard(this.flowHost())
        this.hideOpenCard()
        this.resumeFlow()
      } else {
        // Mid-job the Job button opens the Job card with its actions (Back to the step, End job, New job).
        this.hideOpenCard()
        this.openJobHome()
      }
    } else if (key === "report") {
      if (v === "report" || v === "summary") return this.pulseCard(this.summaryCard.sceneObject)
      this.hideOpenCard()
      if (this.flowCard === "summary") this.resumeFlow()
      else this.buildReport(false)
    } else if (key === "camera") {
      if (v === "camera") return this.pulseCard(this.cameraCard.sceneObject)
      this.hideOpenCard()
      this.openCameraCard(v)
    } else if (key === "options") {
      if (v === "options") return this.pulseCard(this.optionsCard.sceneObject)
      this.hideOpenCard()
      this.optionsCard.show()
      this.visibleCard = "options"
    }
    this.log("library-pick " + key)
  }

  /** The card the Job button is showing for the current flow position. */
  private flowHost(): SceneObject {
    switch (this.flowCard) {
      case "step":
        return this.stepCard.sceneObject
      case "finding":
        return this.findingCard.sceneObject
      case "summary":
        return this.summaryCard.sceneObject
      default:
        return this.jobPanel.sceneObject
    }
  }

  private controlStatus(): string {
    return !this.jobActive ? "Status: No job" : (this.agent as MWNPAgent).repaired ? "Status: Repaired · not yet ended" : "Status: In progress"
  }

  /** Library > Job once the job is under way: the Job card with Back to the step / finding / summary, End job and New job. */
  private openJobHome(): void {
    const nl = this.nl as Netlist
    const label = this.flowCard === "finding" ? "Back to the finding" : this.flowCard === "summary" ? "Back to the summary" : "Back to the step"
    this.jobPanel.showJob("Job: " + nl.data.machine + " " + nl.machineKind(), this.filesLoadedText, this.jobActive, this.controlStatus(), this.jobActive ? label : "")
    this.visibleCard = "jobhome"
  }

  private onResumeFlow(): void {
    this.click()
    this.hideOpenCard()
    this.resumeFlow()
    this.log("job-resume")
  }

  /** Library chip: bring the Library back, closing whatever card is open (its state is kept). */
  private onLibraryChip(): void {
    this.click()
    this.hideOpenCard() // visibleCard becomes "home", which expands the Library
    this.log("library-chip")
  }

  /** "Add note" on the Job report's Notes & pictures tab opens the Notes card. */
  private onReportAddNote(): void {
    this.click()
    this.hideOpenCard()
    this.notesCard.show(this.notes)
    this.visibleCard = "notes"
    this.log("report-add-note")
  }

  // ── End job / New job ─────────────────────────────────────────────────────

  /** Which Job card End job / New job was pressed on, so No can return to it. */
  private confirmReturn = "job"

  private confirmKind = "end"
  /** The card that was open when a voice command asked the confirm, so No puts it back. */
  private confirmPrev = ""

  /** Asks the End job / New job confirm from any card (voice); the buttons only offer it on the Job card. */
  private askConfirm(kind: string): void {
    if (this.visibleCard === "confirm") return
    this.confirmPrev = this.visibleCard === "job" || this.visibleCard === "jobhome" ? "" : this.visibleCard
    this.onJobRequest(kind, true)
  }

  private onJobRequest(kind: string, anywhere: boolean = false): void {
    if (!anywhere && this.visibleCard !== "job" && this.visibleCard !== "jobhome") return
    this.confirmReturn = this.visibleCard === "jobhome" ? "jobhome" : "job"
    this.confirmKind = kind
    this.click()
    this.hideOpenCard()
    this.jobPanel.showConfirm(
      kind,
      kind === "end"
        ? "End this job? It is marked Complete and filed under Previous jobs with its readings, notes and pictures, and the board is cleared."
        : this.jobActive
        ? "Start a new job? The current job is filed under Previous jobs as Ended early, the board is cleared, and the symptom list opens."
        : "Start a new job? The symptom list opens on a clean board."
    )
    this.visibleCard = "confirm"
    this.log("confirm-" + kind)
  }

  private onJobConfirm(kind: string, yes: boolean): void {
    if (this.visibleCard !== "confirm") return
    this.click()
    this.jobPanel.hideAux()
    if (!yes) {
      if (this.confirmPrev) {
        const p = this.confirmPrev
        this.confirmPrev = ""
        this.showView(p)
        this.log("confirm-no")
        return
      }
      if (this.confirmReturn === "jobhome") this.openJobHome()
      else {
        this.jobPanel.setVisible(true)
        this.visibleCard = "job"
      }
      this.log("confirm-no")
      return
    }
    this.confirmPrev = ""
    if (kind === "end") this.endJob()
    else this.newJob()
  }

  /** "Start new job" on the Job card while no job is in progress (nothing to lose, so no confirmation). */
  private onStartJob(): void {
    this.click()
    this.newJob()
  }

  private resultText(): string {
    const agent = this.agent as MWNPAgent
    const f = agent.finding
    const fn = agent.functionKey
    if (agent.repaired) return fn ? fn + " restored" : "restored"
    return f ? "not resolved — " + f.head : "no finding logged"
  }

  /**
   * Files a copy of the current job's report under Previous jobs: "Complete" (End job), "Ended early" (New job while a job
   * was in progress) or "Saved copy" (Save on the report; the job goes on). Notes and pictures go with it.
   */
  private archiveJob(status: "Complete" | "Ended early" | "Saved copy"): void {
    const nl = this.nl as Netlist
    const old = this.agent as MWNPAgent
    const stamp = clock()
    const data = this.reportData(status !== "Saved copy")
    data.statusLine = status === "Saved copy" ? "Status: Saved copy · job still in progress · saved " + stamp : "Status: " + status + " · ended " + stamp
    data.statusColor = status === "Complete" ? "green" : status === "Ended early" ? "amber" : ""
    const name = "Job " + (this.previousJobs.length + 1) + " · " + (old.faultIndex >= 0 ? nl.symptomLabel(old.faultIndex) : "no symptom")
    const result = status === "Saved copy" ? "in progress" : this.resultText()
    if (status !== "Saved copy") this.endTime = stamp
    this.previousJobs.unshift({name, result, endTime: stamp, status, label: name + " — " + status + " · " + stamp, data})
  }

  /** Clears everything of the current job: readings, badges, outlines, traces, notes, pictures; a fresh agent at the Job card. */
  private clearBoard(): void {
    const nl = this.nl as Netlist
    this.viewingPrevious = -1
    this.captures = []
    this.notes = []
    this.notesCard.setNotes(this.notes)
    this.savedToJobLog = false
    this.lastMessage = ""
    this.lastResultColor = ""
    this.lastTagInfo = ""
    this.schematicWasOpen = false
    this.verifyState = ""
    this.agent = new MWNPAgent(nl)
    const agent = this.agent as MWNPAgent
    agent.dismissNotice()
    this.highlightIdx = -1
    this.lastUndo = null
    this.cabinet.clearOutlines()
    this.cabinet.setFocusWire(-1)
    this.cabinet.hideTraces()
    this.cabinet.setActivePoint(null, null)
    this.partTags.clearBadges()
    this.partTags.hideExpected()
    this.partTags.resetTags()
    this.stepCard.hide()
    this.stepCard.setResult("", "")
    this.stepCard.setReadout("— V")
    this.stepCard.setSwitchControls("", [], "")
    this.findingCard.hide()
    this.summaryCard.hide()
    this.schematicPanel.close()
    const ctl = this.simulatedFaultFunction ? nl.controlOf(this.simulatedFaultFunction) : null
    this.cabinet.setS1(ctl ? ctl.position : "UP")
    this.updateLamps()
  }

  /** End job (after Yes): stamp the end time, file the report as Complete, clear the board, show the empty Job report. */
  private endJob(): void {
    if (!this.jobActive) return
    this.verifyState = ""
    this.addNote("Agent", "Job ended: " + this.resultText() + ".")
    this.archiveJob("Complete")
    this.clearBoard()
    this.jobActive = false
    const nl = this.nl as Netlist
    this.jobPanel.showJob("Job: " + nl.data.machine + " " + nl.machineKind(), this.filesLoadedText, false, this.controlStatus())
    this.jobPanel.setVisible(false)
    this.flowCard = "job"
    this.visibleCard = "home"
    this.buildReport(false)
    this.log("job-ended")
  }

  /** New job (after Yes): a job in progress is filed first as Ended early; then a clean job starts at the symptom list. */
  private newJob(): void {
    const nl = this.nl as Netlist
    if (this.jobActive) {
      this.addNote("Agent", "Job ended early: " + this.resultText() + ".")
      this.archiveJob("Ended early")
    }
    this.clearBoard()
    this.jobActive = true
    this.endTime = ""
    const agent = this.agent as MWNPAgent
    agent.openSymptoms()
    const items = []
    for (let i = 0; i < nl.faultCount(); i++) items.push({key: nl.symptomKey(i), label: nl.symptomLabel(i)})
    this.jobPanel.showSymptoms(items)
    this.flowCard = "symptoms"
    this.visibleCard = "symptoms"
    this.log("job-new")
  }

  private addNote(source: string, text: string, placeholder: boolean = false): void {
    this.notes.unshift({id: this.nextNoteId++, time: clock(), source, text, placeholder})
    this.notesCard.setNotes(this.notes)
  }

  // ── Photo viewer ──────────────────────────────────────────────────────────

  /** The picture being viewed, with what the viewer shows about it. */
  private pictureInfo(): ViewerInfo | null {
    if (this.viewerPrevJob >= 0) {
      const pj = this.previousJobs[this.viewerPrevJob]
      const cap = pj ? pj.data.captures.filter((c) => c.id === this.viewerId)[0] : null
      if (!cap) return null
      return {texture: cap.texture, aspect: cap.aspect, placeholder: cap.placeholder || "", kind: cap.kind || "Picture", pointLabel: cap.pointLabel || "", time: cap.time || "", position: "", editable: false}
    }
    const idx = this.captures.map((c) => c.id).indexOf(this.viewerId)
    if (idx < 0) return null
    const c = this.captures[idx]
    return {
      texture: c.texture,
      aspect: c.aspect,
      placeholder: c.placeholder,
      kind: c.kind === "snapshot" ? "Snapshot (with labels)" : "Photo",
      pointLabel: c.pointLabel,
      time: c.time,
      position: idx + 1 + " of " + this.captures.length,
      editable: true,
    }
  }

  private showPicture(): void {
    const info = this.pictureInfo()
    if (!info) return this.closeViewer()
    this.viewerConfirm = false
    this.photoViewer.show(info)
  }

  /** Opens a thumbnail (Camera card or Job report) on the Photo viewer card. */
  private openViewer(id: number): void {
    const v = this.visibleCard
    if (id < 0 || (v !== "camera" && v !== "report" && v !== "summary")) return
    this.click()
    this.viewerReturn = v
    this.viewerPrevJob = v !== "camera" ? this.viewingPrevious : -1
    this.hideOpenCard()
    this.viewerId = id
    this.visibleCard = "viewer"
    this.showPicture()
    this.log("viewer-open " + id)
  }

  private stepViewer(dir: number): void {
    if (this.visibleCard !== "viewer" || this.viewerPrevJob >= 0 || this.captures.length === 0) return
    this.click()
    const ids = this.captures.map((c) => c.id)
    const i = ids.indexOf(this.viewerId)
    this.viewerId = ids[(i + dir + ids.length) % ids.length]
    this.showPicture()
    this.log("viewer-step " + this.viewerId)
  }

  private askDelete(): void {
    if (this.visibleCard !== "viewer" || this.viewerPrevJob >= 0) return
    this.click()
    this.viewerConfirm = true
    this.photoViewer.showConfirm()
  }

  private onDeleteConfirm(yes: boolean): void {
    if (this.visibleCard !== "viewer") return
    this.click()
    if (!yes) return this.showPicture()
    const ids = this.captures.map((c) => c.id)
    const i = ids.indexOf(this.viewerId)
    this.captures = this.captures.filter((c) => c.id !== this.viewerId)
    this.log("viewer-deleted " + this.viewerId)
    if (this.captures.length === 0) return this.closeViewer()
    this.viewerId = this.captures[Math.min(i, this.captures.length - 1)].id
    this.showPicture()
  }

  /** The Camera card's thumbnail follows the latest remaining picture. */
  private refreshCameraThumb(): void {
    const last = this.captures[this.captures.length - 1]
    if (last) this.cameraCard.setThumbnail(last.texture, last.aspect, last.placeholder, last.id)
    else this.cameraCard.setThumbnail(null, 1, "", -1)
  }

  /** Back to where the viewer was opened from (Camera card, the Job report, or a previous job's report). */
  private closeViewer(): void {
    if (this.visibleCard !== "viewer") return
    this.photoViewer.hide()
    this.viewerConfirm = false
    const back = this.viewerReturn
    this.visibleCard = "home"
    if (back === "camera") {
      this.refreshCameraThumb()
      this.cameraCard.show(this.cameraCard.targetText)
      this.visibleCard = "camera"
    } else if (this.viewerPrevJob >= 0) {
      this.visibleCard = back
      this.onPreviousPick(this.viewerPrevJob, true)
    } else if (back === "summary") {
      this.flowCard = "summary"
      this.buildReport(true, true)
    } else this.buildReport(false, true)
    this.viewerPrevJob = -1
    this.log("viewer-closed")
  }

  private onNote(text: string, placeholder: boolean): void {
    this.click()
    this.addNote("You", text, placeholder)
    this.log("note")
  }

  private onNoteEdit(id: number, text: string): void {
    this.click()
    for (const n of this.notes) {
      if (n.id === id) {
        n.text = text
        n.placeholder = false
      }
    }
    this.notesCard.setNotes(this.notes)
    this.log("note-edited")
  }

  private onPreviousPick(i: number, keepTab: boolean = false): void {
    const p = this.previousJobs[i]
    if (!p) return
    this.click()
    if (!keepTab) this.summaryCard.resetTab()
    this.viewingPrevious = i
    this.summaryCard.show({...p.data, statusLine: "Previous job · " + (p.data.statusLine || "").replace("Status: ", ""), previous: this.previousJobs.map((x) => ({label: x.label})), backToCurrent: true})
    this.log("previous-job " + i)
  }

  private onBackToCurrent(): void {
    this.click()
    this.buildReport(this.visibleCard === "summary")
    this.log("back-to-current")
  }

  /**
   * The user camera's vertical half-angle tangent (the SPECS 27 preview is about 18 degrees), used to keep the chips and the
   * top of the card column inside the default frame. The cabinet itself stays at its authored full size and position.
   */
  private readViewAngle(): void {
    const camSO = this.findUserCamera()
    const cam = camSO ? (camSO.getComponent("Component.Camera") as Camera) : null
    if (cam && cam.fov > 0.01) {
      this.viewTanV = Math.tan(cam.fov / 2)
      if (cam.aspect > 0.01) this.viewTanH = this.viewTanV * cam.aspect
    }
  }

  private viewTanV = 0.33
  private viewTanH = 0.289

  /**
   * Places the two chips (Library, Step) inside the default frame, in the empty band above the cabinet (the Safety notice has
   * gone by then): Library chip on top, Step chip below it. Their positions are given to each card as an offset in its host's
   * own space, so they sit above the cabinet even though the cards themselves are in the column to its left.
   */
  private placeChips(): void {
    const eye = this.authoredEyePos
    const rootW = this.sceneObject.getTransform().getWorldTransform()
    const toHost = (host: SceneObject, rootLocal: vec3): vec3 => host.getTransform().getInvertedWorldTransform().multiplyPoint(rootW.multiplyPoint(rootLocal))
    const libHost = this.libraryCard.sceneObject
    const stepHost = this.stepCard.sceneObject
    const lp = libHost.getTransform().getLocalPosition()
    const s = libHost.getTransform().getLocalScale().x
    const dist = eye.z - lp.z
    const yTop = eye.y + this.viewTanV * dist - 1.0 // top of the frame at the cards' plane, less a margin
    const chipH = this.libraryCard.chipHeight * s // real cm
    const gap = MIN_GAP_CM
    // Left-aligned with the card column, at the top of the display area.
    const leftX = eye.x - this.viewTanH * dist + FRAME_MARGIN_CM
    this.voiceIndicatorPos = new vec3(leftX + LIBRARY_CHIP_CM + 1.2, yTop - chipH / 2, lp.z + 0.6 * s)
    this.libraryCard.setChipOffset(toHost(libHost, new vec3(leftX + LIBRARY_CHIP_CM / 2, yTop - chipH / 2, lp.z + 0.6 * s)))
    this.stepCard.setChipOffset(toHost(stepHost, new vec3(leftX + STEP_CHIP_CM / 2, yTop - chipH - gap - chipH / 2, lp.z + 0.6 * s)))
  }

  private placeLeftColumn(): void {
    const eye = this.authoredEyePos
    const stepT = this.stepCard.sceneObject.getTransform()
    const libT = this.libraryCard.sceneObject.getTransform()
    libT.setWorldRotation(stepT.getWorldRotation())
    const chipRowLocal = this.libraryCard.chipHeight + realToLocal(this.libraryCard.sceneObject, MIN_GAP_CM)
    // [host, widthCm, isLibrary, keepY]
    const hosts: [SceneObject, number, boolean, boolean][] = [
      [this.libraryCard.sceneObject, this.libraryCard.menuWidth, true, false],
      [this.jobPanel.sceneObject, this.jobPanel.widthCm, false, false],
      [this.stepCard.sceneObject, this.stepCard.widthCm, false, false],
      [this.findingCard.sceneObject, this.findingCard.widthCm, false, false],
      [this.summaryCard.sceneObject, this.summaryCard.widthCm, false, false],
      [this.cameraCard.sceneObject, this.cameraCard.widthCm, false, false],
      [this.optionsCard.sceneObject, this.optionsCard.widthCm, false, false],
      [this.notesCard.sceneObject, this.notesCard.widthCm, false, false],
      [this.photoViewer.sceneObject, this.photoViewer.widthCm, false, false],
      [this.schematicPanel.sceneObject, this.schematicPanel.widthCm, false, true],
    ]
    for (const [host, widthLocal, isLibrary, keepY] of hosts) {
      const t = host.getTransform()
      const lp = t.getLocalPosition()
      const s = t.getLocalScale().x
      // The column starts at the left edge of the display area (the camera's view at this card's distance), a margin in, and
      // runs right over the left side of the cabinet as far as the cards are wide (they sit in front of it, opaque).
      const leftX = eye.x - this.viewTanH * (eye.z - lp.z) + FRAME_MARGIN_CM
      // The column starts at the top of the view (the cards are tall), not at the cabinet's top.
      const topY = eye.y + this.viewTanV * (eye.z - lp.z) - 1.0
      // The Library menu (or its chip) is the top row; the open card sits right below it.
      const y = keepY ? lp.y : isLibrary ? topY : topY - chipRowLocal * s
      t.setLocalPosition(new vec3(leftX + (widthLocal * s) / 2, y, lp.z))
    }
  }

  /**
   * The Library's own Hide / Show: the same button as the main one (label, size, style, fade), a separate button floating
   * just outside the Library card's top-right corner (the side facing the center), kept in place while the Library is hidden.
   */
  private buildLibraryControls(): void {
    const host = this.libraryCard.sceneObject.getTransform()
    if (!this.libControls) {
      const root = makeObj(this.sceneObject, "LibraryControls")
      root.createComponent("Component.Canvas")
      this.libControls = root
    }
    const root = this.libControls
    const rt = root.getTransform()
    rt.setWorldPosition(host.getWorldPosition())
    rt.setWorldRotation(host.getWorldRotation())
    rt.setWorldScale(host.getWorldScale())
    if (this.libBtn) return
    const em = cardEm(root, 1.0)
    const w = 8.0
    const h = 3.6
    const btn = addButton(root, "Btn_LibraryToggle", "Hide", w, h, () => this.onLibraryToggle(), {emCm: em, bold: true, inFlex: false, icon: ICON_HIDE})
    btn.so.getTransform().setLocalPosition(new vec3(this.libraryCard.menuWidth / 2 - w / 2, h / 2 + 1.0, 0))
    this.libBtn = btn
    this.libFader = new DisplayFader(this, [this.libraryCard.sceneObject], null, 0.35, true)
  }

  private onLibraryToggle(): void {
    this.click()
    // Decide from what is really on screen, not from a remembered flag.
    this.setLibraryHidden(this.libFader ? this.libFader.visible : !this.libHiddenFlag)
  }

  /** Both Hide / Show buttons always say what their display is actually doing (shown -> "Hide", hidden -> "Show"). */
  private syncToggleLabels(): void {
    if (this.libFader && this.libBtn) {
      const hidden = !this.libFader.visible
      this.libHiddenFlag = hidden
      this.setToggleLabel(this.libBtn, hidden)
    }
    if (this.fader && this.displayBtn) {
      this.hiddenFlag = !this.fader.visible
      this.setToggleLabel(this.displayBtn, this.hiddenFlag)
    }
  }

  private setToggleLabel(btn: ButtonHandle, hidden: boolean): void {
    const want = hidden ? "Show" : "Hide"
    if (btn.label.text !== want) {
      btn.label.text = want
      if (btn.iconMat) btn.iconMat.mainPass.baseTex = hidden ? ICON_SHOW : ICON_HIDE
    }
  }

  /** Fades the Library menu out (true) or back in (false); its button stays where it is. */
  setLibraryHidden(hidden: boolean): void {
    if (!this.libFader) return
    this.libHiddenFlag = hidden
    this.libFader.setHidden(hidden)
    if (this.libBtn) {
      this.libBtn.label.text = hidden ? "Show" : "Hide"
      if (this.libBtn.iconMat) this.libBtn.iconMat.mainPass.baseTex = hidden ? ICON_SHOW : ICON_HIDE
    }
    this.log(hidden ? "library-hidden" : "library-shown")
  }

  private onOptionChange(c: OptionChange): void {
    this.click()
    if (c.key === "labels" || c.key === "hideButton") this.applyHide()
    else if (c.key === "cardStyle") setCardOpaque(c.index === 1)
    else if (c.key === "textSize") {
      this.textFactor = [1, 1.25, 1.5][c.index]
      for (const h of this.cardHosts) h.cap = 99
    }
    else if (c.key === "schematic") this.schemFactor = [1, 1.35][c.index]
    this.log("option " + c.key + " " + c.value)
  }

  private userCameraObject(): SceneObject | null {
    return this.findUserCamera()
  }

  private addCapture(kind: "snapshot" | "photo", texture: Texture | null, aspect: number, placeholder: string): Capture {
    const nl = this.nl as Netlist
    const id = this.captureTargetId()
    const label = id ? nl.display(id) : "no test point"
    const c: Capture = {
      id: this.nextCaptureId++,
      pointId: id,
      pointLabel: label,
      kind,
      time: clock(),
      texture,
      aspect,
      placeholder,
      caption: (kind === "snapshot" ? "Snapshot (with labels)" : "Photo") + " · " + label + " · " + clock() + (placeholder ? " · " + placeholder : ""),
    }
    this.captures.push(c)
    return c
  }

  private static readonly MAX_CAPTURES = 12

  private onSnapshot(): void {
    if (this.captureBusy || this.visibleCard !== "camera") return
    if (this.captures.length >= MWNPMain.MAX_CAPTURES) {
      this.cameraCard.setStatus("Capture limit reached (" + MWNPMain.MAX_CAPTURES + ").", "amber")
      return
    }
    const cam = this.userCameraObject()
    if (!cam) {
      this.cameraCard.setStatus("No camera found for a snapshot.", "red")
      return
    }
    this.click()
    this.captureBusy = true
    this.cameraCard.setStatus("Taking snapshot…", "cyan")
    // Show the step context (cabinet, tags, badges, step card) for the capture frames instead of the Camera card.
    this.cameraCard.setBodyEnabled(false)
    if (this.cameraReturn === "step") this.stepCard.show()
    if (!this.snapshotCam) this.snapshotCam = new SnapshotCamera(this, cam)
    this.snapshotCam
      .snapshot(960)
      .then((r) => {
        const c = this.addCapture("snapshot", r.texture, r.aspect, "")
        this.finishCapture(c, "Snapshot attached to " + c.pointLabel + ".")
      })
      .catch((e) => {
        this.finishCapture(null, "Snapshot failed: " + e)
      })
  }

  private onPhoto(): void {
    if (this.captureBusy || this.visibleCard !== "camera") return
    if (this.captures.length >= MWNPMain.MAX_CAPTURES) {
      this.cameraCard.setStatus("Capture limit reached (" + MWNPMain.MAX_CAPTURES + ").", "amber")
      return
    }
    this.click()
    this.captureBusy = true
    this.cameraCard.setStatus("Taking photo…", "cyan")
    takePhoto(this).then((r) => {
      const c = this.addCapture("photo", r.texture, r.aspect, r.texture ? "" : PHOTO_PLACEHOLDER)
      print("[MWNP] photo: " + r.note)
      this.finishCapture(c, r.texture ? "Photo attached to " + c.pointLabel + "." : PHOTO_PLACEHOLDER + " — attached to " + c.pointLabel + ".")
    })
  }

  private finishCapture(c: Capture | null, status: string): void {
    this.captureBusy = false
    if (this.visibleCard === "camera") {
      this.stepCard.hide()
      this.cameraCard.setBodyEnabled(true)
      this.cameraCard.setStatus(status, c ? "green" : "red")
      if (c) this.cameraCard.setThumbnail(c.texture, c.aspect, c.placeholder, c.id)
    }
    this.log(c ? "capture " + c.kind + " " + c.pointId : "capture-failed")
  }

  private onRetest(): void {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    this.click()
    agent.startRetest()
    this.findingCard.hide()
    // After lockout the switch is off the function position; the tech flips it back to retest.
    const fn = agent.functionKey
    const ctl = fn ? nl.controlOf(fn) : null
    if (ctl) {
      const comp = nl.component(ctl.component)
      const other = comp && comp.terminals ? comp.terminals.filter((t) => t !== "COM" && t !== ctl.position)[0] : null
      if (other) this.cabinet.setS1(other)
    }
    this.updateLamps()
    if (agent.finding && agent.finding.kind === "component") this.cabinet.setOutline(agent.finding.id, "amber")
    this.stepCard.show()
    this.visibleCard = "step"
    this.refreshStep()
    this.stepCard.setResult("", "")
    this.log("retest-wait")
  }

  private onS1Toggled(pos: string): void {
    const agent = this.agent as MWNPAgent
    this.click()
    this.updateLamps()
    if (agent.switchMoved("S1", pos)) {
      this.stepCard.setResult("", "")
      this.refreshStep()
      this.log("retest-active")
    } else {
      this.log("s1 " + pos)
    }
  }

  /** The backup buttons (e.g. S1 UP / S1 DOWN) on the retest card; positions come from the netlist component. */
  private updateSwitchControls(): void {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    const retest = agent.phase === "retest_wait" || agent.phase === "retest"
    const fn = agent.functionKey
    const ctl = fn ? nl.controlOf(fn) : null
    if (retest && ctl) {
      const comp = nl.component(ctl.component)
      const positions = comp && comp.terminals ? comp.terminals.filter((t) => t !== "COM") : []
      this.stepCard.setSwitchControls(ctl.component, positions, this.cabinet.s1Position)
    } else {
      this.stepCard.setSwitchControls("", [], "")
    }
  }

  /** A backup switch button: same effect as pinching the switch on the model. */
  private onSwitchPicked(component: string, position: string): void {
    if (component === "S1") this.cabinet.setS1(position)
    this.onS1Toggled(position)
  }

  // ── Hide / Show display ───────────────────────────────────────────────────

  /** True while the display is hidden or fading out. */
  get displayHidden(): boolean {
    return this.hiddenFlag
  }

  /** Whether the labels (tags, badges, outlines, traces) follow the Hide button right now. */
  private labelsHide(): boolean {
    return this.hiddenFlag && this.optionsCard.value("hideButton") === "Everything"
  }

  private applyHide(): void {
    if (!this.fader || !this.labelsFader) return
    this.fader.setHidden(this.hiddenFlag)
    this.labelsFader.setHidden(this.labelsHide())
  }

  /** Fades the cards (and, per the Options, the labels) out (true) or back in the same state (false). */
  setDisplayHidden(hidden: boolean): void {
    if (!this.fader) return
    this.hiddenFlag = hidden
    this.applyHide()
    if (this.displayBtn) {
      this.displayBtn.label.text = hidden ? "Show" : "Hide"
      if (this.displayBtn.iconMat) this.displayBtn.iconMat.mainPass.baseTex = hidden ? ICON_SHOW : ICON_HIDE
    }
    this.log(hidden ? "display-hidden" : "display-shown")
  }

  private onDisplayToggle(): void {
    this.click()
    this.setDisplayHidden(!this.displayHidden)
  }

  /** The always-visible Hide / Show button at the cabinet's top-right edge, and the fader behind it. */
  private buildDisplayControls(): void {
    const host = this.stepCard.sceneObject
    const root = makeObj(this.sceneObject, "DisplayControls")
    root.createComponent("Component.Canvas")
    const ht = host.getTransform()
    const rt = root.getTransform()
    rt.setLocalPosition(ht.getLocalPosition())
    rt.setLocalRotation(ht.getLocalRotation())
    rt.setLocalScale(ht.getLocalScale())
    const em = cardEm(root, 1.0)
    const w = 8.0
    const h = 3.6
    const btn = addButton(root, "Btn_DisplayToggle", "Hide", w, h, () => this.onDisplayToggle(), {emCm: em, bold: true, inFlex: false, icon: ICON_HIDE})
    // Flush with the step card's right edge, just above its top edge = the cabinet's top-right corner on screen.
    btn.so.getTransform().setLocalPosition(new vec3(this.stepCard.widthCm / 2 - w / 2, h / 2 + 1.0, 0))
    this.displayBtn = btn
    this.displayBtnBase = btn.so.getTransform().getLocalPosition()
    this.fader = new DisplayFader(this, [host.getParent() as SceneObject], null, 0.35, true)
    this.labelsFader = new DisplayFader(this, [this.partTags.sceneObject], this.cabinet)
    this.createEvent("UpdateEvent").bind(() => this.syncToggleLabels())
  }

  /**
   * Device-only extra: make a fist (grab) to hide / show the display. No voice recognition is used (it needs the
   * internet and blocks camera frames, which would make the Camera card unpublishable). Skipped in the editor and
   * wrapped so a missing module never breaks the Lens; the button above always works.
   */
  private setupDeviceExtras(): void {
    if (global.deviceInfoSystem.isEditor()) return
    try {
      const gestures = require("LensStudio:GestureModule") as GestureModule
      const onGrab = () => {
        // A fist toggles the display; ignore a second fist within a second (hand jitter).
        if (getTime() - this.lastGrabToggle < 1) return
        this.lastGrabToggle = getTime()
        this.setDisplayHidden(!this.displayHidden)
      }
      gestures.getGrabBeginEvent(GestureModule.HandType.Right).add(onGrab)
      gestures.getGrabBeginEvent(GestureModule.HandType.Left).add(onGrab)
    } catch (e) {
      print("[MWNP] grab gesture unavailable: " + e)
    }
  }

  private onTagPinched(id: string): void {
    const nl = this.nl as Netlist
    this.click()
    const c = nl.component(id)
    if (!c) return
    let msg = id + ": " + c.description + "."
    const p = nl.point(id)
    if (!p || !nl.hasTolerance(id)) msg += " No tolerance defined in the job files."
    else msg += " " + nl.expectedText(id) + ", " + nl.rangeText(id) + "."
    this.lastTagInfo = msg
    this.partTags.showTagInfo(id, msg)
    this.log("tag " + id)
  }

  /** Save (this session): files a snapshot copy of the report under Previous jobs; the job goes on. */
  private onSave(): void {
    if (!this.jobActive) return
    this.click()
    const agent = this.agent as MWNPAgent
    this.jobLog.push(JSON.stringify({readings: agent.readings, finding: agent.finding, repaired: agent.repaired, captures: this.captures.map((c) => ({id: c.id, point: c.pointId, kind: c.kind, time: c.time, image: !!c.texture}))}))
    this.archiveJob("Saved copy")
    this.savedToJobLog = true
    this.summaryCard.refresh(this.reportData(this.visibleCard === "summary"))
    this.summaryCard.setSaved("Saved (this session) " + CHECK)
    this.log("saved")
  }

  // ── Flow helpers ──────────────────────────────────────────────────────────

  private showFinding(pointId: string): void {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    const f = agent.finding
    if (!f) return
    if (f.kind === "component") this.cabinet.setOutline(f.id, "red")
    this.cabinet.setActivePoint(null, null)
    this.partTags.hideExpected()
    this.stepCard.hide()
    this.schematicPanel.close()

    // Evidence: last in-spec reading before the open, then the open reading.
    const diag = agent.readings.filter((r) => r.phase === "diagnose")
    const cur = diag[diag.length - 1]
    let prev = null
    for (let k = diag.length - 2; k >= 0; k--) if (diag[k].cls === "in_spec") {
      prev = diag[k]
      break
    }
    let evidence = ""
    if (prev) evidence += nl.fmtReading(prev.value) + " V at " + nl.display(prev.pointId) + ", "
    evidence += nl.fmtReading(cur.value) + " V at " + nl.display(cur.pointId) + "."
    const comp = f.kind === "component" ? nl.component(f.id) : null
    const rating = comp ? nl.shortRating(comp.id) : null
    if (comp && rating) evidence += " Schematic: " + comp.id + " is " + rating + "."

    let action = this.humanize(f.conclusion)
    let btn = "Repaired: retest"
    if (comp && comp.type === "fuse") {
      const outIdx = nl.wireOutOf(comp.id + ":OUT")
      const fn = agent.functionKey
      action = fill(this.fuseActionTemplate, {
        part: comp.id,
        rating: rating || "",
        downstream: outIdx >= 0 ? nl.data.wires[outIdx].id : "",
        load: fn ? nl.data.functions[fn].load : "",
      })
      btn = "Fuse replaced: retest"
    }
    this.findingCard.show("Finding: " + f.head + ".", evidence, action, btn, f.head, "Finding")
    this.addNote("Agent", "Fault found: " + f.head + " — " + evidence)
    this.visibleCard = "finding"
    void pointId
  }

  private onRetestPassed(): void {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    for (const id of nl.activePathComponents(agent.faultIndex)) this.cabinet.setOutline(id, "green")
    this.updateLamps()
    this.cabinet.setActivePoint(null, null)
    this.stepCard.setResult(this.lastMessage, "green")
    {
      const last = agent.readings[agent.readings.length - 1]
      const fnKey = agent.functionKey
      this.addNote("Agent", "Fix confirmed: " + (fnKey ? fnKey + " restored" : "restored") + " — " + nl.display(last.pointId) + " " + nl.fmtReading(last.value) + " V in spec.")
    }
    this.log("retest-passed")
    const ev = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    ev.bind(() => this.showVerify())
    ev.reset(this.summaryDelaySec)
  }

  /** Retest in spec: the job stays open. Ask "Problem solved?" (Yes, fixed / No, still faulty) in the finding card's slot. */
  private showVerify(): void {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    if (agent.phase !== "done") return
    const last = agent.readings[agent.readings.length - 1]
    const evidence = "Retest: " + nl.display(last.pointId) + " " + nl.fmtReading(last.value) + " V " + CHECK + " in spec. Is the problem solved?"
    this.stepCard.hide()
    this.schematicPanel.close()
    this.verifyState = "fixed_q"
    this.findingCard.showVerify("Problem solved?", evidence, "Yes, fixed", "No, still faulty")
    const away = this.visibleCard === "home" || this.visibleCard === "camera" || this.visibleCard === "options" || this.visibleCard === "notes"
    if (this.visibleCard === "camera") this.cameraCard.hide()
    this.flowCard = "finding"
    if (away) this.findingCard.setVisible(false)
    else this.visibleCard = "finding"
    this.log("verify-ask")
  }

  /** "Yes, fixed" / "No, still faulty" (buttons or voice). Every decision goes in the job notes with its time. */
  private onFixed(yes: boolean): void {
    if (this.verifyState !== "fixed_q") return
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    const last = agent.readings[agent.readings.length - 1]
    const rt = last ? nl.display(last.pointId) + " " + nl.fmtReading(last.value) + " V" : "no reading"
    const f = agent.finding ? agent.finding.head : "no finding"
    this.click()
    this.findingCard.hide()
    if (yes) {
      this.addNote("Tech", "Problem solved? Yes, fixed. Finding: " + f + ". Retest: " + rt + " in spec.")
      this.verifyState = "end_q"
      this.log("verify-fixed")
      this.showSummary()
      return
    }
    this.addNote("Tech", "Problem solved? No, still faulty. Finding: " + f + ". Retest: " + rt + " in spec. Back to the step list; job stays open.")
    this.verifyState = ""
    agent.reopenAfterNotFixed()
    // Back to the state the first pass started in: no stale badges, undo, highlight or S1 flip from the failed retest.
    this.highlightIdx = -1
    this.lastUndo = null
    this.partTags.clearBadges()
    this.partTags.resetTags()
    this.stepCard.setReadout("— V")
    {
      const fnKey = agent.functionKey
      const ctl = fnKey ? nl.controlOf(fnKey) : null
      if (ctl) this.cabinet.setS1(ctl.position)
    }
    this.cabinet.clearOutlines()
    for (const id of nl.activePathComponents(agent.faultIndex)) {
      this.cabinet.setOutline(id, "amber")
      this.partTags.setTagState(id, "relevant")
    }
    this.cabinet.hideTraces()
    this.updateLamps()
    this.stepCard.show()
    this.stepCard.setResult("", "")
    this.flowCard = "step"
    this.visibleCard = "step"
    this.refreshStep()
    this.applyTrace()
    this.log("verify-not-fixed")
  }

  /** "End job?" on the summary: Yes closes the job; Not yet keeps it open. */
  private onEndAsk(yes: boolean): void {
    if (this.verifyState !== "end_q") return
    this.click()
    if (yes) {
      this.verifyState = ""
      this.addNote("Tech", "End job? Yes.")
      this.endJob()
      return
    }
    this.verifyState = ""
    this.addNote("Tech", "End job? Not yet. Job stays open.")
    this.buildReport(true, true)
    this.log("end-not-yet")
  }

  private showSummary(): void {
    const agent = this.agent as MWNPAgent
    agent.phase = "summary"
    this.stepCard.hide()
    this.schematicPanel.close()
    this.buildReport(true)
  }

  /** The Job report data for the current job: final at the end of the job, partial (readings so far) otherwise. */
  private reportData(final: boolean): SummaryData {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    if (!this.jobActive) {
      return {
        title: "Job report",
        jobLine: "",
        symptomLine: "",
        statusLine: "No job in progress — start one from Job",
        statusColor: "amber",
        noJob: true,
        readingsHeading: "",
        rows: [],
        captures: [],
        notes: this.notes.map((n) => ({time: n.time, source: n.source, text: n.text})),
        previous: this.previousJobs.map((x) => ({label: x.label})),
        findingLine: "",
        actionLine: "",
        resultLine: "",
        saveLabel: "Save (this session)",
      }
    }
    const rows: SummaryRow[] = agent.readings.map((r) => {
      const mark = r.cls === "in_spec" ? CHECK + " in spec" : r.cls === "open" ? CROSS + " open" : r.cls === "unexplained" ? "? unexplained" : "raw"
      return {
        text: nl.display(r.pointId) + "  ·  " + nl.fmtReading(r.value) + " V  ·  " + r.range + "  ·  " + r.time + "  ·  " + mark + (r.phase === "retest" ? " (retest)" : ""),
        colorWord: r.colorWord,
        pointId: r.pointId,
        cells: {
          point: nl.display(r.pointId),
          value: nl.fmtReading(r.value) + " V",
          status: mark,
          detail: "range " + r.range + "  ·  " + r.time + (r.phase === "retest" ? "  ·  retest" : ""),
        },
      }
    })
    const captures: ReportCapture[] = this.captures.map((c) => ({id: c.id, pointId: c.pointId, caption: c.caption, texture: c.texture, aspect: c.aspect, kind: c.kind === "snapshot" ? "Snapshot (with labels)" : "Photo", pointLabel: c.pointLabel, time: c.time, placeholder: c.placeholder}))
    const f = agent.finding
    const comp = f && f.kind === "component" ? nl.component(f.id) : null
    const rating = comp ? nl.shortRating(comp.id) : null
    const action = !final
      ? "Action taken: none yet."
      : !agent.repaired
      ? "Action taken: none recorded."
      : comp && comp.type === "fuse"
      ? "Action taken: replaced " + comp.id + " with " + rating + "."
      : "Action taken: repaired — " + (f ? this.humanize(f.conclusion) : "")
    return {
      title: "Job report",
      jobLine: "Job: " + nl.data.machine + " " + nl.machineKind() + " · rev " + (nl.data.revision || "-"),
      symptomLine: "Symptom: " + (agent.faultIndex >= 0 ? nl.symptomLabel(agent.faultIndex) : "not reported yet"),
      statusLine: "Status: " + (agent.repaired ? "Repaired · not yet ended" : "In progress"),
      statusColor: "amber",
      readingsHeading: "Readings (meter black lead on " + nl.referencePoint() + ")",
      rows,
      captures,
      notes: this.notes.map((n) => ({time: n.time, source: n.source, text: n.text})),
      previous: this.previousJobs.map((x) => ({label: x.label})),
      findingLine: f ? "Finding: " + f.head + " (" + this.findingEvidenceShort() + ")" : "Finding: none",
      actionLine: action,
      resultLine: !final ? "Result: in progress" : "Result: " + this.resultText(),
      resultColor: final && agent.repaired ? "green" : "",
      saveLabel: "Save (this session)",
      endAsk: final && this.verifyState === "end_q",
    }
  }

  /** Shows the Job report: final at the end of the job, partial when opened from the Library. */
  private buildReport(final: boolean, keepTab: boolean = false): void {
    const agent = this.agent as MWNPAgent
    if (!keepTab) this.summaryCard.resetTab()
    // A final report that arrives while the Library / Camera / Options is open waits, hidden, for the Job button.
    const away = final && (this.visibleCard === "home" || this.visibleCard === "camera" || this.visibleCard === "options" || this.visibleCard === "notes")
    if (final && this.visibleCard === "camera") this.cameraCard.hide()
    this.viewingPrevious = -1
    this.summaryCard.show(this.reportData(final))
    if (away) {
      this.summaryCard.setVisible(false)
      this.flowCard = "summary"
    } else this.visibleCard = final ? "summary" : "report"
    this.log(final ? "summary" : "report")
  }

  /**
   * Hide / Show buttons sit inside the top-right corner of their own card's header (not floating above it): the main
   * button follows whichever card is open, the Library's follows the Library. `k` = button units per card unit.
   */
  private updateDisplayButtonPos(): void {
    if (!this.displayBtn || !this.displayBtnBase) return
    const t = this.displayBtn.so.getTransform()
    let hostSO: SceneObject | null = null
    let cb: {body: SceneObject; plate: BackPlate} | null = null
    for (const h of this.cardHosts) {
      if (!h.so.isEnabledInHierarchy) continue
      const b = this.cardBodyOf(h.so)
      if (b && b.plate.size && b.plate.size.x > 1) {
        hostSO = h.so
        cb = b
        break
      }
    }
    if (!hostSO || !cb) {
      // No card is open (start screen, or only the Library menu): the main Hide button has nothing to hide, so it stays
      // away. It stays while the step card is a chip (the cabinet's labels still follow it) and while the display is
      // already hidden (it must be there to say "Show").
      const keep = this.hiddenFlag || this.stepCard.isCollapsed
      this.displayBtn.so.enabled = keep
      t.setLocalPosition(this.displayBtnBase)
      return
    }
    this.displayBtn.so.enabled = true
    const hostT = hostSO.getTransform()
    const k = (this.displayBtn.so.getParent() as SceneObject).getTransform().getWorldScale().x / hostT.getWorldScale().x
    const local = this.headerCornerLocal(cb, 8.0 * k, 3.6 * k)
    t.setWorldPosition(hostT.getWorldTransform().multiplyPoint(local))
    t.setWorldRotation(hostT.getWorldRotation())
  }

  /** Where a w x h button (card units) sits inside the top-right corner of a card's header, in the card host's local space. */
  private headerCornerLocal(cb: {body: SceneObject; plate: BackPlate}, w: number, h: number): vec3 {
    const s = cb.plate.size
    const p = cb.body.getTransform().getLocalPosition()
    return new vec3(p.x + s.x / 2 - w / 2 - 0.8, p.y + s.y / 2 - h / 2 - 0.2, p.z + 1.2)
  }

  /** The Library's own Hide / Show button, attached to the top-right corner of the Library's header. */
  private updateLibraryButtonPos(): void {
    if (!this.libBtn) return
    const cb = this.cardBodyOf(this.libraryCard.sceneObject)
    // The Library's Hide button belongs to its menu: it goes away while the menu is collapsed to its chip.
    this.libBtn.so.enabled = !!cb && this.libraryCard.isMenuVisible
    if (!cb || !cb.plate.size || cb.plate.size.x < 1) return
    this.libBtn.so.getTransform().setLocalPosition(this.headerCornerLocal(cb, 8.0, 3.6))
  }

  // ── Card placement for the Text size / Schematic options ──────────────────

  private setupPlacement(): void {
    for (const c of [this.jobPanel, this.stepCard, this.findingCard, this.summaryCard, this.cameraCard, this.optionsCard, this.notesCard, this.photoViewer]) {
      this.cardHosts.push({so: c.sceneObject, ui: c as any, built: 1, cap: 99, settle: 0})
    }
    const t = this.schematicPanel.sceneObject.getTransform()
    this.placed.push({so: this.schematicPanel.sceneObject, basePos: t.getLocalPosition(), baseScale: t.getLocalScale(), centered: false, bottom: true, width: this.schematicPanel.widthCm, factor: 1})
    this.setupMotion()
    this.createEvent("UpdateEvent").bind(() => this.updatePlacement())
  }

  // ── Motion: a card that opens (or swaps in) fades in and slides up a little over 0.2 s ──

  private motion: {so: SceneObject; fader: DisplayFader; open: boolean; t0: number; slide: boolean; base: vec3}[] = []

  private setupMotion(): void {
    const hosts: [SceneObject, boolean][] = [[this.safetyNotice.sceneObject, false], [this.libraryCard.sceneObject, false], [this.schematicPanel.sceneObject, false]]
    for (const h of this.cardHosts) hosts.push([h.so, true])
    for (const [so, slide] of hosts) {
      this.motion.push({so, fader: new DisplayFader(this, [so], null, 0.2), open: false, t0: -10, slide, base: so.getTransform().getLocalPosition()})
    }
  }

  /** Visible feedback for a press that has nothing new to show (the card is already open): the card fades in again. */
  private pulseCard(so: SceneObject): void {
    for (const m of this.motion) {
      if (m.so === so) {
        m.t0 = getTime()
        m.fader.fadeIn()
      }
    }
  }

  private updateMotion(): void {
    const now = getTime()
    for (const m of this.motion) {
      const open = !!this.cardBodyOf(m.so)
      if (open && !m.open) {
        m.open = true
        m.t0 = now
        m.fader.fadeIn()
      } else if (!open) m.open = false
      if (m.slide) {
        const k = Math.min(1, (now - m.t0) / 0.2)
        const lift = 1.2 * (1 - k) * (1 - k)
        m.so.getTransform().setLocalPosition(m.base.add(new vec3(0, -lift, 0)))
      }
    }
  }

  private cardBodyOf(host: SceneObject): {body: SceneObject; plate: BackPlate} | null {
    for (let i = 0; i < host.getChildrenCount(); i++) {
      const ch = host.getChild(i)
      if (!ch.enabled) continue
      const plate = ch.getComponent(BackPlate.getTypeName()) as BackPlate | null
      if (plate) return {body: ch, plate}
    }
    return null
  }

  /** Screen rect (0..1, y down) of a card body, or null before it has a size. */
  private screenRectOf(cam: Camera, cb: {body: SceneObject; plate: BackPlate}): {x0: number; x1: number; y0: number; y1: number} | null {
    const size = cb.plate.size
    if (!size || size.x < 1 || size.y < 1) return null
    const m = cb.body.getTransform().getWorldTransform()
    const r = {x0: 9, x1: -9, y0: 9, y1: -9}
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const sp = cam.worldSpaceToScreenSpace(m.multiplyPoint(new vec3((dx * size.x) / 2, (dy * size.y) / 2, 0)))
      r.x0 = Math.min(r.x0, sp.x)
      r.x1 = Math.max(r.x1, sp.x)
      r.y0 = Math.min(r.y0, sp.y)
      r.y1 = Math.max(r.y1, sp.y)
    }
    return r
  }

  /**
   * Text size: each card is rebuilt at the chosen text size factor with its width unchanged, so its text wraps and
   * the card grows downward; if the grown card would leave the bottom of the view, that card steps down to the next
   * smaller factor. Schematic: the schematic host is scaled, shrinking until it fits the view.
   */
  /** Labels: "This step only" shows just the current step's tags and wire number once a symptom is picked; otherwise all labels show. */
  private labelFocusKey = "?"
  private updateLabelFocus(): void {
    if (!this.partTags || !this.agent || !this.nl || !this.optionsCard) return
    const agent = this.agent as MWNPAgent
    const nl = this.nl as Netlist
    const ph = agent.phase
    let ids: string[] | null = null
    let wire: string | null = null
    const inStep = ph === "steps" || ph === "retest" || ph === "retest_wait" || ph === "finding"
    if (this.optionsCard.value("labels") === "This step only" && this.jobActive && inStep) {
      ids = []
      const p = ph === "finding" && agent.finding ? agent.finding.pointId : agent.activePoint() || agent.retestPointId
      if (p) ids.push(nl.baseId(p))
      const ref = nl.referencePoint()
      if (ref) ids.push(nl.baseId(ref))
      if (ph === "finding" && agent.finding) ids.push(agent.finding.id)
      if (ph === "retest_wait" && agent.functionKey) {
        const ctl = nl.controlOf(agent.functionKey)
        if (ctl) ids.push(ctl.component)
      }
      const wi = this.currentWireIndex()
      wire = wi >= 0 ? "WireLabel_" + nl.data.wires[wi].id + "_" + wi : ""
    }
    const key = JSON.stringify([ids, wire])
    if (key === this.labelFocusKey) return
    this.labelFocusKey = key
    this.partTags.setLabelFocus(ids, wire)
  }

  private updatePlacement(): void {
    this.updateMotion()
    this.updateLabelFocus()
    const camSO = this.findUserCamera()
    if (!camSO) return
    const cam = camSO.getComponent("Component.Camera") as Camera
    const steps = [1, 1.25, 1.5]
    for (const h of this.cardHosts) {
      const desired = Math.min(this.textFactor, h.cap)
      if (h.built !== desired) {
        setHostEmFactor(h.so.name, desired)
        h.built = desired
        h.settle = 0
        if (h.ui.built) h.ui.rebuild()
        continue
      }
      if (!h.so.isEnabledInHierarchy || h.built <= 1) continue
      h.settle++
      if (h.settle < 6) continue
      const cb = this.cardBodyOf(h.so)
      const r = cb ? this.screenRectOf(cam, cb) : null
      if (r && r.y1 > 0.97) {
        const lower = steps.filter((v) => v < h.built)
        h.cap = lower.length > 0 ? lower[lower.length - 1] : 1
      }
    }
    for (const h of this.placed) {
      if (!h.so.isEnabledInHierarchy) continue
      const cb = this.cardBodyOf(h.so)
      if (!cb) continue
      const target = this.schemFactor
      let f = target
      for (let it = 0; it < 3; it++) {
        this.applyFactor(h, f)
        const r = this.screenRectOf(cam, cb)
        if (!r) break
        const hgt = Math.max(1e-4, r.y1 - r.y0)
        const wid = Math.max(1e-4, r.x1 - r.x0)
        const cx = (r.x0 + r.x1) / 2
        // The schematic grows upward from its bottom edge and to the right from its left edge (clear of the Library menu).
        let lim = f * (h.bottom ? (r.y1 - 0.03) / hgt : (0.97 - r.y0) / hgt)
        lim = Math.min(lim, h.centered ? f * Math.min((0.97 - cx) / (wid / 2), (cx - 0.03) / (wid / 2)) : f * ((0.97 - r.x0) / wid))
        const nf = Math.max(1, Math.min(target, lim))
        if (Math.abs(nf - f) < 1e-3) break
        f = nf
      }
      this.applyFactor(h, f)
    }
    this.updateDisplayButtonPos()
    this.updateLibraryButtonPos()
  }

  private applyFactor(h: {so: SceneObject; basePos: vec3; baseScale: vec3; centered: boolean; width: number; factor: number}, f: number): void {
    h.factor = f
    setHostFactor(h.so.name, f)
    const t = h.so.getTransform()
    t.setLocalScale(h.baseScale.uniformScale(f))
    const shift = h.centered ? 0 : (h.baseScale.x * h.width * (f - 1)) / 2
    t.setLocalPosition(h.basePos.add(t.getLocalRotation().multiplyVec3(new vec3(1, 0, 0)).uniformScale(shift)))
  }

  private findingEvidenceShort(): string {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    const f = agent.finding
    if (!f) return ""
    const r = agent.readings.filter((x) => x.phase === "diagnose" && x.pointId === f.pointId && (x.cls === "open" || x.cls === "in_spec"))
    const last = r[r.length - 1]
    return last ? nl.fmtReading(last.value) + " V at " + nl.display(last.pointId) : ""
  }

  /** Updates step card text, active-point visuals, expected tag, tag states. */
  private refreshStep(): void {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    const ref = nl.referencePoint()
    this.updateSwitchControls()
    const prevActive = this.cabinet.activePointId
    if (prevActive) {
      const pc = nl.baseId(prevActive)
      this.partTags.setTagState(pc, nl.activePathComponents(agent.faultIndex).indexOf(pc) >= 0 ? "relevant" : "dim")
    }

    if (agent.phase === "retest_wait") {
      const fn = agent.functionKey
      const ctl = fn ? nl.controlOf(fn) : null
      const rp = agent.retestPointId
      this.cabinet.setActivePoint(null, null)
      this.partTags.hideExpected()
      this.stepCard.setStep(
        "Retest: flip " + (ctl ? ctl.component + " " + ctl.position : "the switch") + (fn ? " (" + fn + ")" : ""),
        rp ? "Then meter " + nl.display(rp) + " to " + ref + "." : "",
        "",
        ""
      )
      return
    }

    const pointId = agent.activePoint()
    if (!pointId) {
      this.cabinet.setActivePoint(null, null)
      this.partTags.hideExpected()
      return
    }
    const exp = nl.expectedText(pointId)
    const range = nl.rangeText(pointId)
    let title: string
    let question: string
    if (agent.phase === "retest") {
      title = "Retest: meter " + nl.display(pointId) + " to " + ref
      const s = agent.steps.filter((x) => x.pointId === pointId && !x.isLoadOffCheck)[0]
      question = s ? this.humanize(s.question) : ""
    } else {
      const step = agent.currentStep()
      title = "Step " + (agent.stepIndex + 1) + " of " + agent.steps.length + ": meter " + nl.display(pointId) + " to " + ref
      question = step ? this.humanize(step.question) : ""
    }
    this.stepCard.setStep(
      title,
      question,
      nl.stepCitation(pointId),
      exp ? exp + (range ? "\nrange " + range : "") : "No tolerance defined in the job files."
    )
    this.cabinet.setActivePoint(pointId, ref)
    this.partTags.setTagState(nl.baseId(pointId), "active")
    if (exp) this.partTags.showExpected(pointId, this.cabinet.getExpectedTagPos(pointId), exp)
    else this.partTags.hideExpected()
    if (this.schematicPanel.isOpen) this.schematicPanel.highlight(this.currentWireId())
  }

  private applyTrace(): void {
    const agent = this.agent as MWNPAgent
    this.cabinet.setFocusWire(this.currentWireIndex())
    this.cabinet.hideTraces()
    for (const k of Object.keys(agent.wireStates)) this.cabinet.setTrace(parseInt(k), agent.wireStates[parseInt(k)])
  }

  private updateLamps(): void {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    for (const fn of nl.functionKeys()) {
      const ctl = nl.controlOf(fn)
      const f = nl.data.functions[fn]
      const inPosition = !!ctl && this.cabinet.s1Position === ctl.position
      const broken = fn === this.simulatedFaultFunction && !agent.repaired && !(agent.phase === "retest" || agent.phase === "retest_wait")
      this.cabinet.setLamp(f.load, inPosition && !broken)
    }
  }

  /** Netlist index of the wire the current step measures (into the active point, else out of it); -1 if none. */
  private currentWireIndex(): number {
    if (this.highlightIdx >= 0) return this.highlightIdx // a wire asked for by voice
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    const p = agent.activePoint() || agent.retestPointId
    if (!p) return -1
    const into = nl.wireInto(p)
    return into >= 0 ? into : nl.wireOutOf(p)
  }

  private currentWireId(): string {
    const i = this.currentWireIndex()
    return i >= 0 ? (this.nl as Netlist).data.wires[i].id : ""
  }

  /** "F1:OUT" -> "F1 OUT" inside free text from the file. */
  private humanize(text: string): string {
    const nl = this.nl as Netlist
    return text.replace(/\b([A-Z]+[0-9A-Z\-]*):(IN|OUT|COM|UP|DOWN|\+|-)/g, (m) => nl.display(m))
  }

  private click(): void {
    this.play(this.clickSfx)
  }

  private play(track: AudioTrackAsset): void {
    if (!this.audio || !track) return
    // Sound is optional feedback: some previews throw "Audio player is not enabled".
    // Never let it abort a UI handler (click() runs first in every handler).
    try {
      this.audio.stop(false)
      this.audio.audioTrack = track
      this.audio.volume = this.sfxVolume
      this.audio.play(1)
    } catch (e) {
      if (!this.audioWarned) print("[MWNP] audio unavailable, continuing without sound: " + e)
      this.audioWarned = true
    }
  }

  private audioWarned = false

  private log(event: string): void {
    print("[MWNP] " + event + " " + JSON.stringify(this.getState()))
  }

  // ── Test surface ──────────────────────────────────────────────────────────

  /** Plain snapshot of everything the done-criteria tests assert on. */
  getState(): any {
    const agent = this.agent
    const nl = this.nl
    if (!agent || !nl || !this.initialized) return {initialized: false}
    return {
      initialized: true,
      phase: agent.phase,
      visibleCard: this.visibleCard,
      symptom: agent.faultIndex >= 0 ? nl.symptomLabel(agent.faultIndex) : "",
      stepIndex: agent.stepIndex,
      stepCount: agent.steps.length,
      activePoint: agent.activePoint() || "",
      entry: agent.entry,
      stepColor: agent.stepColor,
      lastResultColor: this.lastResultColor,
      lastMessage: this.lastMessage,
      stepTitle: this.stepCard.stepTitleText,
      stepResult: this.stepCard.resultText,
      readout: this.stepCard.readoutText,
      expectedTag: {point: this.partTags.expectedPointId, text: this.partTags.expectedText},
      badges: this.partTags.badgeTexts,
      outlines: this.cabinet.outlineStates,
      traces: this.cabinet.traceStates,
      lamps: this.cabinet.lampLit,
      s1: this.cabinet.s1Position,
      finding: agent.finding ? {part: agent.finding.id, head: agent.finding.head} : null,
      findingCard: {title: this.findingCard.titleText, evidence: this.findingCard.evidenceText, nextAction: this.findingCard.nextActionText},
      readings: agent.readings.map((r) => ({point: r.pointId, value: r.value, range: r.range, time: r.time, cls: r.cls, phase: r.phase})),
      captures: this.captures.map((c) => ({id: c.id, pointId: c.pointId, kind: c.kind, time: c.time, hasTexture: !!c.texture, placeholder: c.placeholder})),
      cameraCardOpen: this.cameraCard.isVisible,
      reportCaptureIds: this.summaryCard.captureIds,
      reportTab: this.summaryCard.tab,
      reportPage: this.summaryCard.page,
      reportPages: this.summaryCard.pageCount,
      summaryRows: this.summaryCard.rowTexts,
      summaryFinding: this.summaryCard.findingText,
      summaryResult: this.summaryCard.resultText,
      repaired: agent.repaired,
      tagInfo: this.lastTagInfo,
      schematicOpen: this.schematicPanel.isOpen,
      display: {
        hidden: this.displayHidden,
        alpha: this.fader ? this.fader.alpha : 1,
        fading: (!!this.fader && this.fader.isFading) || (!!this.labelsFader && this.labelsFader.isFading),
        labelsHidden: !!this.labelsFader && this.labelsFader.hidden,
        labelsAlpha: this.labelsFader ? this.labelsFader.alpha : 1,
      },
      options: {
        labels: this.optionsCard.value("labels"),
        hideButton: this.optionsCard.value("hideButton"),
        cardStyle: this.optionsCard.value("cardStyle"),
        textSize: this.optionsCard.value("textSize"),
        schematic: this.optionsCard.value("schematic"),
        textFactor: this.textFactor,
        schematicFactor: this.schemFactor,
        appliedFactors: this.cardHosts.map((h) => ({card: h.so.name, factor: h.built})).concat(this.placed.map((h) => ({card: h.so.name, factor: +h.factor.toFixed(3)}))),
      },
      flowCard: this.flowCard,
      libraryOpen: this.libraryCard.isVisible,
      notes: this.notes.map((n) => ({time: n.time, source: n.source, text: n.text})),
      jobEnded: this.jobEnded,
      jobLog: this.jobLog,
      endTime: this.endTime,
      previousJobs: this.previousJobs.map((p) => ({name: p.name, result: p.result, endTime: p.endTime, status: p.status, label: p.label})),
      jobActive: this.jobActive,
      viewingPrevious: this.viewingPrevious,
      notesPlaceholders: this.notes.filter((n) => n.placeholder).length,
      notesView: this.notesCard.view,
      viewer: {
        open: this.visibleCard === "viewer",
        id: this.viewerId,
        index: this.captures.map((c) => c.id).indexOf(this.viewerId),
        count: this.captures.length,
        confirm: this.viewerConfirm,
        previousJob: this.viewerPrevJob,
        returnTo: this.viewerReturn,
      },
      libraryHidden: this.libHiddenFlag,
      libraryAlpha: this.libFader ? this.libFader.alpha : 1,
      libraryFading: !!this.libFader && this.libFader.isFading,
      switchRow: this.stepCard.switchRowVisible,
      schematicWire: this.schematicPanel.highlightedWire,
      savedToJobLog: this.savedToJobLog,
      reasoning: agent.faultIndex >= 0 ? nl.reasoning(agent.faultIndex) + " " + nl.pathChain(agent.faultIndex) : "",
      pathCitation: agent.faultIndex >= 0 ? nl.pathCitation(agent.faultIndex) : "",
      openThresholdV: nl.openThreshold(),
    }
  }
}
