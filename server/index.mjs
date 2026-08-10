// VoiceLedger — stateless capture server (Layer 1).
// One job: audio in -> {transcript, parsed} out. Stores nothing.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = process.env.PORT || 8787;
const SARVAM_STT = "https://api.sarvam.ai/speech-to-text";
const SARVAM_CHAT = "https://api.sarvam.ai/v1/chat/completions";

function loadKey() {
  if (process.env.SARVAM_API_KEY) return process.env.SARVAM_API_KEY;
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, "utf-8").split("\n")
      .find((l) => l.startsWith("SARVAM_API_KEY="));
    if (line) return line.split("=")[1].trim();
  }
  throw new Error("SARVAM_API_KEY not set");
}
const API_KEY = loadKey();

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

const UPSTREAM_TIMEOUT_MS = 20_000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // ~8MB, generous for a few minutes of webm/opus speech

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`upstream timed out after ${ms}ms`)), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function transcribe(audioBuffer, contentType) {
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: contentType }), "audio.webm");
  form.append("model", "saaras:v3");
  const { signal, clear } = withTimeout(UPSTREAM_TIMEOUT_MS);
  try {
    const resp = await fetch(SARVAM_STT, {
      method: "POST",
      headers: { "api-subscription-key": API_KEY },
      body: form,
      signal,
    });
    if (!resp.ok) throw new Error(`STT ${resp.status}: ${await resp.text()}`);
    return (await resp.json()).transcript ?? "";
  } finally {
    clear();
  }
}

function coerceParsed(obj) {
  const amount = obj.amount == null || obj.amount === "" ? null : Number(obj.amount);
  return {
    type: typeof obj.type === "string" ? obj.type : "unknown",
    party: obj.party ? String(obj.party) : null,
    amount: Number.isFinite(amount) ? amount : null,
    note: obj.note ? String(obj.note) : null,
  };
}

async function parse(transcript) {
  const { signal, clear } = withTimeout(UPSTREAM_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(SARVAM_CHAT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sarvam-105b",
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
  const msg = (await resp.json()).choices?.[0]?.message ?? {};
  // Reasoning model: prefer content; if truncated/empty, salvage the last
  // complete JSON object from reasoning_content.
  for (const source of [msg.content, msg.reasoning_content]) {
    if (!source) continue;
    const matches = source.match(/\{[^{}]*\}/g);
    if (!matches) continue;
    for (const candidate of matches.reverse()) {
      try {
        const obj = JSON.parse(candidate);
        if (obj.type) return coerceParsed(obj);
      } catch { /* try next */ }
    }
  }
  return { type: "unknown", party: null, amount: null, note: null };
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error(`audio exceeds ${maxBytes} byte limit`));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "POST" && req.url === "/api/capture") {
    try {
      const audio = await readBody(req, MAX_AUDIO_BYTES);
      if (!audio.length) throw new Error("empty audio");
      const transcript = await transcribe(audio, req.headers["content-type"] || "audio/webm");
      const parsed = transcript ? await parse(transcript) : { type: "unknown" };
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ transcript, parsed }));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err.message || err) }));
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => console.log(`VoiceLedger capture server on :${PORT}`));
