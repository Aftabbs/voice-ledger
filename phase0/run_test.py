"""Phase 0 ASR accuracy test — sends recordings to Sarvam STT and scores results.

Usage:
    python run_test.py                  # transcribe phase0/recordings/*.webm
    python run_test.py --smoke FILE     # single-file connectivity check

Outputs phase0/results/transcripts.csv with per-utterance transcript,
amount-hit, party-hit, and type-keyword-hit columns, plus a summary.
"""

import argparse
import csv
import os
import re
import sys
import time
from pathlib import Path

import requests

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).parent
RECORDINGS = HERE / "recordings"
RESULTS = HERE / "results"
API_URL = "https://api.sarvam.ai/speech-to-text"
MODEL = "saaras:v3"

# Expected values per utterance id (1-based), from utterances.md
# (type, party, amount) — party/amount None where not applicable
EXPECTED = {
    1: ("credit", "ramesh", 500), 2: ("credit", "suresh", 250),
    3: ("credit", "sharma", 1200), 4: ("credit", "pooja", 300),
    5: ("credit", "anil", 750), 6: ("credit", "gupta", 1000),
    7: ("credit", "rekha", 100), 8: ("credit", "vijay", 450),
    9: ("credit", "mohan", 1500), 10: ("credit", "kiran", 200),
    11: ("credit", "ashok", 600), 12: ("credit", "santosh", 800),
    13: ("credit", "meena", 350), 14: ("credit", "rahul", 90),
    15: ("credit", "prakash", 2500),
    16: ("payment", "ramesh", 500), 17: ("payment", "suresh", 200),
    18: ("payment", "sharma", 1000), 19: ("payment", "pooja", 300),
    20: ("payment", "anil", 750), 21: ("payment", "gupta", 1000),
    22: ("payment", "vijay", 450), 23: ("payment", "mohan", 500),
    24: ("payment", "kiran", 200), 25: ("payment", "santosh", 400),
    26: ("sale", None, 160), 27: ("sale", None, 200),
    28: ("sale", None, 85), 29: ("sale", None, 500),
    30: ("sale", None, 320), 31: ("sale", None, 1250),
    32: ("sale", None, 70), 33: ("sale", None, 45),
    34: ("expense", None, 1500), 35: ("expense", None, 5000),
    36: ("expense", None, 100), 37: ("expense", None, 8000),
    38: ("expense", None, 50), 39: ("expense", None, 3000),
    40: ("expense", None, 299),
    41: ("query", "ramesh", None), 42: ("query", None, None),
    43: ("query", "sharma", None), 44: ("query", None, None),
    45: ("query", None, None),
    46: ("credit", "ramesh", 500), 47: ("payment", "suresh", 200),
    48: ("sale", None, 300), 49: ("expense", None, 1000),
    50: ("query", "ramesh", None),
}

# Hindi number words -> value, to catch transcripts that keep words instead of digits
NUMBER_WORDS = {
    "paanch sau": 500, "पांच सौ": 500, "पाँच सौ": 500,
    "do sau pachaas": 250, "ढाई सौ": 250,
    "baarah sau": 1200, "बारह सौ": 1200,
    "teen sau": 300, "तीन सौ": 300,
    "ek hazaar": 1000, "एक हज़ार": 1000, "एक हजार": 1000, "hazaar": 1000, "हज़ार": 1000,
    "sau": 100, "सौ": 100,
    "saade chaar sau": 450, "साढ़े चार सौ": 450,
    "pandrah sau": 1500, "पंद्रह सौ": 1500,
    "do sau": 200, "दो सौ": 200,
    "chhe sau": 600, "छह सौ": 600, "छे सौ": 600,
    "aath sau": 800, "आठ सौ": 800,
    "nabbe": 90, "नब्बे": 90,
    "dhai hazaar": 2500, "ढाई हज़ार": 2500, "ढाई हजार": 2500,
    "saat sau pachaas": 750, "सात सौ पचास": 750,
    "chaar sau": 400, "चार सौ": 400,
    "ek sau saath": 160, "एक सौ साठ": 160,
    "sattar": 70, "सत्तर": 70,
    "paanch hazaar": 5000, "पांच हज़ार": 5000, "पाँच हजार": 5000,
    "aath hazaar": 8000, "आठ हज़ार": 8000, "आठ हजार": 8000,
    "pachaas": 50, "पचास": 50,
    "teen hazaar": 3000, "तीन हज़ार": 3000, "तीन हजार": 3000,
    "paachshe": 500, "donshe": 200, "tinshe": 300,
}

PARTY_DEVANAGARI = {
    "ramesh": ["रमेश"], "suresh": ["सुरेश"], "sharma": ["शर्मा"],
    "pooja": ["पूजा"], "anil": ["अनिल"], "gupta": ["गुप्ता"],
    "rekha": ["रेखा"], "vijay": ["विजय"], "mohan": ["मोहन"],
    "kiran": ["किरण", "किरन"], "ashok": ["अशोक"], "santosh": ["संतोष"],
    "meena": ["मीना"], "rahul": ["राहुल"], "prakash": ["प्रकाश"],
}

TYPE_KEYWORDS = {
    "credit": ["udhaar", "udhar", "उधार", "baaki", "बाकी", "credit", "baad mein", "बाद में"],
    "payment": ["de diye", "mile", "wapas", "jama", "aa gaye", "clear", "lauta", "received",
                "दे दिए", "मिले", "वापस", "जमा", "आ गए", "लौटा", "dile", "दिले"],
    "sale": ["sale", "becha", "bill", "kharida", "बेचा", "बिल", "खरीदा", "vikri", "विक्री", "cash"],
    "expense": ["bill bhara", "kharcha", "kiraya", "pagaar", "recharge", "maal aaya", "diye",
                "बिल", "खर्चा", "किराया", "पगार", "रिचार्ज", "bharla", "भरला"],
    "query": ["kitna", "batao", "hisaab", "baaki hai", "कितना", "बताओ", "हिसाब", "kiti", "किती", "kis kis", "किस किस"],
}


def transcribe(path: Path, api_key: str) -> dict:
    with open(path, "rb") as f:
        resp = requests.post(
            API_URL,
            headers={"api-subscription-key": api_key},
            files={"file": (path.name, f, "audio/webm")},
            data={"model": MODEL},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.json()


def extract_amount(text: str):
    digits = [int(x) for x in re.findall(r"\d+", text.replace(",", ""))]
    words = [v for k, v in NUMBER_WORDS.items() if k in text.lower()]
    return digits, words


def score(utt_id: int, transcript: str) -> dict:
    exp_type, exp_party, exp_amount = EXPECTED[utt_id]
    t = transcript.lower()

    amount_hit = None
    if exp_amount is not None:
        digits, words = extract_amount(transcript)
        amount_hit = exp_amount in digits or exp_amount in words

    party_hit = None
    if exp_party is not None:
        variants = [exp_party] + PARTY_DEVANAGARI.get(exp_party, [])
        party_hit = any(v in t for v in variants)

    type_hit = any(kw in t for kw in TYPE_KEYWORDS[exp_type])

    parts = [p for p in (amount_hit, party_hit, type_hit) if p is not None]
    return {
        "amount_hit": amount_hit, "party_hit": party_hit, "type_hit": type_hit,
        "full_hit": all(parts) if parts else None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", metavar="FILE", help="single-file connectivity check")
    args = parser.parse_args()

    api_key = os.environ.get("SARVAM_API_KEY")
    if not api_key:
        env = HERE.parent / ".env"
        if env.exists():
            for line in env.read_text().splitlines():
                if line.startswith("SARVAM_API_KEY="):
                    api_key = line.split("=", 1)[1].strip()
    if not api_key:
        sys.exit("SARVAM_API_KEY not found in environment or ../.env")

    if args.smoke:
        result = transcribe(Path(args.smoke), api_key)
        print("API OK. request_id:", result.get("request_id"))
        print("language:", result.get("language_code"))
        print("transcript:", result.get("transcript"))
        return

    files = sorted(RECORDINGS.glob("utt_*.webm"))
    if not files:
        sys.exit(f"No recordings found in {RECORDINGS}. Record with record.html first.")

    RESULTS.mkdir(exist_ok=True)
    rows = []
    for path in files:
        utt_id = int(re.search(r"utt_(\d+)", path.name).group(1))
        try:
            result = transcribe(path, api_key)
            transcript = result.get("transcript", "")
            s = score(utt_id, transcript)
            rows.append({"id": utt_id, "file": path.name, "transcript": transcript,
                         "language": result.get("language_code"), **s, "error": ""})
            print(f"[{utt_id:02d}] {'FULL' if s['full_hit'] else 'MISS'}  {transcript[:70]}")
        except Exception as e:
            rows.append({"id": utt_id, "file": path.name, "transcript": "",
                         "language": "", "amount_hit": None, "party_hit": None,
                         "type_hit": None, "full_hit": False, "error": str(e)})
            print(f"[{utt_id:02d}] ERROR {e}")
        time.sleep(0.5)  # be polite to the API

    out = RESULTS / "transcripts.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    scored = [r for r in rows if not r["error"]]
    amt = [r for r in scored if r["amount_hit"] is not None]
    full = [r for r in scored if r["full_hit"] is not None]
    print("\n===== PHASE 0 SUMMARY =====")
    print(f"Transcribed:            {len(scored)}/{len(rows)}")
    if amt:
        pct = 100 * sum(r['amount_hit'] for r in amt) / len(amt)
        print(f"Amount accuracy:        {pct:.0f}%  (target >= 90%)")
    if full:
        pct = 100 * sum(r['full_hit'] for r in full) / len(full)
        print(f"Full-transaction (auto): {pct:.0f}%  (target >= 80%; review misses manually — transliteration variance causes false negatives)")
    print(f"Results: {out}")


if __name__ == "__main__":
    main()
