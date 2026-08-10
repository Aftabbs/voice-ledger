"""Phase 0 accelerated validation — synthesize utterances via Sarvam TTS,
loop them back through Sarvam STT, and score.

Validates both directions of the product pipeline (voice-in AND voice-out)
without manual recording. Real human recordings in recordings/ remain the
ground-truth anchor; this covers vocabulary/number/type breadth.

Usage: python synth_test.py [--only 46,47]  (default: all IDs without a real recording)
"""

import argparse
import base64
import csv
import re
import sys
import time
from pathlib import Path

import requests

from run_test import EXPECTED, RECORDINGS, RESULTS, score, transcribe

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).parent
SYNTH = HERE / "synth"
TTS_URL = "https://api.sarvam.ai/text-to-speech"

# Devanagari text per utterance (natural TTS pronunciation), lang code per ID.
TEXTS = {
    1:  "रमेश को पाँच सौ का सामान दिया उधार",
    2:  "सुरेश भाई को दो सौ पचास का उधार लिख दो",
    3:  "शर्मा जी ने बारह सौ का माल लिया, बाद में देंगे",
    4:  "पूजा को तीन सौ का किराना उधार पे दिया",
    5:  "अनिल को सात सौ पचास का सामान उधार",
    6:  "गुप्ता जी को एक हज़ार का माल दिया क्रेडिट पे",
    7:  "रेखा दीदी ने सौ रुपये का सामान लिया उधार में",
    8:  "विजय को साढ़े चार सौ का उधार",
    9:  "मोहन लाल को पंद्रह सौ का सामान बाकी में दिया",
    10: "किरण को दो सौ का दूध और ब्रेड उधार",
    11: "अशोक भाई का आज का उधार छह सौ रुपये",
    12: "संतोष को आटा चावल दिया, टोटल आठ सौ, उधार लिखो",
    13: "मीना जी ने तीन सौ पचास का सामान लिया, पैसे बाद में",
    14: "राहुल को नब्बे रुपये का उधार",
    15: "प्रकाश जी को ढाई हज़ार का माल उधार पे दिया",
    16: "रमेश ने पाँच सौ दे दिए",
    17: "सुरेश से दो सौ मिले आज",
    18: "शर्मा जी ने उधार का एक हज़ार वापस किया",
    19: "पूजा ने तीन सौ जमा कराए",
    20: "अनिल से सात सौ पचास आ गए",
    21: "गुप्ता जी ने पूरा हिसाब क्लियर कर दिया, एक हज़ार",
    22: "विजय ने साढ़े चार सौ कैश दिए",
    23: "मोहन लाल से पाँच सौ मिले, हज़ार अभी बाकी",
    24: "किरण ने दो सौ लौटा दिए",
    25: "संतोष से चार सौ मिले",
    26: "आज एक सौ साठ का कैश सेल हुआ",
    27: "दो सौ का सामान बेचा कैश में",
    28: "कस्टमर ने पचासी रुपये का बिस्किट और नमकीन लिया",
    29: "पाँच सौ का बिल बना कैश का",
    30: "तेल और साबुन बेचा, टोटल तीन सौ बीस",
    31: "एक ग्राहक ने बारह सौ पचास का सामान खरीदा",
    32: "सत्तर रुपये की मैगी और चिप्स",
    33: "आज सुबह का पहला सेल पैंतालीस रुपये",
    34: "आज बिजली का बिल भरा पंद्रह सौ",
    35: "होलसेल से माल आया पाँच हज़ार का",
    36: "टेम्पो वाले को सौ रुपये दिए",
    37: "दुकान का किराया दिया आठ हज़ार",
    38: "चाय नाश्ता खर्चा पचास रुपये",
    39: "लड़के की पगार दी तीन हज़ार",
    40: "रिचार्ज कराया दो सौ निन्यानवे का",
    41: "रमेश का कितना उधार बाकी है",
    42: "आज का टोटल कितना हुआ",
    43: "शर्मा जी का हिसाब बताओ",
    44: "इस महीने कितना उधार दिया टोटल",
    45: "किस किस का पैसा बाकी है",
    46: "रमेशला पाचशे रुपयाचा माल उधार दिला",
    47: "सुरेशने दोनशे रुपये दिले",
    48: "आज तीनशे रुपयांची विक्री झाली",
    49: "लाईट बिल भरलं हजार रुपये",
    50: "रमेशचं किती उधार बाकी आहे",
}
LANG = {i: ("mr-IN" if i >= 46 else "hi-IN") for i in TEXTS}

# Marathi number-words for the scorer's benefit are already in run_test.NUMBER_WORDS
# (paachshe/donshe/tinshe); Devanagari Marathi forms:
MARATHI_EXTRA = {"पाचशे": 500, "दोनशे": 200, "तीनशे": 300, "हजार": 1000}
import run_test  # noqa: E402
run_test.NUMBER_WORDS.update(MARATHI_EXTRA)
run_test.NUMBER_WORDS.update({"पचासी": 85, "पैंतालीस": 45, "तीन सौ बीस": 320,
                              "बारह सौ पचास": 1250, "निन्यानवे": 299,
                              "दो सौ निन्यानवे": 299, "तीन सौ पचास": 350,
                              "साढ़े चार सौ": 450, "एक सौ साठ": 160})


def synthesize(text: str, lang: str, api_key: str, out_path: Path):
    resp = requests.post(
        TTS_URL,
        headers={"api-subscription-key": api_key, "Content-Type": "application/json"},
        json={"text": text, "target_language_code": lang, "model": "bulbul:v3",
              "output_audio_codec": "wav", "speech_sample_rate": "16000"},
        timeout=60,
    )
    resp.raise_for_status()
    out_path.write_bytes(base64.b64decode(resp.json()["audios"][0]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="comma-separated utterance IDs")
    args = parser.parse_args()

    api_key = None
    env = HERE.parent / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("SARVAM_API_KEY="):
                api_key = line.split("=", 1)[1].strip()
    if not api_key:
        sys.exit("SARVAM_API_KEY not found in ../.env")

    recorded = {int(re.search(r"utt_(\d+)", p.name).group(1))
                for p in RECORDINGS.glob("utt_*.webm")}
    if args.only:
        ids = [int(x) for x in args.only.split(",")]
    else:
        ids = [i for i in sorted(TEXTS) if i not in recorded]

    SYNTH.mkdir(exist_ok=True)
    RESULTS.mkdir(exist_ok=True)
    rows = []
    for i in ids:
        wav = SYNTH / f"utt_{i:02d}.wav"
        try:
            if not wav.exists():
                synthesize(TEXTS[i], LANG[i], api_key, wav)
                time.sleep(0.3)
            result = transcribe(wav, api_key)
            transcript = result.get("transcript", "")
            s = score(i, transcript)
            rows.append({"id": i, "source": "synth", "lang": LANG[i],
                         "transcript": transcript, **s, "error": ""})
            print(f"[{i:02d}] {'FULL' if s['full_hit'] else 'MISS'}  {transcript[:70]}")
        except Exception as e:
            rows.append({"id": i, "source": "synth", "lang": LANG[i], "transcript": "",
                         "amount_hit": None, "party_hit": None, "type_hit": None,
                         "full_hit": False, "error": str(e)})
            print(f"[{i:02d}] ERROR {e}")
        time.sleep(0.3)

    out = RESULTS / "synth_results.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    scored = [r for r in rows if not r["error"]]
    amt = [r for r in scored if r["amount_hit"] is not None]
    full = [r for r in scored if r["full_hit"] is not None]
    print("\n===== SYNTH LOOP SUMMARY =====")
    print(f"Round-tripped:           {len(scored)}/{len(rows)}")
    if amt:
        print(f"Amount accuracy:         {100 * sum(r['amount_hit'] for r in amt) / len(amt):.0f}%  (target >= 90%)")
    if full:
        print(f"Full-transaction (auto): {100 * sum(r['full_hit'] for r in full) / len(full):.0f}%  (target >= 80%)")
    print(f"Results: {out}")


if __name__ == "__main__":
    main()
