// MWNPSpeech.ts — pure helpers for the Sparky voice layer: no scene access, no ASR, so every function here can be tested by calling it.
//
// Owns: transcript normalizing, wake-word segmenting ("sparky" / "sparkie" / "sparkey" / "spark key"), the command parser, spoken
// numbers ("twelve point zero" -> "12.0"), and spoken wire ids ("three b" -> "3b", only ids that exist, never a guess).
// Must not: act on anything (SparkyVoice dispatches, Main performs).

export interface VoiceCommand {
  /** "next" | "back" | "repeat" | "undo" | "close" | "show_schematic" | "open_library" | "open_report" | "open_camera" | "log" | "highlight" | "dismiss" | "symptom" | "retest" | "new_job" | "yes" | "no" | "not_yet" | "more" | "less" | "cancel" | "s1_up" | "s1_down" | "report_symptom" | "open_notes" | "save_note" | "note" | "ask" | "hide_display" | "show_display" | "open_job" | "open_options" | "fixed" | "not_fixed" | "end_job" | "show_labels" | "clear_labels" */
  name: string
  /** "log": the number as typed on the pad ("12.0"); "highlight": the spoken wire id words ("three b"). */
  arg: string
  /** True when the command is fully formed (for "log" / "highlight": the argument parsed). */
  complete: boolean
  /** Commands with an argument can still grow ("log twelve" -> "log twelve point five"): act on them only once the text settles. */
  needsSettle: boolean
  /** Wait this long (seconds) for the text to stop changing before acting (a spoken question pauses mid-sentence). */
  settleSec?: number
}

// The wake word as live ASR actually writes it. At the START of a transcript (where a mishearing costs the whole command) the match
// is tolerant: a listed variant, or any single word one letter away from "sparky" (sporky, parky, sparks, spunky is listed ...), or
// "spark" + e / he / key. "sports" (3 edits) and "party" (2) do not match. Later in the same transcript ("sparky next sparky back")
// only the strict spellings split a segment, so a dictated note ("note the motor sparks") is not cut in two.
const WAKE_WORD = "sparky"
const WAKE_LISTED: {[w: string]: boolean} = {
  sparky: true, sparkie: true, sparkey: true, sparki: true, spargy: true, sporky: true, sparks: true, parky: true, sporty: true, spunky: true,
}
const WAKE_MID: {[w: string]: boolean} = {sparky: true, sparkie: true, sparkey: true, sparki: true, spargy: true, sporky: true}
const WAKE_SPARK_TAIL: {[w: string]: boolean} = {key: true, e: true, he: true}

/** True when a and b are equal or differ by one inserted, deleted or substituted letter. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a.charAt(i) === b.charAt(i)) i++
  if (a.length === b.length) return a.substring(i + 1) === b.substring(i + 1)
  return a.length > b.length ? a.substring(i + 1) === b.substring(i) : a.substring(i) === b.substring(i + 1)
}

/** How many tokens from `i` are the wake word at the start of a transcript (0 = not a wake word). */
function wakeLenAtStart(tokens: string[], i: number): number {
  const w = tokens[i]
  if (w === "spark" && i + 1 < tokens.length && WAKE_SPARK_TAIL[tokens[i + 1]] === true) return 2
  return WAKE_LISTED[w] === true || withinOneEdit(w, WAKE_WORD) ? 1 : 0
}

/** How many tokens from `i` are a wake word later in the transcript (strict spellings only). */
function wakeLenMid(tokens: string[], i: number): number {
  if (tokens[i] === "spark" && i + 1 < tokens.length && tokens[i + 1] === "key") return 2
  return WAKE_MID[tokens[i]] === true ? 1 : 0
}

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
  const tokens = normalize(raw).split(" ").filter((w) => w.length > 0)
  if (tokens.length === 0) return []
  let i = wakeLenAtStart(tokens, 0)
  if (i === 0) return []
  const out: string[] = []
  let cur: string[] = []
  while (i < tokens.length) {
    const n = wakeLenMid(tokens, i)
    if (n > 0) {
      out.push(cur.join(" "))
      cur = []
      i += n
    } else {
      cur.push(tokens[i])
      i++
    }
  }
  out.push(cur.join(" "))
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

/**
 * Commands whose shortest phrase is a word-prefix of a phrase of a DIFFERENT command (collision audit, see parseCommand):
 *   open_report "report"  <- "report symptom" / "report a symptom" (report_symptom)
 *   open_job    "job"     <- "job report" (open_report)
 *   show_display "show"   <- "show me" / "show labels" / "show schematic" / "show library" / "show symptoms" ... (many)
 *   hide_display "hide"   <- "hide labels" (clear_labels)
 *   yes         "yes"     <- "yes fixed" (fixed)
 *   no          "no"      <- "no not fixed" (not_fixed)
 * Prefixes inside the SAME command ("next" / "next step", "close" / "close it", "undo" / "undo that") are harmless and not listed.
 */
const HEAD_OF_LONGER: {[name: string]: boolean} = {open_report: true, open_job: true, show_display: true, hide_display: true, yes: true, no: true}

/** Parses the text after the wake word. Returns null when it is not a command Sparky knows. */
export function parseCommand(segment: string): VoiceCommand | null {
  const t = normalize(segment).replace(/^(the|a) /, "")
  // A command whose phrase is the START of a longer phrase ("report" -> "report symptom", "yes" -> "yes fixed") must not act on a
  // partial: the partial "sparky report" arrives before "symptom" and would open the wrong card. It acts on the final, or once the
  // text has stopped changing (SparkyVoice's settle). The longer phrase has needsSettle false, so it acts the moment it is heard.
  const done = (name: string): VoiceCommand => ({name, arg: "", complete: true, needsSettle: HEAD_OF_LONGER[name] === true})
  if (/^(next|next step)$/.test(t)) return done("next")
  if (/^(back|go back|previous step)$/.test(t)) return done("back")
  if (/^(repeat|repeat that|say again)$/.test(t)) return done("repeat")
  if (/^undo( that| last)?$/.test(t)) return done("undo")
  if (/^close( it| this)?$/.test(t)) return done("close")
  if (/^(show|open) (the )?schematic$/.test(t)) return done("show_schematic")
  if (/^((show|open) (the )?)?library$/.test(t)) return done("open_library")
  if (/^((show|open) (the )?)?(job )?report$/.test(t)) return done("open_report")
  if (/^((show|open) (the )?)?camera$/.test(t)) return done("open_camera")
  if (/^(show me|show (the )?labels)$/.test(t)) return done("show_labels")
  if (/^(clear|clear (the )?labels|hide (the )?labels)$/.test(t)) return done("clear_labels")
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
  const askQ = /^ask (.+)$/.exec(t)
  if (askQ) return {name: "ask", arg: askQ[1], complete: true, needsSettle: true, settleSec: 2.0}
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
  // Last, so every command above wins: anything that sounds like a question is an ask.
  if (/^(what|whats|why|whys|how|which|where|when|is|does|can|should)\b.+/.test(t) || /\?\s*$/.test(segment.trim())) return {name: "ask", arg: t, complete: true, needsSettle: true, settleSec: 2.0}
  return null
}

// ── Fuzzy command matching ────────────────────────────────────────────────────────────────────────────────────────────────────────
// parseCommand above is the strict parser (exact phrases). When a segment is not one of them, interpret() below compares it with
// every known command phrase, word by word, and acts only when the best match is clearly good:
//   - score = 1 - (word edit distance) / (longest phrase length in words). A substituted word costs 1 - similarity, where similarity
//     is the letter edit similarity, or 0.9 for two words that sound alike (same phonetic key, 4+ letters). "under stood" (split) also counts.
//   - best score < COMMAND_CONFIDENCE: nothing runs (Sparky says "Say again?").
//   - another command scores within AMBIGUITY_GAP of the best (and is itself above the threshold): nothing runs (Sparky asks "Did you mean X or Y?").
//   - NUMBERS ARE NEVER FUZZY: a word with a digit or a number word must match exactly, and "log <reading>" is parsed strictly. A reading that is
//     not a clean number ("to", "for", "oh" can be 2, 4, 0 or plain words) is read back for a "Sparky, yes" instead of being logged.

/** Minimum match score (0..1) at which a fuzzy match acts. */
export const COMMAND_CONFIDENCE = 0.8
/** Two different commands this close to the best score (both above the threshold) are ambiguous: ask instead of guessing. */
const AMBIGUITY_GAP = 0.1

export interface Phrase {
  name: string
  arg: string
  phrase: string
}
const phr = (name: string, arg: string, ...phrases: string[]): Phrase[] => phrases.map((p) => ({name, arg, phrase: p}))

/** Every spoken form of the fixed commands (the commands with a free argument - log, note, ask, highlight - are handled by their keyword). */
export const COMMAND_PHRASES: Phrase[] = ([] as Phrase[]).concat(
  phr("next", "", "next", "next step"),
  phr("back", "", "back", "go back", "previous step"),
  phr("repeat", "", "repeat", "repeat that", "say again"),
  phr("undo", "", "undo", "undo that", "undo last"),
  phr("close", "", "close", "close it", "close this"),
  phr("show_schematic", "", "show schematic", "open schematic"),
  phr("open_library", "", "library", "open library", "show library"),
  phr("open_report", "", "report", "open report", "show report", "job report", "open job report"),
  phr("open_camera", "", "camera", "open camera", "show camera"),
  phr("show_labels", "", "show me", "show labels"),
  phr("clear_labels", "", "clear", "clear labels", "hide labels"),
  phr("hide_display", "", "hide", "hide card", "hide cards", "hide display"),
  phr("show_display", "", "show", "show card", "show cards", "show display"),
  phr("open_job", "", "job", "open job", "show job"),
  phr("open_options", "", "options", "open options", "show options"),
  phr("s1_up", "", "s1 up", "switch up"),
  phr("s1_down", "", "s1 down", "switch down"),
  phr("fixed", "", "fixed", "it is fixed", "yes fixed", "problem solved"),
  phr("not_fixed", "", "not fixed", "still faulty", "no not fixed"),
  phr("end_job", "", "end job"),
  phr("report_symptom", "", "report symptom", "report a symptom", "show symptoms", "open symptoms", "symptoms", "symptom list"),
  phr("open_notes", "", "notes", "open notes", "show notes"),
  phr("save_note", "", "save note", "save the note"),
  phr("dismiss", "", "dismiss", "ok", "okay", "understood"),
  phr("symptom", "extend", "extend doesnt work", "symptom extend"),
  phr("symptom", "retract", "retract doesnt work", "symptom retract"),
  phr("symptom", "neither", "neither works"),
  phr("retest", "", "retest", "fuse replaced", "repaired", "repaired retest", "fuse replaced retest", "replaced"),
  phr("new_job", "", "new job", "start job", "start new job"),
  phr("yes", "", "yes"),
  phr("no", "", "no"),
  phr("not_yet", "", "not yet"),
  phr("more", "", "more"),
  phr("less", "", "less"),
  phr("cancel", "", "cancel")
)

const NUMBER_WORDS: {[w: string]: boolean} = {point: true, dot: true}
for (const w of Object.keys(ONES)) NUMBER_WORDS[w] = true
for (const w of Object.keys(TENS)) NUMBER_WORDS[w] = true
/** A word that carries a number: never fuzzy-matched. */
function numberLike(w: string): boolean {
  return /\d/.test(w) || NUMBER_WORDS[w] === true
}

function letterEdits(a: string, b: string): number {
  const prev: number[] = []
  for (let j = 0; j <= b.length; j++) prev.push(j)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1))
      diag = up
    }
  }
  return prev[b.length]
}

/** A rough sound key: voiced/unvoiced pairs merged (b/p, d/t, g/k/c/q, v/f, z/s), vowels and h/w dropped after the first letter. */
export function phoneticKey(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, "")
  w = w.replace(/ph/g, "f").replace(/ck/g, "k").replace(/^kn/, "n").replace(/^wr/, "r").replace(/x/g, "ks").replace(/c(?=[eiy])/g, "s")
  const MAP: {[c: string]: string} = {b: "p", d: "t", g: "k", c: "k", q: "k", v: "f", z: "s"}
  let out = ""
  for (let i = 0; i < w.length; i++) {
    const c = w.charAt(i)
    const m = MAP[c] !== undefined ? MAP[c] : c
    if (i > 0 && "aeiouyhw".indexOf(m) >= 0) continue
    if (out.length > 0 && out.charAt(out.length - 1) === m) continue
    out += m
  }
  return out
}

/** 0..1: how alike two words are. Number words never match approximately. */
function wordSim(a: string, b: string): number {
  if (a === b) return 1
  if (numberLike(a) || numberLike(b)) return 0
  const letters = 1 - letterEdits(a, b) / Math.max(a.length, b.length)
  let sound = 0
  if (a.length >= 4 && b.length >= 4) {
    const ka = phoneticKey(a)
    if (ka.length >= 3 && ka === phoneticKey(b)) sound = 0.9
  }
  return Math.max(letters, sound)
}

/** Word-level similarity of two phrases (token edit distance, a substitution costing 1 - wordSim). 1 = identical. */
function phraseScore(heard: string[], phrase: string[]): number {
  const n = heard.length
  const m = phrase.length
  if (n === 0 || m === 0) return 0
  const d: number[][] = []
  for (let i = 0; i <= n; i++) {
    d.push([])
    for (let j = 0; j <= m; j++) d[i].push(i === 0 ? j : j === 0 ? i : 0)
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (1 - wordSim(heard[i - 1], phrase[j - 1])))
    }
  }
  return 1 - d[n][m] / Math.max(n, m)
}

/** Score of a heard text against one phrase: word by word, or with the spaces taken out ("under stood" = "understood"). */
function scoreAgainst(heard: string[], phrase: string): number {
  const p = phrase.split(" ")
  let s = phraseScore(heard, p)
  if (heard.length > 1 || p.length > 1) s = Math.max(s, wordSim(heard.join(""), p.join("")) * 0.98)
  return s
}

/** "12.1" -> "Twelve point one" (what Sparky reads back). Whole numbers over 99 are read digit by digit. */
export function speakNumber(value: string): string {
  const W = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
  const T = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
  const parts = value.split(".")
  const ip = parts[0]
  let words: string[]
  if (ip.length <= 2) {
    const v = parseInt(ip, 10)
    words = [v < 20 ? W[v] : T[Math.floor(v / 10)] + (v % 10 > 0 ? " " + W[v % 10] : "")]
  } else words = ip.split("").map((c) => W[parseInt(c, 10)])
  if (parts.length > 1) words.push("point", ...parts[1].split("").map((c) => W[parseInt(c, 10)]))
  const s = words.join(" ")
  return s.charAt(0).toUpperCase() + s.substring(1)
}

const HOMOPHONE_DIGITS: {[w: string]: boolean} = {to: true, too: true, for: true, o: true, oh: true}
/** The reading in `text` as the number pad takes it (null = not a number), and whether every word was unmistakably a number. */
export function numberClarity(text: string): {value: string | null; clean: boolean} {
  const value = parseNumber(text)
  if (value === null) return {value: null, clean: false}
  const tokens = normalize(text).split(" ")
  return {value, clean: tokens.every((w) => HOMOPHONE_DIGITS[w] !== true)}
}

/** How "log" comes out of live ASR; a reading after one of these is always read back first. */
const LOG_ALIASES: {[w: string]: boolean} = {lock: true, lug: true, logs: true, logged: true, lag: true, luck: true}

export interface Interpretation {
  /** exact: strict parse | fuzzy: close enough to one command | ambiguous: two close commands | confirm_log: read the value back first |
   *  unclear_log: "log" without a usable number | none: nothing matched. */
  kind: "exact" | "fuzzy" | "ambiguous" | "confirm_log" | "unclear_log" | "none"
  /** The command to run (exact / fuzzy). */
  cmd: VoiceCommand | null
  /** Match score 0..1 (exact = 1; none = the best score found). */
  score: number
  /** The command it was matched to ("report_symptom", "log:12.1", "none"). */
  matched: string
  /** The catalog phrase a fuzzy match was made to, or the two phrases of an ambiguous one joined by " / ". */
  phrase: string
  /** ambiguous: the two phrases to offer. */
  options: string[]
  /** confirm_log: the number as the pad takes it. */
  value: string
}

function label(c: VoiceCommand): string {
  return c.name + (c.arg ? ":" + c.arg : "")
}

/** Decides what a segment (the text after the wake word) is. Strict parse first; fuzzy matching only when that finds nothing. */
export function interpret(segment: string, catalog: Phrase[] = COMMAND_PHRASES): Interpretation {
  const t = normalize(segment).replace(/^(the|a) /, "")
  const res = (kind: Interpretation["kind"], cmd: VoiceCommand | null, score: number, matched: string, phrase: string = "", options: string[] = [], value: string = ""): Interpretation => ({kind, cmd, score, matched, phrase, options, value})
  const exact = parseCommand(segment)
  if (exact) {
    if (exact.name === "log") {
      const m = /^log (.+)$/.exec(t)
      const c = numberClarity(m ? m[1].replace(/ volts?$/, "") : "")
      if (c.value === null) return res("unclear_log", null, 1, "log")
      if (!c.clean) return res("confirm_log", null, 1, "log:" + c.value, "", [], c.value)
    }
    return res("exact", exact, 1, label(exact))
  }
  const tokens = t.split(" ").filter((w) => w.length > 0)
  if (tokens.length === 0) return res("none", null, 0, "none")
  // "lock twelve point one": a misheard "log". The number is still strict, and the value is always read back.
  if (tokens.length > 1 && LOG_ALIASES[tokens[0]] === true) {
    const c = numberClarity(tokens.slice(1).join(" ").replace(/ volts?$/, ""))
    return c.value === null ? res("none", null, 0, "none") : res("confirm_log", null, 0.9, "log:" + c.value, tokens[0], [], c.value)
  }
  const best: {[key: string]: {score: number; p: Phrase}} = {}
  for (const p of catalog) {
    const s = scoreAgainst(tokens, p.phrase)
    const key = p.name + ":" + p.arg
    if (!best[key] || s > best[key].score) best[key] = {score: s, p}
  }
  const ranked = Object.keys(best).map((k) => best[k]).sort((a, b) => b.score - a.score)
  const top = ranked[0]
  if (!top) return res("none", null, 0, "none")
  const EPS = 1e-9
  if (top.score < COMMAND_CONFIDENCE - EPS) return res("none", null, top.score, "none", top.p.phrase)
  const second = ranked[1]
  if (second && second.score >= COMMAND_CONFIDENCE - EPS && top.score - second.score < AMBIGUITY_GAP) {
    return res("ambiguous", null, top.score, "ambiguous", top.p.phrase + " / " + second.p.phrase, [top.p.phrase, second.p.phrase])
  }
  const cmd: VoiceCommand = {name: top.p.name, arg: top.p.arg, complete: true, needsSettle: false}
  return res("fuzzy", cmd, top.score, label(cmd), top.p.phrase)
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
