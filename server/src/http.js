import { createServer } from "node:http";
import { config } from "./config.js";
import { parseTransaction, transcribe } from "./sarvam.js";

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error(`audio exceeds ${maxBytes} byte limit`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleCapture(req, res) {
  try {
    const audio = await readBody(req, config.maxAudioBytes);
    if (!audio.length) throw new Error("empty audio");

    const contentType = req.headers["content-type"] || "audio/webm";
    const transcript = await transcribe(audio, contentType);
    const parsed = transcript ? await parseTransaction(transcript) : { type: "unknown" };

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ transcript, parsed }));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
}

function handleHealth(_req, res) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));
}

export function createApp() {
  return createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/api/capture") {
      await handleCapture(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      handleHealth(req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  });
}
