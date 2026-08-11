import { useEffect, useMemo, useState } from 'react'

const PALETA = ['#1B4B43', '#C9962B', '#2F6D62', '#E8C77A']
const COLORES_CONFETTI = ['#C9962B', '#1B4B43', '#E8C77A', '#D65F45', '#FFFFFF']

export default function RuletaSorteo({ participantes, ganador, montoEntregado, moneda = 'PYG', onFinalizar }) {
  const [fase, setFase] = useState('girando') // 'girando' | 'revelando'

  const n = participantes.length
  const anguloSegmento = 360 / n

  const indiceGanador = participantes.findIndex((p) => p.id === ganador.id)

  const rotacionFinal = useMemo(() => {
    const centro = indiceGanador * anguloSegmento + anguloSegmento / 2
    const jitter = (Math.random() - 0.5) * anguloSegmento * 0.5
    const vueltas = 6
    return vueltas * 360 + (360 - centro + jitter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const confetti = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => {
        const angulo = Math.random() * 2 * Math.PI
        const distancia = 120 + Math.random() * 220
        return {
          id: i,
          left: 50 + (Math.random() - 0.5) * 20,
          delay: Math.random() * 0.3,
          duracion: 1.6 + Math.random() * 1,
          color: COLORES_CONFETTI[i % COLORES_CONFETTI.length],
          tx: `${Math.cos(angulo) * distancia}px`,
          ty: `${Math.sin(angulo) * distancia - 80}px`,
          rot: `${(Math.random() - 0.5) * 900}deg`,
          ancho: 6 + Math.random() * 6,
          alto: 10 + Math.random() * 8
        }
      }),
    []
  )

  useEffect(() => {
    const t = setTimeout(() => setFase('revelando'), 4600)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-ink/90 flex items-center justify-center px-4 no-print">
      {fase === 'girando' && (
        <div className="flex flex-col items-center">
          <p className="text-gold-light font-display text-lg mb-6">Sorteando...</p>
          <div className="relative" style={{ width: 280, height: 280 }}>
            {/* Puntero fijo */}
            <div
              className="absolute left-1/2 -translate-x-1/2 -top-2 z-10"
              style={{ animation: 'pin-bounce 0.6s ease-in-out infinite' }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '12px solid transparent',
                  borderRight: '12px solid transparent',
                  borderTop: '20px solid #C9962B'
                }}
              />
            </div>

            {/* Rueda */}
            <div
              className="rounded-full border-4 border-gold shadow-2xl"
              style={{
                width: 280,
                height: 280,
                background: `conic-gradient(${participantes
                  .map((_, i) => {
                    const color = PALETA[i % PALETA.length]
                    const a0 = (i * anguloSegmento).toFixed(2)
                    const a1 = ((i + 1) * anguloSegmento).toFixed(2)
                    return `${color} ${a0}deg ${a1}deg`
                  })
                  .join(', ')})`,
                transition: 'transform 4.5s cubic-bezier(0.12, 0.67, 0.1, 0.99)',
                transform: `rotate(${rotacionFinal}deg)`
              }}
            >
              {participantes.map((p, i) => {
                const centro = i * anguloSegmento + anguloSegmento / 2
                return (
                  <div
                    key={p.id}
                    className="absolute inset-0 flex justify-center"
                    style={{ transform: `rotate(${centro}deg)` }}
                  >
                    <span
                      className="text-white text-[11px] font-medium mt-3 max-w-[70px] truncate"
                      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                    >
                      {p.nombre.split(' ')[0]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {fase === 'revelando' && (
        <div className="relative flex flex-col items-center text-center">
          {confetti.map((c) => (
            <span
              key={c.id}
              className="absolute top-1/2 rounded-sm"
              style={{
                left: `${c.left}%`,
                width: c.ancho,
                height: c.alto,
                backgroundColor: c.color,
                '--tx': c.tx,
                '--ty': c.ty,
                '--rot': c.rot,
                animation: `confetti-burst ${c.duracion}s ease-out ${c.delay}s forwards`
              }}
            />
          ))}

          <div style={{ animation: 'ganador-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}>
            <p className="text-gold-light text-sm tracking-widest uppercase mb-2">🎉 Salió sorteado 🎉</p>
            <p className="font-display text-4xl text-white mb-3">{ganador.nombre}</p>
            {montoEntregado != null && (
              <p className="font-mono text-xl text-gold-light">
                {moneda} {Number(montoEntregado).toLocaleString('es-PY')}
              </p>
            )}
          </div>

          <button
            onClick={onFinalizar}
            className="mt-8 bg-gold text-ink font-medium text-sm rounded-sm px-6 py-2.5 hover:opacity-90 transition"
          >
            Continuar
          </button>
        </div>
      )}
    </div>
  )
}
