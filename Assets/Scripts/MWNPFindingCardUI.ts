// MWNPFindingCardUI.ts — Finding card (replaces the step card when a part is flagged).
//
// Owns: finding headline (the largest text on the card), evidence + citation, next-action text,
// retest button. Text is sized in real centimetres (textEmCm, default 1.0 cm; headlineEmCm, default
// 1.8 cm), every cell is sized to its words, and the card grows DOWNWARD from its host's origin:
// the host sits at the card's top-center (same spot as the step card).
// API: show(title, evidence, nextAction, buttonLabel, headline?, eyebrow?), showVerify(headline, evidence, yesLabel, noLabel), hide(), readable fields, onRetest, onFixed(yes).
// Must not: compose the finding — Main builds every string from netlist.json.
// Test handles: "Btn_Retest" (label "Fuse replaced: retest" for a fuse finding), "FindingTitle" (headline),
//               "Btn_FixedYes", "Btn_FixedNo" (the verify question),
//               "FindingEyebrow", "FindingEvidence", "NextActionHeading", "NextAction", "FindingCardCard".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {addButton, addCardHeader, addFitText, BEST_TARGET_CM, cardEm, COLOR, deferDestroy, makeCardBody, realToLocal, TEXT_BODY, TEXT_SOFT} from "./MWNPSharedUI"

@component
export class MWNPFindingCardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Finding Card – flagged part and next action</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(26, 40, 0.5))
  @hint("Card width in card units (cm before scaling)")
  widthCm: number = 32
  @input
  @widget(new SliderWidget(0.6, 2.0, 0.05))
  @hint("Card text size: em height in real cm (1.0 reads in a 1080p recording)")
  textEmCm: number = 1.0
  @input
  @widget(new SliderWidget(1.0, 3.0, 0.05))
  @hint("Headline (\"F1 open\") text size: em height in real cm; keep it the largest text on the card")
  headlineEmCm: number = 1.8
  @input
  @hint("Heading above the next-action text")
  nextActionHeading: string = "Next action"
  @ui.group_end

  titleText: string = ""
  evidenceText: string = ""
  nextActionText: string = ""
  headlineText: string = ""
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }

  private body: SceneObject | null = null
  private lastArgs: [string, string, string, string, string, string] | null = null
  private lastVerify: [string, string, string, string] | null = null
  private _onFixed = new Event<boolean>()
  /** "Problem solved?": true = Yes, fixed; false = No, still faulty. */
  get onFixed(): PublicApi<boolean> {
    return this._onFixed.publicApi()
  }
  private _onRetest = new Event<void>()
  get onRetest(): PublicApi<void> {
    return this._onRetest.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  /**
   * `title` is the full statement ("Finding: F1 open."), kept as readable state. `headline` ("F1 open") is
   * shown big; `eyebrow` ("Finding") is the small line above it.
   */
  show(title: string, evidence: string, nextAction: string, buttonLabel: string, headline: string = title, eyebrow: string = ""): void {
    this.hide()
    this.lastArgs = [title, evidence, nextAction, buttonLabel, headline, eyebrow]
    this.titleText = title
    this.evidenceText = evidence
    this.nextActionText = nextAction
    this.headlineText = headline
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const big = cardEm(this.sceneObject, Math.max(this.headlineEmCm, this.textEmCm * 1.5))
    const card = makeCardBody(this.sceneObject, "FindingCardCard", w, 1.4, 0.6, "top")
    this.body = card.body
    const c = card.content
    if (eyebrow) addCardHeader(c, "FindingEyebrow", eyebrow, inner, this.sceneObject)
    addFitText(c, "FindingTitle", headline, inner, big, {color: COLOR.red, bold: true})
    addFitText(c, "FindingEvidence", evidence, inner, em, {color: TEXT_BODY})
    addFitText(c, "NextActionHeading", this.nextActionHeading, inner, em, {color: COLOR.amber, bold: true})
    addFitText(c, "NextAction", nextAction, inner, em, {color: TEXT_BODY})
    addButton(c, "Btn_Retest", buttonLabel, inner - 4, 3.6, () => this._onRetest.invoke(), {emCm: em, primary: true})
  }

  /**
   * "Problem solved?" — shown after the retest reading is in spec: the headline, what was verified, and two big buttons
   * (Btn_FixedYes / Btn_FixedNo). Replaces the finding in the same card slot.
   */
  showVerify(headline: string, evidence: string, yesLabel: string, noLabel: string): void {
    this.hide()
    this.lastVerify = [headline, evidence, yesLabel, noLabel]
    this.lastArgs = null
    this.titleText = headline
    this.evidenceText = evidence
    this.nextActionText = ""
    this.headlineText = headline
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const big = cardEm(this.sceneObject, Math.max(this.headlineEmCm, this.textEmCm * 1.5))
    const card = makeCardBody(this.sceneObject, "FindingCardCard", w, 1.4, 0.6, "top")
    this.body = card.body
    const c = card.content
    addCardHeader(c, "VerifyEyebrow", "Verify the fix", inner, this.sceneObject)
    addFitText(c, "FindingTitle", headline, inner, big, {color: COLOR.amber, bold: true})
    addFitText(c, "FindingEvidence", evidence, inner, em, {color: TEXT_BODY})
    const bh = realToLocal(this.sceneObject, BEST_TARGET_CM)
    addButton(c, "Btn_FixedYes", yesLabel, inner - 4, bh, () => this._onFixed.invoke(true), {emCm: em * 1.2, primary: true, bold: true})
    addButton(c, "Btn_FixedNo", noLabel, inner - 4, bh, () => this._onFixed.invoke(false), {emCm: em * 1.2, bold: true})
  }

  get built(): boolean {
    return !!this.body
  }

  /** Rebuilds at the current Text size factor, keeping visibility. */
  rebuild(): void {
    if (!this.body || (!this.lastArgs && !this.lastVerify)) return
    const vis = this.body.enabled
    if (this.lastArgs) this.show(...this.lastArgs)
    else if (this.lastVerify) this.showVerify(...this.lastVerify)
    if (this.body) (this.body as SceneObject).enabled = vis
  }

  setVisible(v: boolean): void {
    if (this.body) this.body.enabled = v
  }

  hide(): void {
    if (this.body) {
      deferDestroy(this, this.body)
      this.body = null
    }
  }
}
