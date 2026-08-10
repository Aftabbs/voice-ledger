import { config } from "./config.js";

const STT_URL = "https://api.sarvam.ai/speech-to-text";
const CHAT_URL = "https://api.sarvam.ai/v1/chat/completions";
const STT_MODEL = "saaras:v3";
const CHAT_MODEL = "sarvam-105b";

const PARSE_SYSTEM = `You are a transaction parser for an Indian small-shop voice ledger.
The input is a transcript (Hindi/Hinglish/Marathi, Devanagari or Latin) of a merchant speaking.
Reply with ONLY a JSON object, no markdown, with fields:
- "type": one of "credit" (goods given on udhaar), "payment" (customer paid money back),
  "sale" (cash sale), "expense" (merchant spent money), "query_balance" (asking one
  person's balance), "query_total" (asking today's/period total), "query_list"
  (asking who owes), or "unknown"
- "party": customer/person name as spoken (Devanagari ok), or null
- "amount": integer rupees, or null
- "note": items or context mentioned, or null
Numbers may be spoken as words (paanch sau = 500, dhai hazaar = 2500, पाचशे = 500).
If the transcript is not a transaction or query, use type "unknown".`;

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`upstream timed out after ${ms}ms`)), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/** Sends raw audio to Sarvam's speech-to-text endpoint and returns the transcript. */
export async function transcribe(audioBuffer, contentType) {
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: contentType }), "audio.webm");
  form.append("model", STT_MODEL);

  const { signal, clear } = withTimeout(config.upstreamTimeoutMs);
  try {
    const resp = await fetch(STT_URL, {
      method: "POST",
      headers: { "api-subscription-key": config.sarvamApiKey },
      body: form,
      signal,
    });
    if (!resp.ok) throw new Error(`STT ${resp.status}: ${await resp.text()}`);
    return (await resp.json()).transcript ?? "";
  } finally {
    clear();
  }
}

function coerceTransaction(raw) {
  const amount = raw.amount == null || raw.amount === "" ? null : Number(raw.amount);
  return {
    type: typeof raw.type === "string" ? raw.type : "unknown",
    party: raw.party ? String(raw.party) : null,
    amount: Number.isFinite(amount) ? amount : null,
    note: raw.note ? String(raw.note) : null,
  };
}

const EMPTY_TRANSACTION = { type: "unknown", party: null, amount: null, note: null };

/**
 * sarvam-105b is a reasoning model: the final answer sometimes lands in
 * `reasoning_content` instead of `content` when the response is truncated.
 * We scan both, preferring the last well-formed JSON object with a `type` field.
 */
function extractTransaction(message) {
  for (const source of [message.content, message.reasoning_content]) {
    if (!source) continue;
    const candidates = source.match(/\{[^{}]*\}/g);
    if (!candidates) continue;

    for (const candidate of candidates.reverse()) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed.type) return coerceTransaction(parsed);
      } catch {
        // not valid JSON, try the next candidate
      }
    }
  }
  return EMPTY_TRANSACTION;
}

/** Classifies a transcript into a structured ledger transaction via Sarvam chat. */
export async function parseTransaction(transcript) {
  const { signal, clear } = withTimeout(config.upstreamTimeoutMs);
  let resp;
  try {
    resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.sarvamApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: PARSE_SYSTEM },
          { role: "user", content: transcript },
        ],
        temperature: 0,
        max_tokens: 2048,
        reasoning_effort: "low",
      }),
      signal,
    });
  } finally {
    clear();
  }

  if (!resp.ok) throw new Error(`Chat ${resp.status}: ${await resp.text()}`);
  const message = (await resp.json()).choices?.[0]?.message ?? {};
  return extractTransaction(message);
}
