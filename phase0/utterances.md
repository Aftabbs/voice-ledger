# Phase 0 — ASR Test Utterances (50)

Speak each line naturally into `record.html` on a phone, in a real shop-like
environment (fan, street noise, other voices). Do NOT speak slowly or clearly —
speak like a busy merchant would.

Columns: ID | Utterance to speak | Expected type | Expected party | Expected amount

## A. Credit sales — udhaar (core use case, 15)

| ID | Utterance | Type | Party | Amount |
|----|-----------|------|-------|--------|
| 01 | Ramesh ko paanch sau ka saman diya udhaar | credit | Ramesh | 500 |
| 02 | Suresh bhai ko do sau pachaas ka udhaar likh do | credit | Suresh | 250 |
| 03 | Sharma ji ne baarah sau ka maal liya baad mein denge | credit | Sharma ji | 1200 |
| 04 | Pooja ko teen sau ka kirana udhaar pe diya | credit | Pooja | 300 |
| 05 | Anil ko 750 ka saman udhaar | credit | Anil | 750 |
| 06 | Gupta ji ko ek hazaar ka maal diya credit pe | credit | Gupta ji | 1000 |
| 07 | Rekha didi ne sau rupay ka saman liya udhaar mein | credit | Rekha | 100 |
| 08 | Vijay ko saade chaar sau ka udhaar | credit | Vijay | 450 |
| 09 | Mohan lal ko pandrah sau ka saman baaki mein diya | credit | Mohan lal | 1500 |
| 10 | Kiran ko do sau ka doodh aur bread udhaar | credit | Kiran | 200 |
| 11 | Ashok bhai ka aaj ka udhaar chhe sau rupay | credit | Ashok | 600 |
| 12 | Santosh ko atta chawal diya total aath sau, udhaar likho | credit | Santosh | 800 |
| 13 | Meena ji ne 350 ka saman liya, paise baad mein | credit | Meena ji | 350 |
| 14 | Rahul ko nabbe rupay ka udhaar | credit | Rahul | 90 |
| 15 | Prakash ji ko dhai hazaar ka maal udhaar pe diya | credit | Prakash ji | 2500 |

## B. Payments received (10)

| ID | Utterance | Type | Party | Amount |
|----|-----------|------|-------|--------|
| 16 | Ramesh ne paanch sau de diye | payment | Ramesh | 500 |
| 17 | Suresh se do sau mile aaj | payment | Suresh | 200 |
| 18 | Sharma ji ne udhaar ka ek hazaar wapas kiya | payment | Sharma ji | 1000 |
| 19 | Pooja ne teen sau jama karaye | payment | Pooja | 300 |
| 20 | Anil se saat sau pachaas aa gaye | payment | Anil | 750 |
| 21 | Gupta ji ne poora hisaab clear kar diya, ek hazaar | payment | Gupta ji | 1000 |
| 22 | Vijay ne 450 cash diye | payment | Vijay | 450 |
| 23 | Mohan lal se paanch sau mile, hazaar abhi baaki | payment | Mohan lal | 500 |
| 24 | Kiran ne do sau lauta diye | payment | Kiran | 200 |
| 25 | Santosh se chaar sau received | payment | Santosh | 400 |

## C. Cash sales (8)

| ID | Utterance | Type | Party | Amount |
|----|-----------|------|-------|--------|
| 26 | Aaj ek sau saath ka cash sale hua | sale | — | 160 |
| 27 | Do sau ka saman becha cash mein | sale | — | 200 |
| 28 | Customer ne 85 rupay ka biscuit aur namkeen liya | sale | — | 85 |
| 29 | Paanch sau ka bill bana cash ka | sale | — | 500 |
| 30 | Tel aur sabun becha total 320 | sale | — | 320 |
| 31 | Ek grahak ne 1250 ka saman kharida | sale | — | 1250 |
| 32 | Sattar rupay ki maggi aur chips | sale | — | 70 |
| 33 | Aaj subah ka pehla sale 45 rupay | sale | — | 45 |

## D. Expenses (7)

| ID | Utterance | Type | Party | Amount |
|----|-----------|------|-------|--------|
| 34 | Aaj bijli ka bill bhara pandrah sau | expense | — | 1500 |
| 35 | Wholesale se maal aaya paanch hazaar ka | expense | — | 5000 |
| 36 | Tempo wale ko sau rupay diye | expense | — | 100 |
| 37 | Dukaan ka kiraya diya aath hazaar | expense | — | 8000 |
| 38 | Chai nashta kharcha pachaas rupay | expense | — | 50 |
| 39 | Ladke ki pagaar di teen hazaar | expense | — | 3000 |
| 40 | Recharge karaya do sau nintyanve ka | expense | — | 299 |

## E. Queries — the "talks back" feature (5)

| ID | Utterance | Type | Party | Amount |
|----|-----------|------|-------|--------|
| 41 | Ramesh ka kitna udhaar baaki hai | query_balance | Ramesh | — |
| 42 | Aaj ka total kitna hua | query_total | — | — |
| 43 | Sharma ji ka hisaab batao | query_balance | Sharma ji | — |
| 44 | Is mahine kitna udhaar diya total | query_total | — | — |
| 45 | Kis kis ka paisa baaki hai | query_list | — | — |

## F. Marathi sample — regional stress test (5)

| ID | Utterance | Type | Party | Amount |
|----|-----------|------|-------|--------|
| 46 | Rameshla paachshe rupayacha maal udhaar dila | credit | Ramesh | 500 |
| 47 | Sureshne donshe rupaye dile | payment | Suresh | 200 |
| 48 | Aaj tinshe rupayachi vikri jhali | sale | — | 300 |
| 49 | Light bill bharla hazaar rupaye | expense | — | 1000 |
| 50 | Rameshcha kiti udhaar baaki aahe | query_balance | Ramesh | — |

## Scoring (from PLAN.md)
- **Amount accuracy** (did the number survive transcription): target ≥ 90%
- **Full-transaction accuracy** (type + party + amount all recoverable): target ≥ 80%
- Record in at least 2 noise conditions: quiet room AND fan/street noise.
