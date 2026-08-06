import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import WheelVisual from '../components/WheelVisual.jsx'
import CalendarioRueda from '../components/CalendarioRueda.jsx'

const ESTADO_LABEL = { activo: 'Activo', ganador: 'Ya ganó este ciclo' }

function armarEventos(data) {
  const evts = []
  if (data.proxima_fecha_vencimiento) evts.push({ fecha: data.proxima_fecha_vencimiento, tipo: 'pago' })
  if (data.fecha_sorteo) evts.push({ fecha: data.fecha_sorteo, tipo: 'sorteo_programado' })
  ;(data.sorteos || []).forEach((s) =>
    evts.push({
      fecha: s.fecha,
      tipo: 'sorteo_realizado',
      label: `Sorteo realizado · ciclo ${s.ciclo}, período ${s.periodo}`
    })
  )
  return evts
}

export default function RuedaPublica() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc('get_rueda_publica', { p_token: token })
      if (error || !data) {
        setNotFound(true)
      } else {
        setData(data)
      }
      setLoading(false)
    }
    load()
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg font-body flex items-center justify-center text-muted">
        Cargando...
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-bg font-body flex items-center justify-center text-muted text-sm">
        Este link no es válido o la rueda ya no existe.
      </div>
    )
  }

  const montoFondo = Number(data.monto_aporte) * (data.miembros?.length ?? 0)

  return (
    <div className="min-h-screen bg-bg font-body">
      <header className="border-b border-line bg-surface">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-gold-light font-display text-sm flex items-center justify-center">
            R
          </div>
          <span className="font-display text-lg text-ink">La Rueda</span>
          <span className="text-xs text-muted ml-auto">Vista pública de consulta</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-display text-2xl text-ink mb-1">{data.nombre}</h1>
        <p className="text-muted text-sm mb-6">
          Aporte {data.moneda} {Number(data.monto_aporte).toLocaleString('es-PY')} · {data.frecuencia} · Ciclo{' '}
          {data.ciclo_actual}
        </p>

        <div className="bg-surface border border-line rounded-lg p-5 mb-6 flex items-center justify-center">
          <WheelVisual miembros={data.miembros} montoFondo={montoFondo} moneda={data.moneda} />
        </div>

        <div className="mb-6">
          <CalendarioRueda eventos={armarEventos(data)} />
        </div>

        <h2 className="font-display text-lg text-ink mb-3">Integrantes</h2>
        <div className="bg-surface border border-line rounded-lg divide-y divide-line mb-6">
          {(data.miembros ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between p-4">
              <p className="text-ink font-medium">{m.nombre}</p>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  m.estado === 'activo' ? 'bg-primary/10 text-primary' : 'bg-gold/20 text-gold'
                }`}
              >
                {ESTADO_LABEL[m.estado]}
              </span>
            </div>
          ))}
        </div>

        {data.sorteos?.length > 0 && (
          <>
            <h2 className="font-display text-lg text-ink mb-3">Historial de sorteos</h2>
            <div className="bg-surface border border-line rounded-lg divide-y divide-line">
              {data.sorteos.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <span className="text-ink font-medium">{s.ganador_nombre}</span>
                    <span className="text-muted"> · ciclo {s.ciclo}, período {s.periodo}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-ink">
                      {data.moneda} {Number(s.monto_entregado).toLocaleString('es-PY')}
                    </p>
                    <p className="text-xs text-muted">{s.fecha}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-xs text-muted mt-6 text-center">
          Este link es solo de consulta. Para cualquier duda sobre tu aporte, escribile al administrador de la rueda.
        </p>
      </main>
    </div>
  )
}
