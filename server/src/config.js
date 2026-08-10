import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function loadApiKey() {
  if (process.env.SARVAM_API_KEY) return process.env.SARVAM_API_KEY;

  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, "utf-8")
      .split("\n")
      .find((l) => l.startsWith("SARVAM_API_KEY="));
    if (line) return line.split("=")[1].trim();
  }

  throw new Error(
    "SARVAM_API_KEY not set. Add it to .env or export it as an environment variable."
  );
}

export const config = {
  port: Number(process.env.PORT) || 8787,
  sarvamApiKey: loadApiKey(),
  upstreamTimeoutMs: 20_000,
  maxAudioBytes: 8 * 1024 * 1024, // ~8MB covers several minutes of webm/opus speech
};
