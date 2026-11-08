// MWNPSpeech.ts — pure helpers for the Sparky voice layer: no scene access, no ASR, so every function here can be tested by calling it.
//
// Owns: transcript normalizing, wake-word segmenting ("sparky" / "sparkie" / "sparkey" / "spark key"), the command parser, spoken
// numbers ("twelve point zero" -> "12.0"), and spoken wire ids ("three b" -> "3b", only ids that exist, never a guess).
// Must not: act on anything (SparkyVoice dispatches, Main performs).

export interface VoiceCommand {
  /** "next" | "back" | "repeat" | "undo" | "close" | "show_schematic" | "open_library" | "open_report" | "open_camera" | "log" | "highlight" | "dismiss" | "symptom" | "retest" | "new_job" | "yes" | "no" | "not_yet" | "more" | "less" | "cancel" | "s1_up" | "s1_down" | "report_symptom" | "open_notes" | "save_note" | "note" | "hide_display" | "show_display" | "open_job" | "open_options" | "fixed" | "not_fixed" | "end_job" */
  name: string
  /** "log": the number as typed on the pad ("12.0"); "highlight": the spoken wire id words ("three b"). */
  arg: string
  /** True when the command is fully formed (for "log" / "highlight": the argument parsed). */
  complete: boolean
  /** Commands with an argument can still grow ("log twelve" -> "log twelve point five"): act on them only once the text settles. */
  needsSettle: boolean
}

const WAKE = "(?:sparky|sparkie|sparkey|sparki|spargy|spark key)"
const WAKE_START = new RegExp("^" + WAKE + "(?: |$)")
const WAKE_ANY = new RegExp("(?:^| )" + WAKE + "(?= |$)", "g")

/** Lower case, punctuation to spaces (a "." between digits stays), single spaces. */
export function normalize(raw: string): string {
  let t = raw.toLowerCase()
  t = t.replace(/(\d)\.(\d)/g, "$1#$2")
  t = t.replace(/[^a-z0-9#\s]/g, " ")
  t = t.replace(/#/g, ".")
  return t.replace(/\s+/g, " ").trim()
}

/**
 * The text after each wake word, in order. Only a transcript that STARTS with the wake word counts; anything else (TV, side
 * talk) gives no segments. "sparky next sparky next" -> ["next", "next"].
 */
export function wakeSegments(raw: string): string[] {
  const t = normalize(raw)
  if (!WAKE_START.test(t)) return []
  const parts = t.split(WAKE_ANY)
  const out: string[] = []
  for (let i = 1; i < parts.length; i++) out.push(parts[i].trim())
  return out
}

const ONES: {[w: string]: number} = {
  zero: 0, oh: 0, o: 0, one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: {[w: string]: number} = {twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90}
const DIGIT_WORDS: {[w: string]: string} = {zero: "0", oh: "0", o: "0", one: "1", two: "2", to: "2", three: "3", four: "4", for: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9"}

/** "twelve point zero" -> "12.0"; "twelve" -> "12"; "zero point five" -> "0.5"; "12.0" -> "12.0"; null when it is not a number. */
export function parseNumber(text: string): string | null {
  const tokens = normalize(text).split(" ").filter((w) => w.length > 0)
  if (tokens.length === 0) return null
  let i = 0
  let intPart: string | null = null
  // Integer part: digits as typed, or number words up to 99.
  if (/^\d+(\.\d+)?$/.test(tokens[0])) {
    if (tokens[0].indexOf(".") >= 0) return tokens.length === 1 ? tokens[0] : null
    intPart = tokens[0]
    i = 1
  } else {
    let value = 0
    let any = false
    while (i < tokens.length && tokens[i] !== "point" && tokens[i] !== "dot") {
      const w = tokens[i]
      if (TENS[w] !== undefined) value += TENS[w]
      else if (ONES[w] !== undefined) value += ONES[w]
      else return null
      any = true
      i++
    }
    if (any) intPart = String(value)
  }
  let frac = ""
  if (i < tokens.length) {
    if (tokens[i] !== "point" && tokens[i] !== "dot") return null
    i++
    while (i < tokens.length) {
      const w = tokens[i]
      if (/^\d+$/.test(w)) frac += w
      else if (DIGIT_WORDS[w] !== undefined) frac += DIGIT_WORDS[w]
      else return null
      i++
    }
    if (frac.length === 0) return null
  }
  if (intPart === null && frac.length === 0) return null
  const out = (intPart === null ? "0" : intPart) + (frac.length > 0 ? "." + frac : "")
  return out.length <= 6 ? out : null // the number pad takes six characters
}

/** Parses the text after the wake word. Returns null when it is not a command Sparky knows. */
export function parseCommand(segment: string): VoiceCommand | null {
  const t = normalize(segment).replace(/^(the|a) /, "")
  const done = (name: string): VoiceCommand => ({name, arg: "", complete: true, needsSettle: false})
  if (/^(next|next step)$/.test(t)) return done("next")
  if (/^(back|go back|previous step)$/.test(t)) return done("back")
  if (/^(repeat|repeat that|say again)$/.test(t)) return done("repeat")
  if (/^undo( that| last)?$/.test(t)) return done("undo")
  if (/^close( it| this)?$/.test(t)) return done("close")
  if (/^(show|open) (the )?schematic$/.test(t)) return done("show_schematic")
  if (/^((show|open) (the )?)?library$/.test(t)) return done("open_library")
  if (/^((show|open) (the )?)?report$/.test(t)) return done("open_report")
  if (/^((show|open) (the )?)?camera$/.test(t)) return done("open_camera")
  if (/^hide( card| cards| display)?$/.test(t)) return done("hide_display")
  if (/^show( card| cards| display)?$/.test(t)) return done("show_display")
  if (/^(((show|open) (the )?)|in )?job$/.test(t)) return done("open_job")
  if (/^((show|open) (the )?)?options$/.test(t)) return done("open_options")
  const s1 = /^(?:s ?1|s one|as one|is one|ess one|switch|the switch) (up|down)$/.exec(t)
  if (s1) return done("s1_" + s1[1])
  if (/^(fixed|it is fixed|yes fixed|problem solved)$/.test(t)) return done("fixed")
  if (/^(not fixed|still faulty|no not fixed)$/.test(t)) return done("not_fixed")
  if (/^end job$/.test(t)) return done("end_job")
  if (/^(report symptom|report a symptom|show symptoms|open symptoms|symptoms|symptom list)$/.test(t)) return done("report_symptom")
  if (/^((show|open) (the )?)?notes$/.test(t)) return done("open_notes")
  if (/^save( the)? note$/.test(t)) return done("save_note")
  const note = /^note (.+)$/.exec(t)
  if (note) return {name: "note", arg: note[1], complete: true, needsSettle: true}
  if (/^(dismiss|ok|okay|understood)$/.test(t)) return done("dismiss")
  const sym = /^(?:(extend|retract) (?:doesn t|doesnt|does not) work|symptom (extend|retract|neither)|(neither) (?:works|work|of them work))$/.exec(t)
  if (sym) return {name: "symptom", arg: sym[1] || sym[2] || sym[3], complete: true, needsSettle: false}
  if (/^(retest|fuse replaced|repaired|repaired retest|fuse replaced retest|replaced)$/.test(t)) return done("retest")
  if (/^(new job|start job|start new job)$/.test(t)) return done("new_job")
  if (/^yes$/.test(t)) return done("yes")
  if (/^no$/.test(t)) return done("no")
  if (/^not yet$/.test(t)) return done("not_yet")
  if (/^more$/.test(t)) return done("more")
  if (/^less$/.test(t)) return done("less")
  if (/^cancel$/.test(t)) return done("cancel")
  const log = /^log (.+)$/.exec(t)
  if (log) {
    const n = parseNumber(log[1].replace(/ volts?$/, ""))
    return {name: "log", arg: n === null ? "" : n, complete: n !== null, needsSettle: true}
  }
  const hl = /^highlight (?:wire )?(.+)$/.exec(t)
  if (hl) return {name: "highlight", arg: hl[1], complete: true, needsSettle: true}
  return null
}

const LETTER_WORDS: {[w: string]: string} = {ay: "a", eh: "a", bee: "b", be: "b", see: "c", sea: "c", dee: "d", ee: "e", gee: "g", pee: "p", tee: "t", vee: "v", zee: "z"}
/** Letters ASR confuses with each other when spelling ("b", "c", "d" all end in the same vowel). */
const EE_SET = "bcdegptvz"

/**
 * Spoken wire id -> an id that exists. Exact ids win. Otherwise the digit must match and the letter must be a single clearly
 * closest match among the real ids; if two ids tie ("3d" could be 3b or 3c) or nothing is close, `id` is null and `candidates`
 * lists what it could have been (so Sparky asks "Which wire?"). It never guesses.
 */
export function resolveWire(spoken: string, validIds: string[]): {id: string | null; candidates: string[]} {
  const tokens = normalize(spoken).split(" ").filter((w) => w.length > 0 && w !== "wire" && w !== "number" && w !== "the")
  let s = ""
  for (const w of tokens) {
    if (DIGIT_WORDS[w] !== undefined && w !== "o" && w !== "oh") s += DIGIT_WORDS[w]
    else if (LETTER_WORDS[w] !== undefined) s += LETTER_WORDS[w]
    else s += w
  }
  s = s.replace(/\s/g, "")
  if (s.length === 0) return {id: null, candidates: []}
  if (validIds.indexOf(s) >= 0) return {id: s, candidates: [s]}
  const m = /^(\d)([a-z])$/.exec(s)
  if (m) {
    const same = validIds.filter((id) => id.length === 2 && id.charAt(0) === m[1])
    const score = (id: string): number => (id.charAt(1) === m[2] ? 0 : EE_SET.indexOf(id.charAt(1)) >= 0 && EE_SET.indexOf(m[2]) >= 0 ? 1 : 2)
    const scored = same.map((id) => ({id, sc: score(id)})).sort((a, b) => a.sc - b.sc)
    if (scored.length > 0 && scored[0].sc <= 1 && (scored.length === 1 || scored[1].sc > scored[0].sc)) return {id: scored[0].id, candidates: [scored[0].id]}
    return {id: null, candidates: same}
  }
  if (/^\d$/.test(s)) {
    const same = validIds.filter((id) => id.charAt(0) === s)
    return {id: null, candidates: same}
  }
  return {id: null, candidates: []}
}

/**
 * Dictated text -> part ids in their proper form. "f1" -> "F1", "ts2" / "t s two" -> "TS-2", "s one" -> "S1", "wire three b" -> "wire 3b".
 * Only ids that exist are restored (componentIds from the netlist, wireIds from its wires); a wire that is not a clear single match stays as spoken.
 */
export function restoreIds(text: string, componentIds: string[], wireIds: string[]): string {
  const key = (id: string): string => id.toLowerCase().replace(/[^a-z0-9]/g, "")
  const byKey: {[k: string]: string} = {}
  for (const id of componentIds) byKey[key(id)] = id
  const tokens = text.split(/\s+/).filter((w) => w.length > 0)
  const HOMOPHONE: {[w: string]: boolean} = {to: true, too: true, for: true, o: true, oh: true}
  // One spoken token as id characters: a digit word, a single letter, or an alphanumeric chunk like "ts2". Homophones only count inside a longer window.
  const chars = (w: string, inWindow: boolean): string | null => {
    const lw = w.toLowerCase().replace(/[.,;:!?]+$/, "")
    if (/^[a-z0-9]+$/.test(lw) && (/\d/.test(lw) || lw.length === 1) && !(HOMOPHONE[lw] && !inWindow)) {
      if (DIGIT_WORDS[lw] !== undefined && lw.length > 1) return inWindow || !HOMOPHONE[lw] ? DIGIT_WORDS[lw] : null
      return lw
    }
    if (DIGIT_WORDS[lw] !== undefined && (inWindow || !HOMOPHONE[lw])) return DIGIT_WORDS[lw]
    if (/^[a-z]+\d+$/.test(lw)) return lw
    if (inWindow && /^[a-z]{2}$/.test(lw) && DIGIT_WORDS[lw] === undefined) return lw // "ts" in "ts two"
    return null
  }
  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i].toLowerCase()
    if (t === "wire" && i + 1 < tokens.length) {
      let done = false
      for (let n = 3; n >= 1 && !done; n--) {
        if (i + 1 + n > tokens.length) continue
        const spoken = tokens.slice(i + 1, i + 1 + n).join(" ")
        const r = resolveWire(spoken, wireIds)
        if (r.id) {
          out.push("wire " + r.id)
          i += 1 + n
          done = true
        }
      }
      if (done) continue
    }
    let matched = false
    for (let n = 4; n >= 1 && !matched; n--) {
      if (i + n > tokens.length) continue
      let s = ""
      let ok = true
      for (let k = 0; k < n; k++) {
        const c = chars(tokens[i + k], n > 1)
        if (c === null) {
          ok = false
          break
        }
        s += c
      }
      if (ok && byKey[s] !== undefined) {
        const trail = /[.,;:!?]+$/.exec(tokens[i + n - 1])
        out.push(byKey[s] + (trail ? trail[0] : ""))
        i += n
        matched = true
      }
    }
    if (!matched) {
      out.push(tokens[i])
      i++
    }
  }
  return out.join(" ")
}
