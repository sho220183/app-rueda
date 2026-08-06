import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { buildWaLink } from '../lib/whatsapp.js'

export default function SorteoSection({ rueda, miembros, esAdmin, onActualizado }) {
  const [sorteos, setSorteos] = useState([])
  const [loading, setLoading] = useState(true)
  const [sorteando, setSorteando] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)

  const contribuyentes = miembros.filter((m) => m.estado !== 'retirado')
  const activos = miembros.filter((m) => m.estado === 'activo')
  const cicloCompleto = contribuyentes.length > 0 && activos.length === 0

  async function loadSorteos() {
    setLoading(true)
    const { data } = await supabase
      .from('sorteos')
      .select('*')
      .eq('rueda_id', rueda.id)
      .order('created_at', { ascending: false })
    setSorteos(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadSorteos()
  }, [rueda.id, rueda.ciclo_actual])

  const yaSorteadoEstePeriodo = sorteos.some(
    (s) => s.ciclo === rueda.ciclo_actual && s.periodo === rueda.periodo_actual
  )
  const ultimoGanador = sorteos.find((s) => s.ciclo === rueda.ciclo_actual && s.periodo === rueda.periodo_actual)

  async function realizarSorteo() {
    if (activos.length === 0) return
    if (!confirm(`Se va a sortear entre ${activos.length} integrante(s) elegibles. ¿Confirmás?`)) return

    setSorteando(true)

    const azar = crypto.getRandomValues(new Uint32Array(1))[0]
    const idx = azar % activos.length
    const ganador = activos[idx]
    const monto = rueda.monto_aporte * contribuyentes.length

    const { error: errSorteo } = await supabase.from('sorteos').insert({
      rueda_id: rueda.id,
      ciclo: rueda.ciclo_actual,
      periodo: rueda.periodo_actual,
      ganador_id: ganador.id,
      monto_entregado: monto,
      semilla: `${azar}`
    })

    if (errSorteo) {
      setSorteando(false)
      alert('Error al sortear: ' + errSorteo.message)
      return
    }

    const { error: errMiembro } = await supabase
      .from('rueda_miembros')
      .update({ estado: 'ganador', ciclo_ganador: rueda.ciclo_actual })
      .eq('id', ganador.id)

    setSorteando(false)

    if (errMiembro) {
      alert('El sorteo se guardó pero hubo un error al actualizar el integrante: ' + errMiembro.message)
    }

    await loadSorteos()
    onActualizado()
  }

  async function reiniciarCiclo() {
    if (!confirm('¿Reiniciar el ciclo? Todos los integrantes vuelven a estar elegibles para el próximo sorteo.'))
      return
    setReiniciando(true)

    const { error } = await supabase
      .from('rueda_miembros')
      .update({ estado: 'activo', ciclo_ganador: null })
      .eq('rueda_id', rueda.id)
      .eq('estado', 'ganador')

    if (!error) {
      await supabase
        .from('ruedas')
        .update({ ciclo_actual: rueda.ciclo_actual + 1, periodo_actual: 1 })
        .eq('id', rueda.id)
    }

    setReiniciando(false)

    if (error) {
      alert('Error al reiniciar: ' + error.message)
      return
    }

    onActualizado()
  }

  function nombreDe(miembroId) {
    return miembros.find((m) => m.id === miembroId)?.nombre ?? '—'
  }

  return (
    <div className="mb-8">
      <h2 className="font-display text-xl text-ink mb-3">Sorteo</h2>

      {cicloCompleto ? (
        <div className="bg-gold/10 border border-gold/40 rounded-lg p-5 mb-4">
          <p className="text-sm font-medium text-ink mb-1">¡Ciclo {rueda.ciclo_actual} completo!</p>
          <p className="text-sm text-muted mb-3">
            Todos los integrantes ya salieron sorteados. {esAdmin && 'Reiniciá para empezar el ciclo siguiente.'}
          </p>
          {esAdmin && (
            <button
              onClick={reiniciarCiclo}
              disabled={reiniciando}
              className="bg-primary hover:bg-primary-dark transition text-white text-sm rounded-sm px-4 py-2 disabled:opacity-60 no-print"
            >
              {reiniciando ? 'Reiniciando...' : `Reiniciar e iniciar ciclo ${rueda.ciclo_actual + 1}`}
            </button>
          )}
        </div>
      ) : yaSorteadoEstePeriodo ? (
        <div className="bg-surface border border-line rounded-lg p-5 mb-4">
          <p className="text-xs text-muted uppercase tracking-wide mb-1">Ganador del período {rueda.periodo_actual}</p>
          <p className="font-display text-lg text-ink">{nombreDe(ultimoGanador.ganador_id)}</p>
          <p className="text-sm font-mono text-muted mt-1">
            Gs. {Number(ultimoGanador.monto_entregado).toLocaleString('es-PY')}
          </p>
          {esAdmin &&
            (() => {
              const ganador = miembros.find((m) => m.id === ultimoGanador.ganador_id)
              if (!ganador?.telefono) return null
              const msg = `Hola ${ganador.nombre.split(' ')[0]}! Salió tu número en la rueda "${rueda.nombre}". Te corresponde Gs. ${Number(
                ultimoGanador.monto_entregado
              ).toLocaleString('es-PY')}. ¡Felicitaciones!`
              return (
                <a
                  href={buildWaLink(ganador.telefono, msg)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-3 text-sm bg-primary hover:bg-primary-dark transition text-white rounded-sm px-4 py-2 no-print"
                >
                  Avisar al ganador por WhatsApp
                </a>
              )
            })()}
        </div>
      ) : (
        esAdmin && (
          <div className="bg-surface border border-dashed border-line rounded-lg p-6 text-center mb-4">
            <p className="text-sm text-muted mb-3">
              {activos.length} integrante(s) elegibles para el sorteo del período {rueda.periodo_actual}.
            </p>
            <button
              onClick={realizarSorteo}
              disabled={sorteando || activos.length === 0}
              className="bg-gold hover:opacity-90 transition text-ink font-medium text-sm rounded-sm px-5 py-2.5 disabled:opacity-60 no-print"
            >
              {sorteando ? 'Sorteando...' : '🎲 Realizar sorteo'}
            </button>
          </div>
        )
      )}

      {sorteos.length > 0 && (
        <details className="text-sm">
          <summary className="text-xs text-muted hover:text-primary cursor-pointer">Ver historial de sorteos</summary>
          <div className="bg-surface border border-line rounded-lg divide-y divide-line mt-2">
            {sorteos.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <span className="text-ink font-medium">{nombreDe(s.ganador_id)}</span>
                  <span className="text-muted"> · ciclo {s.ciclo}, período {s.periodo}</span>
                </div>
                <div className="text-right">
                  <p className="font-mono text-ink">Gs. {Number(s.monto_entregado).toLocaleString('es-PY')}</p>
                  <p className="text-xs text-muted">{s.fecha}</p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
