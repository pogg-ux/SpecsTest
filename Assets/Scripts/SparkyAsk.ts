// SparkyAsk.ts — "Sparky, ask <question>": a grounded question to OpenAI chat and a spoken answer, both through the Remote Service Gateway.
//
// Owns: the system rule, the request, the text-to-speech request, reading the token from the local secret file.
// Must not: decide facts (the answer comes only from the job files in the context Main builds), touch cards or ASR (SparkyVoice does).
// The token lives only in Assets/Local/RsgSecret.json ({"openai": "..."}), which is gitignored; it is never printed or put in the scene.
// Without it (fresh clone) or offline, ask() rejects with OFFLINE and everything else in Sparky keeps working.

import {OpenAI} from "RemoteServiceGateway.lspkg/HostedExternal/OpenAI"
import {RemoteServiceGatewayCredentials} from "RemoteServiceGateway.lspkg/RemoteServiceGatewayCredentials"

export const REFUSAL = "I can't confirm that from the job files."
export const OFFLINE = "Live answers need a connection."

const CHAT_MODEL = "gpt-4.1-mini"
const TTS_MODEL = "gpt-4o-mini-tts"
const TIMEOUT_SEC = 20

/** The OpenAI token from the secret file ("" when the file or the key is missing). */
export function readToken(secret: JsonAsset | null | undefined): string {
  if (!secret) return ""
  try {
    const o = JSON.parse(secret.getString()) as any
    return o && typeof o.openai === "string" ? o.openai.trim() : ""
  } catch (e) {
    return ""
  }
}

export function systemRule(): string {
  return (
    "You are Sparky, a voice assistant for a technician troubleshooting an electrical junction box. " +
    "Answer in one or two short spoken sentences, under 30 words, in plain language a technician can follow hands-free. No lists, no markdown, no preamble: start with the answer. " +
    "Use ONLY the JOB FILES and CURRENT JOB below. Look the answer up in them; you may combine facts that are written there. " +
    "If the answer is not in them, your first sentence is exactly this, ending with its full stop: " +
    REFUSAL +
    " Then add a second sentence with a short next check the technician can do, such as measuring or looking at a specific part from the job files (under 30 words in all). " +
    "Never guess. Never use outside knowledge: no typical values, no general electrical advice, no ratings or specifications that are not written in the job files. " +
    "Say part ids the way they are written, for example F1 or TS-2."
  )
}

function useToken(token: string): void {
  // RSG reads a private static; set it at call time so the scene's placeholder credentials cannot overwrite it.
  ;(RemoteServiceGatewayCredentials as any).openAIToken = token
}

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false
    const ev = (global as any).mwnpAskTimerHost as ScriptComponent | undefined
    if (ev) {
      const t = ev.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
      t.bind(() => {
        if (!done) {
          done = true
          reject(what + " timed out")
        }
      })
      t.reset(TIMEOUT_SEC)
    }
    p.then(
      (v) => {
        if (!done) {
          done = true
          resolve(v)
        }
      },
      (e) => {
        if (!done) {
          done = true
          reject(e)
        }
      }
    )
  })
}

/** The answer text for `question`, grounded in `context` (the job files and the current job). Rejects with OFFLINE when it cannot ask. */
export function ask(question: string, context: string, token: string): Promise<string> {
  if (!token || !global.deviceInfoSystem.isInternetAvailable()) return Promise.reject(OFFLINE)
  useToken(token)
  return withTimeout(
    OpenAI.chatCompletions({
      model: CHAT_MODEL,
      temperature: 0,
      max_tokens: 60,
      messages: [
        {role: "system", content: systemRule()},
        {role: "user", content: context + "\n\nQUESTION: " + question},
      ],
    }),
    "chat"
  ).then((resp: any) => {
    const t = resp && resp.choices && resp.choices[0] && resp.choices[0].message ? resp.choices[0].message.content : null
    if (!t || t.trim().length === 0) throw "empty answer"
    return t.trim()
  })
}

/** Spoken version of `text` as an audio track. */
export function speak(text: string, token: string): Promise<AudioTrackAsset> {
  if (!token) return Promise.reject(OFFLINE)
  useToken(token)
  return withTimeout(
    OpenAI.speech({model: TTS_MODEL, input: text, voice: "verse", instructions: "Calm, clear, brisk pace, like a workshop assistant."}),
    "speech"
  )
}
