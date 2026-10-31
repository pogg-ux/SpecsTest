// MWNPFindingCardUI.ts — Finding card (replaces the step card when a part is flagged).
//
// Owns: finding headline, evidence + citation line, next-action text, retest button.
// API: show(title, evidence, nextAction, buttonLabel), hide(), readable fields, onRetest.
// Must not: compose the finding — Main builds every string from netlist.json.
// Test handle: "Btn_Retest" (label "Fuse replaced: retest" for a fuse finding).

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {addButton, addText, COLOR, deferDestroy, makeCardBody} from "./MWNPSharedUI"

@component
export class MWNPFindingCardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Finding Card – flagged part and next action</span>')
  @ui.separator
  @ui.group_start("Settings")
  @input
  @widget(new SliderWidget(26, 40, 0.5))
  @hint("Card width in cm")
  widthCm: number = 30
  @input
  @hint("Heading above the next-action text")
  nextActionHeading: string = "Next action"
  @ui.group_end

  titleText: string = ""
  evidenceText: string = ""
  nextActionText: string = ""
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }

  private body: SceneObject | null = null
  private _onRetest = new Event<void>()
  get onRetest(): PublicApi<void> {
    return this._onRetest.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
  }

  show(title: string, evidence: string, nextAction: string, buttonLabel: string): void {
    this.hide()
    this.titleText = title
    this.evidenceText = evidence
    this.nextActionText = nextAction
    const w = this.widthCm
    const inner = w - 3.2
    const card = makeCardBody(this.sceneObject, "FindingCardCard", w, 1.6, 0.8)
    this.body = card.body
    addText(card.content, "FindingTitle", title, inner, 2.4, {role: "Headline2", color: COLOR.red})
    addText(card.content, "FindingEvidence", evidence, inner, 3.6, {role: "Body", wrap: true})
    addText(card.content, "NextActionHeading", this.nextActionHeading, inner, 1.6, {role: "Subheadline", color: COLOR.amber})
    addText(card.content, "NextAction", nextAction, inner, 5.6, {role: "Body", wrap: true})
    addButton(card.content, "Btn_Retest", buttonLabel, 18, 3.4, () => this._onRetest.invoke())
  }

  hide(): void {
    if (this.body) {
      deferDestroy(this, this.body)
      this.body = null
    }
  }
}
