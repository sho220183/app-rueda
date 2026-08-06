import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { calcularVencimiento, estaVencido } from '../lib/periodos.js'
import { buildWaLink } from '../lib/whatsapp.js'

export default function AportesSection({ rueda, miembros, esAdmin, onRuedaActualizada }) {
  const [aportes, setAportes] = useState([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [avanzando, setAvanzando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const [historial, setHistorial] = useState([])

  const miembrosContribuyentes = miembros.filter((m) => m.estado !== 'retirado')

  async function loadAportes() {
    setLoading(true)
    const { data } = await supabase
      .from('aportes')
      .select('*')
      .eq('rueda_id', rueda.id)
      .eq('ciclo', rueda.ciclo_actual)
      .eq('periodo', rueda.periodo_actual)
    setAportes(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadAportes()
  }, [rueda.id, rueda.ciclo_actual, rueda.periodo_actual])

  async function generarAportes() {
    setGenerando(true)
    const vencimiento = calcularVencimiento(rueda.fecha_inicio, rueda.frecuencia, rueda.periodo_actual)
    const filas = miembrosContribuyentes.map((m) => ({
      rueda_id: rueda.id,
      miembro_id: m.id,
      ciclo: rueda.ciclo_actual,
      periodo: rueda.periodo_actual,
      monto: rueda.monto_aporte,
      fecha_vencimiento: vencimiento,
      estado: 'pendiente'
    }))
    const { error } = await supabase.from('aportes').insert(filas)
    setGenerando(false)
    if (!error) loadAportes()
    else alert('Error al generar aportes: ' + error.message)
  }

  async function marcarPagado(aporteId) {
    const { error } = await supabase
      .from('aportes')
      .update({ estado: 'pagado', fecha_pago: new Date().toISOString().slice(0, 10) })
      .eq('id', aporteId)
    if (!error) loadAportes()
  }

  async function marcarPendiente(aporteId) {
    const { error } = await supabase.from('aportes').update({ estado: 'pendiente', fecha_pago: null }).eq('id', aporteId)
    if (!error) loadAportes()
  }

  async function avanzarPeriodo() {
    if (!confirm(`¿Cerrar el período ${rueda.periodo_actual} y pasar al ${rueda.periodo_actual + 1}?`)) return
    setAvanzando(true)
    const { error } = await supabase
      .from('ruedas')
      .update({ periodo_actual: rueda.periodo_actual + 1 })
      .eq('id', rueda.id)
    setAvanzando(false)
    if (!error) onRuedaActualizada()
  }

  async function cargarHistorial() {
    const { data } = await supabase
      .from('aportes')
      .select('*')
      .eq('rueda_id', rueda.id)
      .lt('periodo', rueda.periodo_actual)
      .order('periodo', { ascending: false })
    setHistorial(data || [])
    setVerHistorial(true)
  }

  const totalEsperado = aportes.reduce((s, a) => s + Number(a.monto), 0)
  const totalRecaudado = aportes.filter((a) => a.estado === 'pagado').reduce((s, a) => s + Number(a.monto), 0)
  const yaGenerado = aportes.length > 0

  function mensajeAtraso(nombre, monto, vencimiento) {
    return `Hola ${nombre.split(' ')[0]}! Te escribo por la rueda "${rueda.nombre}". Tu aporte de Gs. ${Number(
      monto
    ).toLocaleString('es-PY')} venció el ${vencimiento}. ¿Podés confirmarme cuándo lo hacés? Gracias!`
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl text-ink">
          Aportes · Período {rueda.periodo_actual}
        </h2>
        {esAdmin && yaGenerado && (
          <button
            onClick={avanzarPeriodo}
            disabled={avanzando}
            className="text-sm border border-line rounded-sm px-3 py-2 text-ink hover:border-primary transition disabled:opacity-60 no-print"
          >
            {avanzando ? 'Avanzando...' : `Cerrar y pasar al período ${rueda.periodo_actual + 1} →`}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-muted text-sm">Cargando aportes...</p>
      ) : !yaGenerado ? (
        esAdmin ? (
          <div className="bg-surface border border-dashed border-line rounded-lg p-6 text-center no-print">
            <p className="text-sm text-muted mb-3">
              Todavía no generaste los aportes del período {rueda.periodo_actual} para los{' '}
              {miembrosContribuyentes.length} integrantes activos.
            </p>
            <button
              onClick={generarAportes}
              disabled={generando}
              className="bg-primary hover:bg-primary-dark transition text-white text-sm rounded-sm px-4 py-2 disabled:opacity-60"
            >
              {generando ? 'Generando...' : `Generar aportes del período ${rueda.periodo_actual}`}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">El administrador todavía no generó los aportes de este período.</p>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-surface border border-line rounded-lg p-4">
              <p className="text-xs text-muted uppercase tracking-wide">Recaudado</p>
              <p className="font-mono text-xl text-ink mt-1">Gs. {totalRecaudado.toLocaleString('es-PY')}</p>
            </div>
            <div className="bg-surface border border-line rounded-lg p-4">
              <p className="text-xs text-muted uppercase tracking-wide">Esperado</p>
              <p className="font-mono text-xl text-ink mt-1">Gs. {totalEsperado.toLocaleString('es-PY')}</p>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-lg divide-y divide-line">
            {aportes.map((a) => {
              const miembro = miembros.find((m) => m.id === a.miembro_id)
              const vencido = a.estado !== 'pagado' && estaVencido(a.fecha_vencimiento)
              return (
                <div key={a.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-ink font-medium">{miembro?.nombre ?? '—'}</p>
                    <p className="text-xs text-muted">
                      Gs. {Number(a.monto).toLocaleString('es-PY')} · vence {a.fecha_vencimiento}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        a.estado === 'pagado'
                          ? 'bg-primary/10 text-primary'
                          : vencido
                          ? 'bg-alert/10 text-alert'
                          : 'bg-gold/20 text-gold'
                      }`}
                    >
                      {a.estado === 'pagado' ? 'Pagado' : vencido ? 'Atrasado' : 'Pendiente'}
                    </span>
                    {esAdmin && a.estado !== 'pagado' && miembro?.telefono && (
                      <a
                        href={buildWaLink(miembro.telefono, mensajeAtraso(miembro.nombre, a.monto, a.fecha_vencimiento))}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline no-print"
                      >
                        Recordar
                      </a>
                    )}
                    {esAdmin && a.estado !== 'pagado' && (
                      <button onClick={() => marcarPagado(a.id)} className="text-xs bg-primary text-white rounded-sm px-2 py-1 no-print">
                        Marcar pagado
                      </button>
                    )}
                    {esAdmin && a.estado === 'pagado' && (
                      <button onClick={() => marcarPendiente(a.id)} className="text-xs text-muted hover:underline no-print">
                        Deshacer
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {rueda.periodo_actual > 1 && (
        <div className="mt-3">
          {!verHistorial ? (
            <button onClick={cargarHistorial} className="text-xs text-muted hover:text-primary">
              Ver historial de períodos anteriores
            </button>
          ) : (
            <div className="bg-surface border border-line rounded-lg p-4 mt-2">
              <p className="text-xs text-muted uppercase tracking-wide mb-2">Historial</p>
              {Object.entries(
                historial.reduce((acc, a) => {
                  acc[a.periodo] = acc[a.periodo] || { total: 0, pagado: 0, count: 0 }
                  acc[a.periodo].total += Number(a.monto)
                  acc[a.periodo].count += 1
                  if (a.estado === 'pagado') acc[a.periodo].pagado += Number(a.monto)
                  return acc
                }, {})
              )
                .sort((a, b) => b[0] - a[0])
                .map(([periodo, r]) => (
                  <div key={periodo} className="flex justify-between text-sm py-1">
                    <span className="text-ink">Período {periodo}</span>
                    <span className="font-mono text-muted">
                      Gs. {r.pagado.toLocaleString('es-PY')} / {r.total.toLocaleString('es-PY')}
                    </span>
                  </div>
                ))}
              {historial.length === 0 && <p className="text-sm text-muted">Sin períodos anteriores todavía.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
