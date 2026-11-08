// MWNPNotesCardUI.ts — the Notes card: time-stamped notes, newest first, and a way to add one.
//
// Owns: the card (same spot and style as the other cards), the notes list (newest first, "Agent" notes marked), the
// "Add note" quick picks and the free-text "Other" entry.
//   Free text: on the glasses "Other" opens the system keyboard. In the editor Preview the keyboard system is not
//   available, so "Other" listens to the computer keyboard through key-press events (letters, digits, space, backspace)
//   and "Add note" commits what was typed. If nothing was typed (no text entry reached the Lens), "Add note" adds the
//   placeholder note "Other — (type on device)" and says so; a placeholder note has an "Edit" button that reopens the
//   entry to replace its text.
// Holds no job state: Main owns the notes and the job.
// API: show(notes), setNotes(notes), hide(), built, rebuild(), view, events onNote({text, placeholder}), onEdit({id, text}).
// Test handles: "Btn_AddNote", quick picks "Btn_QuickNote_<n>", "Btn_OtherNote", "Btn_OtherAdd", "Btn_NoteCancel",
//               "Btn_EditNote_<n>", texts "OtherText", "OtherStatus", card "NotesCardCard", rows "NoteMeta_<n>" / "NoteText_<n>".

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {addButton, addCardHeader, addFitText, cardEm, deferDestroy, makeCardBody, TEXT_BODY, TEXT_SOFT} from "./MWNPSharedUI"

export interface Note {
  id: number
  time: string
  /** "Agent" for notes the assistant wrote, "You" for the technician's. */
  source: string
  text: string
  /** True for the "Other — (type on device)" placeholder, which can be edited on the glasses. */
  placeholder?: boolean
}

export const QUICK_NOTES = [
  "Customer reported intermittent fault",
  "Loose terminal tightened",
  "Fuse replaced",
  "Wiring damage found",
  "Follow-up needed",
]

export const PLACEHOLDER_NOTE = "Other — (type on device)"

const MAX_SHOWN = 5

const KEY_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const DIGIT_NAMES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]

@component
export class MWNPNotesCardUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MWNP Notes Card – time-stamped notes, add a note</span>')
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
  @ui.group_end

  /** "list" | "pick" | "other" | "dictate" — readable by tests. */
  view: string = "list"
  /** The free text typed so far in the "other" view. */
  typed: string = ""
  statusText: string = ""
  get isVisible(): boolean {
    return !!this.body && this.body.enabled
  }
  get built(): boolean {
    return !!this.body
  }

  private body: SceneObject | null = null
  private notes: Note[] = []
  private editingId = -1
  private tOther: Text | null = null
  private tStatus: Text | null = null
  private keysBound = false
  private _onNote = new Event<{text: string; placeholder: boolean}>()
  private _onEdit = new Event<{id: number; text: string}>()
  private _onDictate = new Event<string>()
  /** "Save note" on the dictated-text view. */
  get onDictate(): PublicApi<string> {
    return this._onDictate.publicApi()
  }
  /** The dictated text shown on the "dictate" view. */
  dictated: string = ""
  get onNote(): PublicApi<{text: string; placeholder: boolean}> {
    return this._onNote.publicApi()
  }
  get onEdit(): PublicApi<{id: number; text: string}> {
    return this._onEdit.publicApi()
  }

  onAwake() {
    this.sceneObject.createComponent("Component.Canvas")
    // Preview text entry: computer-keyboard key presses, used only while the "other" view is open.
    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => this.onKey(e.key))
    this.keysBound = true
  }

  show(notes: Note[]): void {
    this.notes = notes
    this.view = "list"
    this.build()
    ;(this.body as SceneObject).enabled = true
  }

  setNotes(notes: Note[]): void {
    this.notes = notes
    if (this.body && this.view === "list") this.rebuild()
  }

  hide(): void {
    if (this.body) this.body.enabled = false
  }

  /** Rebuilds the current view (new notes, Text size), keeping visibility. */
  rebuild(): void {
    if (!this.body) return
    const vis = this.body.enabled
    this.build()
    ;(this.body as SceneObject).enabled = vis
  }

  private build(): void {
    if (this.body) deferDestroy(this, this.body)
    this.tOther = null
    this.tStatus = null
    const w = this.widthCm
    const inner = w - 2.8
    const em = cardEm(this.sceneObject, this.textEmCm)
    const card = makeCardBody(this.sceneObject, "NotesCardCard", w, 1.4, 0.8, "top")
    this.body = card.body
    const c = card.content
    if (this.view === "pick") {
      addCardHeader(c, "NotesTitle", "Add note", inner, this.sceneObject)
      QUICK_NOTES.forEach((q, i) => addButton(c, "Btn_QuickNote_" + i, q, inner - 2, 3.6, () => this.choose(q), {emCm: em}))
      addButton(c, "Btn_OtherNote", "Other", inner - 2, 3.6, () => this.openOther(-1), {emCm: em, primary: true})
      addButton(c, "Btn_NoteCancel", "Cancel", inner - 2, 3.6, () => this.setView("list"), {emCm: em})
      return
    }
    if (this.view === "dictate") {
      addCardHeader(c, "NotesTitle", "Dictated note", inner, this.sceneObject)
      addFitText(c, "DictatedText", this.dictated, inner, em, {color: TEXT_BODY})
      addFitText(c, "DictatedHint", "Say \"save note\" or \"cancel\". Say \"note ...\" again to replace the text.", inner, em, {color: TEXT_SOFT})
      addButton(c, "Btn_DictSave", "Save note", inner - 2, 3.6, () => this.saveDictation(), {emCm: em, primary: true})
      addButton(c, "Btn_DictCancel", "Cancel", inner - 2, 3.6, () => this.cancel(), {emCm: em})
      return
    }
    if (this.view === "other") {
      addCardHeader(c, "NotesTitle", this.editingId >= 0 ? "Edit note" : "Other note", inner, this.sceneObject)
      this.tOther = addFitText(c, "OtherText", this.typed.length > 0 ? this.typed + "_" : "_", inner, em, {color: TEXT_BODY})
      this.tStatus = addFitText(c, "OtherStatus", this.statusText, inner, em, {color: TEXT_SOFT, minLines: 0})
      addButton(c, "Btn_OtherAdd", this.editingId >= 0 ? "Save note" : "Add note", inner - 2, 3.6, () => this.commitOther(), {emCm: em, primary: true})
      addButton(c, "Btn_NoteCancel", "Cancel", inner - 2, 3.6, () => this.cancelOther(), {emCm: em})
      return
    }
    addCardHeader(c, "NotesTitle", "Notes", inner, this.sceneObject)
    addButton(c, "Btn_AddNote", "Add note", inner - 2, 3.6, () => this.openPick(), {emCm: em, primary: true})
    if (this.listStatus) addFitText(c, "NoteStatus", this.listStatus, inner, em, {color: TEXT_SOFT})
    const shown = this.notes.slice(0, MAX_SHOWN)
    if (shown.length === 0) addFitText(c, "NoteEmpty", "No notes yet.", inner, em, {color: TEXT_SOFT})
    shown.forEach((n, i) => {
      addFitText(c, "NoteMeta_" + i, n.time + " · " + n.source, inner, em, {color: TEXT_SOFT})
      addFitText(c, "NoteText_" + i, n.text, inner, em, {color: TEXT_BODY})
      if (n.placeholder) addButton(c, "Btn_EditNote_" + i, "Edit note", inner - 12, 3.0, () => this.openOther(n.id), {emCm: em})
    })
    if (this.notes.length > MAX_SHOWN) addFitText(c, "NoteMore", "+" + (this.notes.length - MAX_SHOWN) + " older notes are in the Job report.", inner, em, {color: TEXT_SOFT})
  }

  private listStatus = ""

  private openPick(): void {
    this.listStatus = ""
    this.setView("pick")
  }

  private setView(v: string): void {
    this.view = v
    this.rebuild()
  }

  private choose(text: string): void {
    this.view = "list"
    this._onNote.invoke({text, placeholder: false})
  }

  private onDevice(): boolean {
    return !global.deviceInfoSystem.isEditor()
  }

  /** Opens the free-text entry (editing the note `id`, or a new one when id < 0). */
  private openOther(id: number): void {
    this.editingId = id
    this.typed = ""
    this.statusText = this.onDevice() ? "Type with the keyboard, then press Done." : "Type on your keyboard (letters, digits, space, backspace), then press Add note."
    this.view = "other"
    this.rebuild()
    if (this.onDevice()) this.openKeyboard()
  }

  /** Voice dictation: shows the text with Save note / Cancel. Called again, it replaces the text. */
  showDictation(text: string): void {
    this.dictated = text
    this.view = "dictate"
    this.rebuild()
  }

  /** Saves the dictated text (button or voice). False when there is nothing to save. */
  saveDictation(): boolean {
    if (this.view !== "dictate" || this.dictated.trim().length === 0) return false
    const t = this.dictated
    this.dictated = ""
    this.view = "list"
    this.rebuild()
    this._onDictate.invoke(t)
    return true
  }

  /** Voice "cancel": leaves the pick / other view without adding anything. Returns false when there is nothing to cancel. */
  cancel(): boolean {
    if (this.view === "other") this.cancelOther()
    else if (this.view === "dictate") {
      this.dictated = ""
      this.setView("list")
    }
    else if (this.view === "pick") this.setView("list")
    else return false
    return true
  }

  private cancelOther(): void {
    this.view = "list"
    this.rebuild()
  }

  private commitOther(): void {
    const t = this.typed.trim()
    const editing = this.editingId
    if (t.length === 0) {
      if (this.onDevice()) {
        this.setStatus("Type a note first.")
        return
      }
      // No text entry reached the Lens (Preview): add the placeholder, and say so.
      if (editing >= 0) {
        this.setStatus("Text entry is not available in the Preview. Edit this note on the glasses.")
        return
      }
      this.view = "list"
      this.listStatus = "Text entry is not available in the Preview: added the placeholder note \"" + PLACEHOLDER_NOTE + "\". Edit it on the glasses."
      this._onNote.invoke({text: PLACEHOLDER_NOTE, placeholder: true})
      return
    }
    this.view = "list"
    this.listStatus = ""
    if (editing >= 0) this._onEdit.invoke({id: editing, text: t})
    else this._onNote.invoke({text: t, placeholder: false})
  }

  private setStatus(text: string): void {
    this.statusText = text
    this.rebuild()
  }

  private updateTyped(): void {
    if (this.tOther) this.tOther.text = this.typed.length > 0 ? this.typed + "_" : "_"
  }

  /** Preview: one key press from the computer keyboard while the "other" view is open. */
  onKey(key: Keys): void {
    if (this.view !== "other" || !this.isVisible || this.onDevice()) return
    let ch = ""
    if (key === Keys.Backspace) {
      this.typed = this.typed.slice(0, -1)
      this.updateTyped()
      return
    }
    if (key === Keys.Space) ch = " "
    for (let i = 0; i < KEY_NAMES.length && !ch; i++) if (key === (Keys as any)[KEY_NAMES.charAt(i)]) ch = KEY_NAMES.charAt(i).toLowerCase()
    for (let i = 0; i < DIGIT_NAMES.length && !ch; i++) if (key === (Keys as any)[DIGIT_NAMES[i]]) ch = String(i)
    if (!ch || this.typed.length >= 120) return
    this.typed += ch
    this.updateTyped()
  }

  /** Device: the system keyboard. Safe if unavailable. */
  private openKeyboard(): void {
    try {
      const options = new TextInputSystem.KeyboardOptions()
      options.keyboardType = TextInputSystem.KeyboardType.Text
      options.returnKeyType = TextInputSystem.ReturnKeyType.Done
      options.onTextChanged = (text: string) => {
        this.typed = text
        this.updateTyped()
      }
      options.onReturnKeyPressed = () => this.commitOther()
      global.textInputSystem.requestKeyboard(options)
    } catch (e) {
      print("[MWNP] keyboard unavailable: " + e)
    }
  }
}
