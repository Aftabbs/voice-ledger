import Dexie from 'dexie'

// All ledger data lives on the merchant's device. Nothing is stored server-side.
export const db = new Dexie('voiceledger')

db.version(1).stores({
  transactions: '++id, ts, type, party',
})

function toAmount(amount) {
  if (amount == null || amount === '') return null
  const n = Number(amount)
  return Number.isFinite(n) ? n : null
}

export async function addTransaction({ type, party, amount, note, transcript }) {
  return db.transactions.add({
    ts: Date.now(),
    type,
    party: party || null,
    amount: toAmount(amount),
    note: note || null,
    transcript: transcript || null,
  })
}

export async function partyBalances() {
  const txns = await db.transactions.where('type').anyOf('credit', 'payment').toArray()
  const balances = {}
  for (const t of txns) {
    if (!t.party || t.amount == null) continue
    const key = t.party.trim()
    balances[key] = (balances[key] ?? 0) + (t.type === 'credit' ? t.amount : -t.amount)
  }
  return Object.entries(balances)
    .map(([party, balance]) => ({ party, balance }))
    .sort((a, b) => b.balance - a.balance)
}

export function normalizeName(name) {
  return (name || '').trim().toLowerCase().replace(/\s+(ji|जी|bhai|भाई|didi|दीदी|lal|लाल)$/i, '')
}

export async function balanceFor(party) {
  const all = await partyBalances()
  const target = normalizeName(party)
  const hit = all.find((b) => normalizeName(b.party) === target)
    ?? all.find((b) => normalizeName(b.party).includes(target) || target.includes(normalizeName(b.party)))
  return hit ?? null
}

export async function todayTotals() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const txns = await db.transactions.where('ts').aboveOrEqual(start.getTime()).toArray()
  const sum = (type) => txns.filter((t) => t.type === type && t.amount != null)
    .reduce((acc, t) => acc + t.amount, 0)
  return {
    sales: sum('sale'),
    creditGiven: sum('credit'),
    paymentsIn: sum('payment'),
    expenses: sum('expense'),
    count: txns.length,
  }
}
