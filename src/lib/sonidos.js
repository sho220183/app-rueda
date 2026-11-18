// Sonidos del sorteo, sintetizados con Web Audio (sin archivos que descargar).
//  - tic():      la clavija del aro golpeando el puntero (madera, corto).
//  - arranque(): soplido suave cuando la rueda empieza a girar.
//  - arpegio():  arpegio de arpa (síntesis Karplus-Strong) al revelar el ganador,
//                un guiño a la arpa paraguaya.
// El AudioContext se crea recién con un clic del usuario (requisito de los
// navegadores) y la preferencia de silencio se recuerda en el dispositivo.

const CLAVE = 'rueda.sonido'
let ctx = null
let master = null
let ultimoTic = 0
const cacheCuerdas = new Map()

export function sonidoActivado() {
  try {
    return localStorage.getItem(CLAVE) !== 'off'
  } catch {
    return true
  }
}

export function setSonidoActivado(activo) {
  try {
    localStorage.setItem(CLAVE, activo ? 'on' : 'off')
  } catch {
    /* sin almacenamiento: vale solo para esta visita */
  }
  if (master) master.gain.value = activo ? 0.5 : 0
}

/** Llamar dentro de un clic: crea/reanuda el contexto de audio. */
export function prepararAudio() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = sonidoActivado() ? 0.5 : 0
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function listo() {
  return ctx && master && sonidoActivado()
}

export function tic(intensidad = 1) {
  if (!listo()) return
  const ahora = ctx.currentTime
  // Más de ~28 tics por segundo se vuelve un zumbido: los agrupamos.
  if (ahora - ultimoTic < 0.035) return
  ultimoTic = ahora

  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'triangle'
  const f = 1500 + Math.random() * 250
  osc.frequency.setValueAtTime(f, ahora)
  osc.frequency.exponentialRampToValueAtTime(f * 0.45, ahora + 0.03)
  g.gain.setValueAtTime(0.0001, ahora)
  g.gain.exponentialRampToValueAtTime(0.22 * intensidad, ahora + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.045)
  osc.connect(g).connect(master)
  osc.start(ahora)
  osc.stop(ahora + 0.05)
}

export function arranque() {
  if (!listo()) return
  const ahora = ctx.currentTime
  const dur = 0.7
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  const src = ctx.createBufferSource()
  src.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.2
  bp.frequency.setValueAtTime(350, ahora)
  bp.frequency.exponentialRampToValueAtTime(1400, ahora + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, ahora)
  g.gain.exponentialRampToValueAtTime(0.09, ahora + 0.25)
  g.gain.exponentialRampToValueAtTime(0.0001, ahora + dur)
  src.connect(bp).connect(g).connect(master)
  src.start(ahora)
}

// Cuerda pulsada (Karplus-Strong): ruido que se realimenta con un retardo
// igual al período de la nota y se va apagando, como una cuerda de arpa.
function cuerda(freq, dur = 2.2) {
  const clave = `${freq}-${dur}`
  if (cacheCuerdas.has(clave)) return cacheCuerdas.get(clave)
  const sr = ctx.sampleRate
  const n = Math.floor(sr * dur)
  const periodo = Math.max(2, Math.round(sr / freq))
  const buf = ctx.createBuffer(1, n, sr)
  const y = buf.getChannelData(0)
  let previo = 0
  for (let i = 0; i < periodo; i++) {
    // Ruido suavizado: ataque más cálido, menos "metálico".
    previo = previo * 0.55 + (Math.random() * 2 - 1) * 0.45
    y[i] = previo
  }
  const amortiguacion = 0.996
  for (let i = periodo; i < n; i++) {
    // Promedio de dos muestras del ciclo anterior = filtro pasa-bajos que apaga los agudos.
    y[i] = amortiguacion * 0.5 * (y[i - periodo] + y[i - periodo + 1])
  }
  cacheCuerdas.set(clave, buf)
  return buf
}

function pulsar(freq, cuando, volumen) {
  const src = ctx.createBufferSource()
  src.buffer = cuerda(freq)
  const g = ctx.createGain()
  g.gain.value = volumen
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
  if (pan) {
    pan.pan.value = Math.max(-0.6, Math.min(0.6, (Math.log2(freq / 440) - 0.3) * 0.5))
    src.connect(g).connect(pan).connect(master)
  } else {
    src.connect(g).connect(master)
  }
  src.start(cuando)
}

/** Glissando ascendente en Re mayor y acorde final. */
export function arpegio() {
  if (!listo()) return
  const t0 = ctx.currentTime + 0.02
  const notas = [146.83, 220.0, 293.66, 369.99, 440.0, 587.33, 739.99, 880.0]
  notas.forEach((f, i) => pulsar(f, t0 + i * 0.075, 0.5))
  const acorde = t0 + notas.length * 0.075 + 0.12
  ;[293.66, 369.99, 440.0, 587.33].forEach((f, i) => pulsar(f, acorde + i * 0.012, 0.42))
}
