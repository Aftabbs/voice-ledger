// VoiceLedger capture service.
//
// Single responsibility: turn an audio recording into a structured ledger
// transaction. It never stores anything — the merchant's ledger lives entirely
// on their device (see app/src/db.js). This process holds only the Sarvam API
// key and forwards audio to it.
import { config } from "./src/config.js";
import { createApp } from "./src/http.js";

createApp().listen(config.port, () => {
  console.log(`VoiceLedger capture server listening on :${config.port}`);
});
