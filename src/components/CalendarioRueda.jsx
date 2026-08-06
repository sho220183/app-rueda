import { useEffect, useState } from 'react'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const COLOR_TIPO = {
  pago: 'bg-gold',
  sorteo_programado: 'bg-primary',
  sorteo_realizado: 'bg-alert'
}

const LABEL_TIPO = {
  pago: 'Vencimiento de pago',
  sorteo_programado: 'Sorteo programado',
  sorteo_realizado: 'Sorteo realizado'
}

/**
 * eventos: [{ fecha: 'YYYY-MM-DD', tipo: 'pago'|'sorteo_programado'|'sorteo_realizado', label?: string }]
 */
export default function CalendarioRueda({ eventos = [] }) {
  const [mesVisible, setMesVisible] = useState(() => {
    const hoy = new Date().toISOString().slice(0, 10)
    const proximo = [...eventos].filter((e) => e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
    const base = proximo || eventos[0]
    return base ? new Date(base.fecha + 'T00:00:00') : new Date()
  })

  useEffect(() => {
    const hoy = new Date().toISOString().slice(0, 10)
    const proximo = [...eventos].filter((e) => e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
    const base = proximo || eventos[0]
    if (base) setMesVisible(new Date(base.fecha + 'T00:00:00'))
  }, [JSON.stringify(eventos)])

  const year = mesVisible.getFullYear()
  const month = mesVisible.getMonth()
  const offset = new Date(year, month, 1).getDay()
  const diasEnMes = new Date(year, month + 1, 0).getDate()

  const celdas = [...Array(offset).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)]

  function eventosDelDia(d) {
    if (!d) return []
    const fechaStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return eventos.filter((e) => e.fecha === fechaStr)
  }

  const hoyStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="bg-surface border border-line rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setMesVisible(new Date(year, month - 1, 1))}
          className="text-muted hover:text-primary px-2 no-print"
        >
          ←
        </button>
        <p className="text-sm font-medium text-ink">
          {MESES[month]} {year}
        </p>
        <button
          onClick={() => setMesVisible(new Date(year, month + 1, 1))}
          className="text-muted hover:text-primary px-2 no-print"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted mb-1">
        {DIAS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {celdas.map((d, i) => {
          const evts = eventosDelDia(d)
          const fechaStr = d ? `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null
          const esHoy = fechaStr === hoyStr
          return (
            <div
              key={i}
              className={`aspect-square flex flex-col items-center justify-center rounded-sm text-xs ${
                d ? 'text-ink' : ''
              } ${esHoy ? 'ring-1 ring-primary' : ''}`}
            >
              {d && (
                <>
                  <span>{d}</span>
                  <div className="flex gap-0.5 mt-0.5 h-1.5">
                    {evts.map((e, j) => (
                      <span
                        key={j}
                        title={e.label || LABEL_TIPO[e.tipo]}
                        className={`w-1.5 h-1.5 rounded-full ${COLOR_TIPO[e.tipo]}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gold inline-block" /> Vencimiento de pago
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-primary inline-block" /> Sorteo programado
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-alert inline-block" /> Sorteo realizado
        </span>
      </div>
    </div>
  )
}
