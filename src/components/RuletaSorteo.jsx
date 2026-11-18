import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatMonto, recortar } from '../lib/formato.js'
import { buildWaLink } from '../lib/whatsapp.js'
import { arpegio, arranque, prepararAudio, setSonidoActivado, sonidoActivado, tic } from '../lib/sonidos.js'
import { IconoCerrar, IconoMensaje, IconoRueda, IconoSilencio, IconoSonido } from './Iconos.jsx'

// Ceremonia del sorteo en tres tiempos:
//  1. "listo":    la rueda con todos los nombres, para mostrarla al grupo antes de girar.
//  2. "girando":  gira mientras el servidor elige al ganador; cuando llega el resultado
//                 frena de verdad sobre ese segmento. Cada clavija del aro hace "tic"
//                 al pasar por el puntero (el sonido sigue al movimiento real).
//  3. "revelado": el ganador, el monto y la semilla para auditar el sorteo.

const TAM = 340
const C = TAM / 2
const R = 150 // radio de los segmentos
const R_ARO = 160
const R_CENTRO = 48
const VEL_MAX = 560 // grados por segundo
const ACELERACION_MS = 450
const GIRO_MINIMO_MS = 1500
const FRENADO_S = 3.6

const COLORES = [
  { fondo: '#1B4B43', texto: '#F6EFDC' },
  { fondo: '#C9962B', texto: '#0F332C' },
  { fondo: '#2F6D62', texto: '#F6EFDC' },
  { fondo: '#E8C77A', texto: '#0F332C' }
]

function colorSegmento(i, n) {
  // Evita que el último segmento quede del mismo color que el primero.
  if (n > 1 && i === n - 1 && n % 4 === 1) return COLORES[2]
  return COLORES[i % 4]
}

function punto(angulo, radio) {
  const a = ((angulo - 90) * Math.PI) / 180
  return [C + radio * Math.cos(a), C + radio * Math.sin(a)]
}

function caminoSegmento(a0, a1) {
  const [x0, y0] = punto(a0, R)
  const [x1, y1] = punto(a1, R)
  const grande = a1 - a0 > 180 ? 1 : 0
  return `M ${C} ${C} L ${x0} ${y0} A ${R} ${R} 0 ${grande} 1 ${x1} ${y1} Z`
}

const mod = (a, m) => ((a % m) + m) % m

function usePrefiereMenosMovimiento() {
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const cambio = (e) => setReduce(e.matches)
    mq.addEventListener?.('change', cambio)
    return () => mq.removeEventListener?.('change', cambio)
  }, [])
  return reduce
}

export default function RuletaSorteo({ participantes, rueda, montoEstimado, onGirar, onCerrar }) {
  const menosMovimiento = usePrefiereMenosMovimiento()
  const [fase, setFase] = useState('listo') // listo | girando | revelado | error
  const [lista, setLista] = useState(participantes)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [montoVisible, setMontoVisible] = useState(0)
  const [sonido, setSonido] = useState(sonidoActivado)
  const [puedeSaltar, setPuedeSaltar] = useState(false)

  const ruedaRef = useRef(null)
  const punteroRef = useRef(null)
  const botonRef = useRef(null)
  const estado = useRef({ angulo: 0, vel: 0, plan: null, pendiente: null, inicio: 0, ultimo: 0, clavija: 0, golpe: 0, raf: 0 })

  const listaRef = useRef(lista)
  listaRef.current = lista
  const n = Math.max(lista.length, 1)
  const seg = 360 / n
  const clavijasPorSegmento = Math.max(1, Math.ceil(18 / n))
  const pasoClavija = seg / clavijasPorSegmento
  const pasoClavijaRef = useRef(pasoClavija)
  pasoClavijaRef.current = pasoClavija
  // Espacio radial entre el aro y el centro fijo: la letra se achica para que
  // el nombre entre completo y solo se recorta si ni así alcanza.
  const largoDisponible = R - 16 - R_CENTRO - 10
  const tamMaximo = n <= 4 ? 16 : n <= 10 ? 14 : 12
  function letraPara(nombre) {
    const largo = Math.max(1, String(nombre || '').length)
    const tam = Math.max(10.5, Math.min(tamMaximo, largoDisponible / (largo * 0.56)))
    return { tam, texto: recortar(nombre, Math.floor(largoDisponible / (tam * 0.56))) }
  }
  const ganador = resultado ? lista.find((p) => p.id === resultado.ganador_id) : null
  const idxGanador = ganador ? lista.indexOf(ganador) : -1

  // Bloquea el scroll de la página mientras dura la ceremonia.
  useEffect(() => {
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previo
      cancelAnimationFrame(estado.current.raf)
    }
  }, [])

  useEffect(() => {
    botonRef.current?.focus()
  }, [fase])

  const cerrar = useCallback(() => onCerrar(!!resultado), [onCerrar, resultado])

  useEffect(() => {
    function tecla(e) {
      if (e.key === 'Escape' && fase !== 'girando') cerrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fase, cerrar])

  function aplicarAngulo(angulo, ahora) {
    const s = estado.current
    if (ruedaRef.current) ruedaRef.current.style.transform = `rotate(${angulo}deg)`
    const clavija = Math.floor(angulo / pasoClavijaRef.current)
    if (clavija !== s.clavija) {
      s.clavija = clavija
      s.golpe = ahora
      tic(Math.min(1, 0.45 + s.vel / VEL_MAX))
    }
    if (punteroRef.current) {
      punteroRef.current.style.transform = ahora - s.golpe < 40 ? 'rotate(-20deg)' : 'rotate(0deg)'
    }
  }

  // Calcula el frenado para que la rueda se detenga sobre el ganador sin
  // cambiar bruscamente de velocidad (curva ease-out cúbica).
  function planificarFrenado(res, ahora) {
    const s = estado.current
    const ids = res.participantes?.length ? res.participantes : listaRef.current.map((p) => p.id)
    const segActual = 360 / Math.max(ids.length, 1)
    const idx = Math.max(0, ids.indexOf(res.ganador_id))
    const centro = (idx + 0.5) * segActual + (Math.random() - 0.5) * segActual * 0.55
    const destinoMod = mod(360 - centro, 360)
    const vel = Math.max(s.vel, 240)
    const minimo = s.angulo + (vel * FRENADO_S) / 3
    const fin = minimo + mod(destinoMod - minimo, 360)
    const distancia = fin - s.angulo
    s.plan = { ini: s.angulo, fin, distancia, t0: ahora, dur: ((3 * distancia) / vel) * 1000, alTerminar: 'revelar' }
  }

  function revelar() {
    setFase('revelado')
    arpegio()
  }

  const paso = useCallback(
    (ahora) => {
      const s = estado.current
      const dt = Math.min(64, ahora - (s.ultimo || ahora))
      s.ultimo = ahora

      if (!s.plan && s.pendiente && ahora - s.inicio >= GIRO_MINIMO_MS) {
        if (s.pendiente.error) {
          const vel = Math.max(s.vel, 120)
          s.plan = { ini: s.angulo, fin: s.angulo + (vel * 1.1) / 3, t0: ahora, dur: 1100, alTerminar: 'error' }
          s.plan.distancia = s.plan.fin - s.plan.ini
        } else {
          planificarFrenado(s.pendiente, ahora)
        }
      }

      if (s.plan) {
        const t = Math.min(1, (ahora - s.plan.t0) / s.plan.dur)
        const previo = s.angulo
        s.angulo = s.plan.ini + s.plan.distancia * (1 - Math.pow(1 - t, 3))
        s.vel = dt > 0 ? ((s.angulo - previo) / dt) * 1000 : 0
        aplicarAngulo(s.angulo, ahora)
        if (t >= 1) {
          const final = s.plan.alTerminar
          s.plan = null
          s.vel = 0
          if (punteroRef.current) punteroRef.current.style.transform = 'rotate(0deg)'
          if (final === 'revelar') setTimeout(revelar, 380)
          else setFase('error')
          return
        }
      } else {
        s.vel = Math.min(VEL_MAX, s.vel + (VEL_MAX * dt) / ACELERACION_MS)
        s.angulo += (s.vel * dt) / 1000
        aplicarAngulo(s.angulo, ahora)
      }
      s.raf = requestAnimationFrame(paso)
    },
    // Lee todo desde refs: el mismo loop sirve aunque la lista cambie a mitad del giro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  async function girar() {
    prepararAudio()
    setError('')
    setFase('girando')
    const s = estado.current
    s.pendiente = null
    s.plan = null
    s.inicio = performance.now()
    s.ultimo = 0

    if (!menosMovimiento) {
      arranque()
      s.raf = requestAnimationFrame(paso)
    }

    let res
    try {
      res = await onGirar()
    } catch (e) {
      setError(e?.message || 'No se pudo realizar el sorteo.')
      if (menosMovimiento) setFase('error')
      else s.pendiente = { error: true }
      return
    }

    // Si el servidor sorteó con una lista distinta (alguien cambió los
    // integrantes recién), la rueda pasa a mostrar exactamente esa lista.
    const ids = res.participantes || []
    if (ids.length && ids.join() !== lista.map((p) => p.id).join()) {
      const porId = Object.fromEntries(lista.map((p) => [p.id, p]))
      setLista(ids.map((id) => porId[id] || { id, nombre: '—' }))
    }
    setResultado(res)

    if (menosMovimiento) {
      const idx = ids.indexOf(res.ganador_id)
      const angulo = mod(360 - (idx + 0.5) * (360 / Math.max(ids.length, 1)), 360)
      if (ruedaRef.current) ruedaRef.current.style.transform = `rotate(${angulo}deg)`
      revelar()
    } else {
      s.pendiente = res
      setPuedeSaltar(true)
    }
  }

  function saltar() {
    const s = estado.current
    if (!s.pendiente || s.pendiente.error) return
    if (!s.plan) planificarFrenado(s.pendiente, performance.now())
    s.plan.t0 = -Infinity // la próxima vuelta del loop lo da por terminado
  }

  // El monto sube hasta su valor final al revelar.
  useEffect(() => {
    if (fase !== 'revelado' || !resultado) return
    const total = Number(resultado.monto) || 0
    if (menosMovimiento) {
      setMontoVisible(total)
      return
    }
    let raf
    const t0 = performance.now()
    const subir = (ahora) => {
      const t = Math.min(1, (ahora - t0) / 1100)
      setMontoVisible(Math.round(total * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(subir)
    }
    raf = requestAnimationFrame(subir)
    return () => cancelAnimationFrame(raf)
  }, [fase, resultado, menosMovimiento])

  function alternarSonido() {
    const nuevo = !sonido
    setSonido(nuevo)
    setSonidoActivado(nuevo)
    if (nuevo) prepararAudio()
  }

  const papelitos = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        dur: 2.6 + Math.random() * 1.6,
        dx: `${(Math.random() - 0.5) * 160}px`,
        rot: `${(Math.random() - 0.5) * 1080}deg`,
        color: ['#C9962B', '#E8C77A', '#F6EFDC', '#2F6D62'][i % 4],
        w: 5 + Math.random() * 4,
        h: 9 + Math.random() * 6
      })),
    []
  )

  const linkWhatsApp =
    ganador?.telefono && resultado
      ? buildWaLink(
          ganador.telefono,
          `Hola ${ganador.nombre.split(' ')[0]}! Salió tu número en la rueda "${rueda.nombre}". Te corresponde ${formatMonto(
            resultado.monto,
            rueda.moneda
          )}. ¡Felicitaciones!`
        )
      : null

  const revelado = fase === 'revelado'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sorteo-titulo"
      className="sorteo-escena fixed inset-0 z-50 flex flex-col overflow-y-auto no-print"
    >
      {revelado &&
        !menosMovimiento &&
        papelitos.map((p) => (
          <span
            key={p.id}
            aria-hidden="true"
            className="papelito"
            style={{
              left: `${p.left}%`,
              width: p.w,
              height: p.h,
              backgroundColor: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              '--dx': p.dx,
              '--rot': p.rot
            }}
          />
        ))}

      <header className="relative z-[2] flex items-start justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="min-w-0">
          <p id="sorteo-titulo" className="font-display text-xl text-crema truncate">
            {rueda.nombre}
          </p>
          <p className="text-sm text-crema/70 font-tabular">
            Sorteo del ciclo {rueda.ciclo_actual}, período {rueda.periodo_actual}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={alternarSonido}
            aria-pressed={sonido}
            aria-label={sonido ? 'Silenciar el sorteo' : 'Activar el sonido del sorteo'}
            className="sorteo-boton-icono"
          >
            {sonido ? <IconoSonido /> : <IconoSilencio />}
          </button>
          {fase !== 'girando' && (
            <button type="button" onClick={cerrar} aria-label="Cerrar" className="sorteo-boton-icono">
              <IconoCerrar />
            </button>
          )}
        </div>
      </header>

      <div className="relative z-[2] flex-1 flex flex-col items-center justify-center px-5 pb-8 pt-4">
        <div className={`sorteo-rueda ${revelado ? 'sorteo-rueda--revelada' : ''}`}>
          {/* Puntero fijo: se dobla cuando una clavija lo golpea. */}
          <div className="sorteo-puntero" aria-hidden="true">
            <svg ref={punteroRef} width="34" height="46" viewBox="0 0 34 46" style={{ transformOrigin: '17px 10px' }}>
              <circle cx="17" cy="10" r="8" fill="#0F332C" stroke="#E8C77A" strokeWidth="2" />
              <path d="M17 44 7 14h20z" fill="#E8C77A" stroke="#0F332C" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>

          <div ref={ruedaRef} className="sorteo-disco">
            <svg
              viewBox={`0 0 ${TAM} ${TAM}`}
              width="100%"
              height="100%"
              role="img"
              aria-label={`Rueda con ${lista.length} participantes: ${lista.map((p) => p.nombre).join(', ')}`}
            >
              <circle cx={C} cy={C} r={R_ARO + 8} fill="#0B2621" />
              <circle cx={C} cy={C} r={R_ARO} fill="#0F332C" />
              {n === 1 ? (
                <circle cx={C} cy={C} r={R} fill={COLORES[0].fondo} />
              ) : (
                lista.map((p, i) => {
                  const color = colorSegmento(i, n)
                  const apagado = revelado && i !== idxGanador
                  return (
                    <path
                      key={p.id}
                      d={caminoSegmento(i * seg, (i + 1) * seg)}
                      stroke="#0F332C"
                      strokeWidth="1.5"
                      className="sorteo-segmento"
                      // Al revelar, el resto de los segmentos pasa a verde oscuro (sin transparencia, que ensucia el dorado).
                      style={{ fill: apagado ? (i % 2 ? '#123A33' : '#163F38') : color.fondo }}
                    />
                  )
                })
              )}

              {lista.map((p, i) => {
                const medio = i * seg + seg / 2
                const color = colorSegmento(i, n)
                const apagado = revelado && i !== idxGanador
                const { tam, texto } = letraPara(p.nombre)
                return (
                  <g key={`t-${p.id}`} transform={`rotate(${medio} ${C} ${C})`} className="sorteo-segmento" style={{ opacity: apagado ? 0.45 : 1 }}>
                    <text
                      x={C}
                      y={C - R + 16}
                      transform={`rotate(90 ${C} ${C - R + 16})`}
                      dominantBaseline="middle"
                      fill={apagado ? '#F6EFDC' : color.texto}
                      fontFamily="'Public Sans', sans-serif"
                      fontWeight="600"
                      fontSize={tam}
                    >
                      {texto}
                    </text>
                  </g>
                )
              })}

              {/* Clavijas del aro: cada una produce un "tic" al pasar por el puntero. */}
              {Array.from({ length: n * clavijasPorSegmento }, (_, k) => {
                const [x, y] = punto(k * pasoClavija, R_ARO - 4)
                const limite = k % clavijasPorSegmento === 0
                return <circle key={k} cx={x} cy={y} r={limite ? 3.2 : 2} fill={limite ? '#E8C77A' : '#C9962B'} />
              })}
            </svg>
          </div>

          {/* Centro fijo: no gira, para que el fondo se lea siempre. */}
          <div className="sorteo-centro" aria-hidden="true">
            {(() => {
              const [prefijo, ...resto] = formatMonto(resultado?.monto ?? montoEstimado, rueda.moneda).split(' ')
              return (
                <>
                  <span className="text-[11px] text-crema/70 leading-none">Fondo {prefijo}</span>
                  <span className="mt-1 font-mono font-tabular text-[clamp(11px,3.4vw,14px)] font-semibold text-gold-light leading-none whitespace-nowrap">
                    {resto.join(' ')}
                  </span>
                </>
              )
            })()}
          </div>
        </div>

        <div
          className={`w-full max-w-md text-center min-h-[11rem] transition-[margin] duration-700 ${revelado ? '-mt-12' : 'mt-8'}`}
          aria-live="polite"
        >
          {fase === 'listo' && (
            <div className="sorteo-aparecer">
              <p className="text-crema/80 text-[15px]">
                {lista.length} {lista.length === 1 ? 'participante elegible' : 'participantes elegibles'}. El servidor
                elige al ganador al azar y la rueda frena sobre su nombre.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button ref={botonRef} type="button" onClick={girar} className="sorteo-boton-principal">
                  <IconoRueda />
                  Girar la rueda
                </button>
                <button type="button" onClick={cerrar} className="sorteo-boton-secundario">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {fase === 'girando' && (
            <div>
              <p className="font-display text-2xl text-crema">Sorteando…</p>
              <button
                type="button"
                onClick={saltar}
                className={`mt-4 text-sm text-crema/70 underline underline-offset-4 decoration-crema/30 hover:text-crema transition-opacity ${
                  puedeSaltar ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                tabIndex={puedeSaltar ? 0 : -1}
              >
                Saltar la animación
              </button>
            </div>
          )}

          {fase === 'error' && (
            <div className="sorteo-aparecer">
              <p className="font-display text-2xl text-crema">No se pudo sortear</p>
              <p className="mt-2 text-crema/80">{error}</p>
              <button ref={botonRef} type="button" onClick={cerrar} className="sorteo-boton-principal mt-6">
                Volver a la rueda
              </button>
            </div>
          )}

          {revelado && ganador && (
            <div className="sorteo-revelacion">
              <h2 className="font-display text-[clamp(2.25rem,7vw,3.5rem)] leading-[1.05] text-crema text-balance">
                {ganador.nombre}
              </h2>
              <p className="mt-3 font-mono font-tabular text-3xl font-semibold text-gold-light">
                {formatMonto(montoVisible, rueda.moneda)}
              </p>
              <p className="mt-2 text-crema/80">Se lleva el fondo de este período.</p>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                {linkWhatsApp && (
                  <a href={linkWhatsApp} target="_blank" rel="noreferrer" className="sorteo-boton-secundario">
                    <IconoMensaje />
                    Avisar por WhatsApp
                  </a>
                )}
                <button ref={botonRef} type="button" onClick={cerrar} className="sorteo-boton-principal">
                  Continuar
                </button>
              </div>

              <p
                className="mt-6 text-xs text-crema/60"
                title="El ganador es el participante número (semilla en hexadecimal mod cantidad) + 1, con los participantes ordenados por id."
              >
                Sorteo verificable · semilla <span className="font-mono">{resultado.semilla}</span> ·{' '}
                {lista.length} participantes
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
