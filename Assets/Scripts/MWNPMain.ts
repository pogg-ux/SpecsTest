// MWNPMain.ts — orchestrator for the MWNP No-Guess Field Assistant.
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
import {MWNPAgent} from "./MWNPAgent"
import {MWNPCabinet} from "./MWNPCabinet"
import {MWNPPartTagsUI} from "./MWNPPartTagsUI"
import {MWNPSafetyNoticeUI} from "./MWNPSafetyNoticeUI"
import {MWNPJobPanelUI} from "./MWNPJobPanelUI"
import {MWNPStepCardUI} from "./MWNPStepCardUI"
import {MWNPFindingCardUI} from "./MWNPFindingCardUI"
import {MWNPSummaryUI, SummaryRow, ReportCapture} from "./MWNPSummaryUI"
import {MWNPCameraCardUI} from "./MWNPCameraCardUI"
const ICON_HIDE = requireAsset("../Icons/visibility_off.png") as Texture
const ICON_SHOW = requireAsset("../Icons/visibility.png") as Texture
import {MWNPLibraryCardUI} from "./MWNPLibraryCardUI"
import {MWNPOptionsCardUI, OptionChange} from "./MWNPOptionsCardUI"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Capture, PHOTO_PLACEHOLDER, SnapshotCamera, takePhoto} from "./MWNPCapture"
import {MWNPSchematicPanelUI} from "./MWNPSchematicPanelUI"
import {DisplayFader} from "./MWNPDisplayFader"
import {addButton, ButtonHandle, cardEm, makeObj, setCardOpaque, setHostEmFactor, setHostFactor} from "./MWNPSharedUI"

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

@component
export class MWNPMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Field Assistant – rule-based agent driven by netlist.json</span>')
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
    this.updateDisplayButtonPos()
  }
  private cameraReturn = "home"
  /** Screen offset (fraction of the view) of the menu's top-left from the cabinet's top-left corner. */
  libraryDock = new vec2(-0.03, -0.115)
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

    const missing = ["cabinet", "partTags", "safetyNotice", "jobPanel", "stepCard", "findingCard", "summaryCard", "schematicPanel", "cameraCard", "libraryCard", "optionsCard"].filter(
      (k) => !(this as any)[k]
    )
    if (missing.length > 0 || !this.nl) {
      print("[MWNP] ERROR: missing inputs: " + missing.join(", "))
      return
    }
    const nl = this.nl
    this.cabinet.build(nl)
    this.partTags.build(this.cabinet.getTagAnchors(), this.cabinet.getWireLabels(), this.cabinet.getBoardNote())

    this.safetyNotice.onDismiss.add(() => this.onDismissNotice())
    this.jobPanel.onReportSymptom.add(() => this.onReportSymptom())
    this.jobPanel.onSymptomPicked.add((i) => this.onSymptomPicked(i))
    this.stepCard.onKey.add((k) => this.onKey(k))
    this.stepCard.onEnter.add(() => this.onEnter())
    this.stepCard.onSchematic.add(() => this.onSchematic())
    this.stepCard.onCamera.add(() => this.openCamera())
    this.libraryCard.onPick.add((k) => this.onLibraryPick(k))
    this.optionsCard.onChange.add((c) => this.onOptionChange(c))
    this.cameraCard.onClose.add(() => this.closeCamera())
    this.cameraCard.onSnapshot.add(() => this.onSnapshot())
    this.cameraCard.onPhoto.add(() => this.onPhoto())
    this.findingCard.onRetest.add(() => this.onRetest())
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
    this.jobPanel.showJob("Job: " + nl.data.machine + " " + nl.machineKind(), this.filesLoadedText)
    this.jobPanel.setVisible(false)
    this.flowCard = "job"
    // The Library menu is docked (expanded) in the upper left; no other card is open until the user picks one.
    this.dockLibrary()
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
    const agent = this.agent as MWNPAgent
    if (agent.phase !== "steps" && agent.phase !== "retest" && agent.phase !== "retest_wait") return
    this.click()
    const e = agent.key(k)
    this.stepCard.setReadout((e.length > 0 ? e : "—") + " V")
  }

  private onEnter(): void {
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
      this.log("enter-blocked")
      return
    }
    const pointId = agent.activePoint()
    const res = agent.enter(clock())
    if (!res.accepted || !res.cls) {
      this.click()
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
    }
    this.log("enter " + res.pointId + " " + v + " " + res.cls)
  }

  private onSchematic(): void {
    this.click()
    this.schematicPanel.toggle(this.currentWireId())
    this.log("schematic " + (this.schematicPanel.isOpen ? "open" : "closed"))
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
    this.visibleCard = "home"
  }

  /** Shows a view again as it was left ("home" = no card). */
  private showView(v: string): void {
    if (v === "report") {
      this.buildReport(false)
    } else if (v === "options") {
      this.optionsCard.show()
      this.visibleCard = "options"
    } else if (v === "home") {
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
      if (v === this.flowCard) return
      this.hideOpenCard()
      this.resumeFlow()
    } else if (key === "report") {
      if (v === "report" || v === "summary") return
      this.hideOpenCard()
      if (this.flowCard === "summary") this.resumeFlow()
      else this.buildReport(false)
    } else if (key === "camera") {
      if (v === "camera") return
      this.hideOpenCard()
      this.openCameraCard(v)
    } else if (key === "options") {
      if (v === "options") return
      this.hideOpenCard()
      this.optionsCard.show()
      this.visibleCard = "options"
    }
    this.log("library-pick " + key)
  }

  /**
   * Docks the Library at the upper left: its top-left corner sits just above and left of the cabinet's top-left
   * corner as seen from the user's eye, on the same plane and tilt as the other cards. The menu is a child of the
   * assistant root (outside the UI root), so the main Hide never fades it.
   */
  private dockLibrary(): void {
    const camSO = this.findUserCamera()
    const trainer = this.cabinet.sceneObject
    if (!camSO) return
    const cam = camSO.getComponent("Component.Camera") as Camera
    const half = this.cabinet.getBoardHalfSize()
    const corner = cam.worldSpaceToScreenSpace(trainer.getTransform().getWorldTransform().multiplyPoint(new vec3(-half.x, half.y, 0)))
    const ct = camSO.getTransform()
    const stepT = this.stepCard.sceneObject.getTransform()
    const depth = Math.max(10, stepT.getWorldPosition().distance(ct.getWorldPosition()))
    const tl = cam.screenSpaceToWorldSpace(new vec2(corner.x + this.libraryDock.x, corner.y + this.libraryDock.y), depth)
    const hostT = this.libraryCard.sceneObject.getTransform()
    hostT.setWorldRotation(stepT.getWorldRotation())
    const right = stepT.right
    const wScale = hostT.getWorldScale().x
    hostT.setWorldPosition(tl.add(right.uniformScale((this.libraryCard.menuWidth * wScale) / 2)))
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
    this.libFader = new DisplayFader(this, [this.libraryCard.sceneObject], null)
  }

  private onLibraryToggle(): void {
    this.click()
    this.setLibraryHidden(!this.libHiddenFlag)
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
      if (c) this.cameraCard.setThumbnail(c.texture, c.aspect, c.placeholder)
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
    return this.hiddenFlag && (this.optionsCard.value("hideButton") === "Everything" || this.optionsCard.value("labels") === "Hide with cards")
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
    this.fader = new DisplayFader(this, [host.getParent() as SceneObject], null)
    this.labelsFader = new DisplayFader(this, [this.partTags.sceneObject], this.cabinet)
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

  private onSave(): void {
    this.click()
    const agent = this.agent as MWNPAgent
    this.jobLog.push(JSON.stringify({readings: agent.readings, finding: agent.finding, repaired: agent.repaired, captures: this.captures.map((c) => ({id: c.id, point: c.pointId, kind: c.kind, time: c.time, image: !!c.texture}))}))
    this.savedToJobLog = true
    this.summaryCard.setSaved("Saved to job log " + CHECK)
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
    this.log("retest-passed")
    const ev = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    ev.bind(() => this.showSummary())
    ev.reset(this.summaryDelaySec)
  }

  private showSummary(): void {
    const agent = this.agent as MWNPAgent
    agent.phase = "summary"
    this.stepCard.hide()
    this.schematicPanel.close()
    this.buildReport(true)
  }

  /** The Job report: final at the end of the job, partial (readings so far) when opened from the Library. */
  private buildReport(final: boolean): void {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    // A final report that arrives while the Library / Camera / Options is open waits, hidden, for the Job button.
    const away = final && (this.visibleCard === "home" || this.visibleCard === "camera" || this.visibleCard === "options")
    if (final && this.visibleCard === "camera") this.cameraCard.hide()
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
    const captures: ReportCapture[] = this.captures.map((c) => ({id: c.id, pointId: c.pointId, caption: c.caption, texture: c.texture, aspect: c.aspect}))
    const f = agent.finding
    const comp = f && f.kind === "component" ? nl.component(f.id) : null
    const rating = comp ? nl.shortRating(comp.id) : null
    const action = !final ? "Action taken: none yet." : comp && comp.type === "fuse" ? "Action taken: replaced " + comp.id + " with " + rating + "." : "Action taken: repaired — " + (f ? this.humanize(f.conclusion) : "")
    const fn = agent.functionKey
    this.summaryCard.show({
      title: "Job report",
      jobLine: "Job: " + nl.data.machine + " " + nl.machineKind() + " · rev " + (nl.data.revision || "-"),
      symptomLine: "Symptom: " + (agent.faultIndex >= 0 ? nl.symptomLabel(agent.faultIndex) : "not reported yet"),
      readingsHeading: "Readings (meter black lead on " + nl.referencePoint() + ")",
      rows,
      captures,
      findingLine: f ? "Finding: " + f.head + " (" + this.findingEvidenceShort() + ")" : "Finding: none",
      actionLine: action,
      resultLine: !final ? "Result: in progress" : "Result: " + (fn ? fn + " restored" : "restored"),
      saveLabel: "Save to job log",
    })
    if (away) {
      this.summaryCard.setVisible(false)
      this.flowCard = "summary"
    } else this.visibleCard = final ? "summary" : "report"
    this.log(final ? "summary" : "report")
  }

  /** The Job report is taller than the step card, so the Hide / Show button moves to the report's top-left outside edge. */
  private updateDisplayButtonPos(): void {
    if (!this.displayBtn || !this.displayBtnBase) return
    const t = this.displayBtn.so.getTransform()
    if (this._visible === "summary" || this._visible === "report") {
      const host = this.summaryCard.sceneObject.getTransform().getWorldTransform()
      const w = 8.0
      const h = 3.6
      const local = new vec3(-(this.summaryCard.widthCm / 2 + w / 2 + 0.5), -h / 2, 0)
      t.setWorldPosition(host.multiplyPoint(local))
    } else {
      t.setLocalPosition(this.displayBtnBase)
    }
  }

  // ── Card placement for the Text size / Schematic options ──────────────────

  private setupPlacement(): void {
    for (const c of [this.jobPanel, this.stepCard, this.findingCard, this.summaryCard, this.cameraCard, this.optionsCard]) {
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
  private updatePlacement(): void {
    this.updateMotion()
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

  private currentWireId(): string {
    const nl = this.nl as Netlist
    const agent = this.agent as MWNPAgent
    const p = agent.activePoint() || agent.retestPointId
    if (!p) return ""
    const into = nl.wireInto(p)
    if (into >= 0) return nl.data.wires[into].id
    const out = nl.wireOutOf(p)
    return out >= 0 ? nl.data.wires[out].id : ""
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
