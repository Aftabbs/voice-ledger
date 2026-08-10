const CLIENT_TIMEOUT_MS = 25_000

export async function captureAudio(blob) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
  try {
    const resp = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
      signal: controller.signal,
    })
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}))
      throw new Error(body.error || `Server error ${resp.status}`)
    }
    return resp.json() // { transcript, parsed }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('जवाब आने में बहुत समय लगा, फिर कोशिश करें')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
