import { useEffect, useRef, useState } from 'react'
import { captureAudio } from './api'
import { addTransaction, balanceFor, db, partyBalances, todayTotals } from './db'
import './App.css'

const TYPE_LABEL = {
  credit: { hi: 'उधार दिया', color: 'var(--credit)' },
  payment: { hi: 'पैसे मिले', color: 'var(--payment)' },
  sale: { hi: 'बिक्री', color: 'var(--sale)' },
  expense: { hi: 'खर्चा', color: 'var(--expense)' },
}

function speak(text) {
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'hi-IN'
    u.rate = 0.95
    window.speechSynthesis.speak(u)
  } catch { /* speech optional */ }
}

const fmt = (n) => '₹' + (n ?? 0).toLocaleString('en-IN')

export default function App() {
  const [view, setView] = useState('home') // home | ledger | parties
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null) // { transcript, parsed }
  const [answer, setAnswer] = useState(null)
  const [error, setError] = useState(null)
  const [totals, setTotals] = useState(null)
  const [txns, setTxns] = useState([])
  const [balances, setBalances] = useState([])
  const recorderRef = useRef(null)

  const refresh = async () => {
    setTotals(await todayTotals())
    setTxns(await db.transactions.orderBy('ts').reverse().limit(50).toArray())
    setBalances(await partyBalances())
  }
  useEffect(() => { refresh() }, [])

  async function answerQuery(parsed) {
    if (parsed.type === 'query_balance' && parsed.party) {
      const hit = await balanceFor(parsed.party)
      return hit
        ? `${hit.party} का ${fmt(hit.balance)} बाकी है`
        : `${parsed.party} का कोई उधार नहीं मिला`
    }
    if (parsed.type === 'query_total') {
      const t = await todayTotals()
      return `आज की बिक्री ${fmt(t.sales)}, उधार दिया ${fmt(t.creditGiven)}, पैसे आए ${fmt(t.paymentsIn)}, खर्चा ${fmt(t.expenses)}`
    }
    if (parsed.type === 'query_list') {
      const all = (await partyBalances()).filter((b) => b.balance > 0)
      if (!all.length) return 'किसी का उधार बाकी नहीं है'
      return all.slice(0, 5).map((b) => `${b.party} ${fmt(b.balance)}`).join(', ') + ' बाकी है'
    }
    return null
  }

  async function toggleRecord() {
    setError(null); setAnswer(null)
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks = []
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      rec.ondataavailable = (e) => chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        setBusy(true)
        try {
          const { transcript, parsed } = await captureAudio(new Blob(chunks, { type: 'audio/webm' }))
          if (parsed.type?.startsWith('query')) {
            const reply = await answerQuery(parsed)
            setAnswer({ transcript, reply })
            if (reply) speak(reply)
          } else if (parsed.type && parsed.type !== 'unknown') {
            setPending({ transcript, parsed })
            const label = TYPE_LABEL[parsed.type]?.hi ?? parsed.type
            speak(`${parsed.party ?? ''} ${parsed.amount ?? ''} रुपये ${label}. ठीक है?`)
          } else {
            setError(transcript ? `समझ नहीं आया: "${transcript}"` : 'कुछ सुनाई नहीं दिया, फिर बोलें')
          }
        } catch (e) {
          setError(e.message)
        } finally {
          setBusy(false)
        }
      }
      recorderRef.current = rec
      rec.start()
      setRecording(true)
    } catch {
      setError('माइक की अनुमति चाहिए (mic permission needed)')
    }
  }

  async function confirmPending() {
    const { transcript, parsed } = pending
    await addTransaction({ ...parsed, transcript })
    setPending(null)
    speak('लिख लिया')
    refresh()
  }

  return (
    <div className="shell">
      <header>
        <h1>Voice<span>Ledger</span></h1>
        <p className="tagline">बोलो, हिसाब हो गया</p>
      </header>

      {view === 'home' && (
        <main>
          {totals && (
            <section className="today" aria-label="आज का हिसाब">
              <div className="stat"><span>बिक्री</span><strong>{fmt(totals.sales)}</strong></div>
              <div className="stat"><span>उधार दिया</span><strong>{fmt(totals.creditGiven)}</strong></div>
              <div className="stat"><span>पैसे आए</span><strong>{fmt(totals.paymentsIn)}</strong></div>
              <div className="stat"><span>खर्चा</span><strong>{fmt(totals.expenses)}</strong></div>
            </section>
          )}

          <button
            className={`mic ${recording ? 'recording' : ''}`}
            onClick={toggleRecord}
            disabled={busy}
            aria-label={recording ? 'रिकॉर्डिंग बंद करें' : 'बोलना शुरू करें'}
          >
            {busy ? '…' : recording ? '⏹' : '🎙'}
          </button>
          <p className="hint" aria-live="polite">
            {busy ? 'समझ रहे हैं…' : recording ? 'बोलिए… फिर बटन दबाएँ' : 'बटन दबाकर बोलें — "रमेश को 500 का उधार"'}
          </p>

          {error && <div className="card error" role="alert">{error}</div>}

          {answer && (
            <div className="card answer" role="status">
              <p className="transcript">"{answer.transcript}"</p>
              <p className="reply">{answer.reply ?? 'कोई जानकारी नहीं मिली'}</p>
            </div>
          )}

          {pending && (
            <div className="card confirm" role="dialog" aria-label="पुष्टि करें">
              <p className="transcript">"{pending.transcript}"</p>
              <div className="parsed">
                <span className="type" style={{ color: TYPE_LABEL[pending.parsed.type]?.color }}>
                  {TYPE_LABEL[pending.parsed.type]?.hi ?? pending.parsed.type}
                </span>
                {pending.parsed.party && <strong>{pending.parsed.party}</strong>}
                {pending.parsed.amount != null && <strong className="amount">{fmt(pending.parsed.amount)}</strong>}
              </div>
              {pending.parsed.note && <p className="note">{pending.parsed.note}</p>}
              <div className="actions">
                <button className="ok" onClick={confirmPending}>✓ ठीक है</button>
                <button className="cancel" onClick={() => setPending(null)}>✗ नहीं</button>
              </div>
            </div>
          )}
        </main>
      )}

      {view === 'ledger' && (
        <main>
          <h2>हिसाब किताब</h2>
          {txns.length === 0 && <p className="hint">अभी कोई एंट्री नहीं</p>}
          <ul className="txns">
            {txns.map((t) => (
              <li key={t.id}>
                <span className="type" style={{ color: TYPE_LABEL[t.type]?.color }}>
                  {TYPE_LABEL[t.type]?.hi ?? t.type}
                </span>
                <span className="party">{t.party ?? (t.note ?? '—')}</span>
                <span className="amount">{t.amount != null ? fmt(t.amount) : ''}</span>
                <span className="time">{new Date(t.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        </main>
      )}

      {view === 'parties' && (
        <main>
          <h2>किसका कितना बाकी</h2>
          {balances.filter((b) => b.balance !== 0).length === 0 && <p className="hint">कोई उधार बाकी नहीं</p>}
          <ul className="txns">
            {balances.filter((b) => b.balance !== 0).map((b) => (
              <li key={b.party}>
                <span className="party">{b.party}</span>
                <span className="amount" style={{ color: b.balance > 0 ? 'var(--credit)' : 'var(--payment)' }}>
                  {fmt(Math.abs(b.balance))} {b.balance > 0 ? 'बाकी' : 'एडवांस'}
                </span>
              </li>
            ))}
          </ul>
        </main>
      )}

      <nav aria-label="मुख्य नेविगेशन">
        <button className={view === 'home' ? 'active' : ''} onClick={() => { setView('home'); refresh() }}>🎙 बोलो</button>
        <button className={view === 'ledger' ? 'active' : ''} onClick={() => { setView('ledger'); refresh() }}>📒 हिसाब</button>
        <button className={view === 'parties' ? 'active' : ''} onClick={() => { setView('parties'); refresh() }}>👥 उधार</button>
      </nav>
    </div>
  )
}
