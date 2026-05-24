let ctx = null

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function playClick() {
  try {
    const c = getCtx()
    const t = c.currentTime
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.12, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
    osc.start(t)
    osc.stop(t + 0.06)
  } catch {}
}

export function playLifeLost() {
  try {
    const c = getCtx()
    const t = c.currentTime

    // Crack burst (white noise)
    const bufSize = Math.floor(c.sampleRate * 0.12)
    const buf = c.createBuffer(1, bufSize, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
    const noise = c.createBufferSource()
    noise.buffer = buf
    const noiseGain = c.createGain()
    noiseGain.gain.setValueAtTime(0.35, t)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    noise.connect(noiseGain)
    noiseGain.connect(c.destination)
    noise.start(t)

    // Deep descending thud
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, t)
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.45)
    gain.gain.setValueAtTime(0.55, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
    osc.start(t)
    osc.stop(t + 0.5)
  } catch {}
}
