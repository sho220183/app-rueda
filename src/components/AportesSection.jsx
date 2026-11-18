import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { estaVencido, hoyLocal } from '../lib/periodos.js'
import { buildWaLink } from '../lib/whatsapp.js'

export default function AportesSection({ rueda, miembros, esAdmin, onRuedaActualizada }) {
  const [aportes, setAportes] = useState([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [avanzando, setAvanzando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const [historial, setHistorial] = useState([])
  const [pagandoId, setPagandoId] = useState(null)
  const [montoIngresado, setMontoIngresado] = useState('')
  const [guardandoPago, setGuardandoPago] = useState(false)

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

  // El servidor calcula el vencimiento (continuo entre ciclos), crea los aportes
  // que falten (incluye integrantes agregados después) y sugiere la fecha de sorteo.
  async function generarAportes() {
    setGenerando(true)
    const { error } = await supabase.rpc('generar_aportes', { p_rueda_id: rueda.id })
    setGenerando(false)
    if (!error) {
      onRuedaActualizada()
      loadAportes()
    } else alert('Error al generar aportes: ' + error.message)
  }

  function abrirPago(aporte) {
    const saldo = Number(aporte.monto) - Number(aporte.monto_pagado || 0)
    setPagandoId(aporte.id)
    setMontoIngresado(String(saldo))
  }

  async function confirmarPago(aporte) {
    const monto = Number(montoIngresado)
    if (!monto || monto <= 0) {
      alert('Ingresá un monto válido.')
      return
    }
    setGuardandoPago(true)
    const nuevoPagado = Number(aporte.monto_pagado || 0) + monto
    const nuevoEstado = nuevoPagado >= Number(aporte.monto) ? 'pagado' : 'parcial'
    const { error } = await supabase
      .from('aportes')
      .update({
        monto_pagado: nuevoPagado,
        estado: nuevoEstado,
        fecha_pago: hoyLocal()
      })
      .eq('id', aporte.id)
    setGuardandoPago(false)
    if (error) {
      alert('Error al registrar el pago: ' + error.message)
      return
    }
    setPagandoId(null)
    loadAportes()
    onRuedaActualizada()
  }

  async function deshacerPago(aporteId) {
    if (!confirm('¿Deshacer el pago registrado para este aporte?')) return
    const { error } = await supabase
      .from('aportes')
      .update({ estado: 'pendiente', monto_pagado: 0, fecha_pago: null })
      .eq('id', aporteId)
    if (!error) {
      loadAportes()
      onRuedaActualizada()
    }
  }

  async function avanzarPeriodo() {
    if (!confirm(`¿Cerrar el período ${rueda.periodo_actual} y pasar al ${rueda.periodo_actual + 1}?`)) return
    setAvanzando(true)
    const { error } = await supabase.rpc('avanzar_periodo', { p_rueda_id: rueda.id })
    setAvanzando(false)
    if (error) alert('No se pudo avanzar: ' + error.message)
    else onRuedaActualizada()
  }

  // Todos los períodos anteriores al actual, de este ciclo y de los anteriores.
  async function cargarHistorial() {
    const c = rueda.ciclo_actual
    const p = rueda.periodo_actual
    const { data } = await supabase
      .from('aportes')
      .select('ciclo, periodo, monto, monto_pagado')
      .eq('rueda_id', rueda.id)
      .or(`ciclo.lt.${c},and(ciclo.eq.${c},periodo.lt.${p})`)
    setHistorial(data || [])
    setVerHistorial(true)
  }

  const totalEsperado = aportes.reduce((s, a) => s + Number(a.monto), 0)
  const totalRecaudado = aportes.reduce((s, a) => s + Number(a.monto_pagado || 0), 0)
  const yaGenerado = aportes.length > 0
  const sinAporte = miembrosContribuyentes.filter((m) => !aportes.some((a) => a.miembro_id === m.id))

  function mensajeAtraso(nombre, monto, montoPagado, vencimiento) {
    const saldo = Number(monto) - Number(montoPagado || 0)
    const detalleSaldo =
      montoPagado > 0
        ? ` Ya abonaste Gs. ${Number(montoPagado).toLocaleString('es-PY')}, te falta Gs. ${saldo.toLocaleString('es-PY')}.`
        : ''
    return `Hola ${nombre.split(' ')[0]}! Te escribo por la rueda "${rueda.nombre}". Tu aporte de Gs. ${Number(
      monto
    ).toLocaleString('es-PY')} venció el ${vencimiento}.${detalleSaldo} ¿Podés confirmarme cuándo lo hacés? Gracias!`
  }

  const ESTADO_STYLE = {
    pagado: 'bg-primary/10 text-primary',
    parcial: 'bg-gold/20 text-gold',
    atrasado: 'bg-alert/10 text-alert',
    pendiente: 'bg-gold/20 text-gold'
  }
  const ESTADO_LABEL = { pagado: 'Pagado', parcial: 'Parcial', atrasado: 'Atrasado', pendiente: 'Pendiente' }

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

          {esAdmin && sinAporte.length > 0 && (
            <div className="bg-gold/10 border border-gold/40 rounded-lg p-3 mb-3 flex items-center justify-between gap-3 flex-wrap no-print">
              <p className="text-sm text-ink">
                {sinAporte.length} integrante(s) sin aporte en este período ({sinAporte.map((m) => m.nombre).join(', ')}).
              </p>
              <button
                onClick={generarAportes}
                disabled={generando}
                className="text-xs bg-primary text-white rounded-sm px-3 py-1.5 disabled:opacity-60"
              >
                {generando ? 'Generando...' : 'Generar los que faltan'}
              </button>
            </div>
          )}

          <div className="bg-surface border border-line rounded-lg divide-y divide-line">
            {aportes.map((a) => {
              const miembro = miembros.find((m) => m.id === a.miembro_id)
              const vencido = a.estado !== 'pagado' && estaVencido(a.fecha_vencimiento)
              const estadoVisual = a.estado === 'pagado' ? 'pagado' : a.estado === 'parcial' ? 'parcial' : vencido ? 'atrasado' : 'pendiente'
              const saldo = Number(a.monto) - Number(a.monto_pagado || 0)

              return (
                <div key={a.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-ink font-medium">{miembro?.nombre ?? '—'}</p>
                      <p className="text-xs text-muted">
                        Gs. {Number(a.monto).toLocaleString('es-PY')} · vence {a.fecha_vencimiento}
                        {a.estado === 'parcial' && (
                          <> · abonado Gs. {Number(a.monto_pagado).toLocaleString('es-PY')}, falta Gs. {saldo.toLocaleString('es-PY')}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${ESTADO_STYLE[estadoVisual]}`}>
                        {ESTADO_LABEL[estadoVisual]}
                      </span>
                      {esAdmin && a.estado !== 'pagado' && miembro?.telefono && (
                        <a
                          href={buildWaLink(miembro.telefono, mensajeAtraso(miembro.nombre, a.monto, a.monto_pagado, a.fecha_vencimiento))}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline no-print"
                        >
                          Recordar
                        </a>
                      )}
                      {esAdmin && a.estado !== 'pagado' && pagandoId !== a.id && (
                        <button
                          onClick={() => abrirPago(a)}
                          className="text-xs bg-primary text-white rounded-sm px-2 py-1 no-print"
                        >
                          Registrar pago
                        </button>
                      )}
                      {esAdmin && a.estado !== 'pendiente' && (
                        <button onClick={() => deshacerPago(a.id)} className="text-xs text-muted hover:underline no-print">
                          Deshacer
                        </button>
                      )}
                    </div>
                  </div>

                  {pagandoId === a.id && (
                    <div className="flex items-center gap-2 mt-3 no-print">
                      <span className="text-xs text-muted">Gs.</span>
                      <input
                        type="number"
                        min="1"
                        max={a.monto - (a.monto_pagado || 0)}
                        value={montoIngresado}
                        onChange={(e) => setMontoIngresado(e.target.value)}
                        className="border border-line rounded-sm px-2 py-1.5 text-sm font-mono w-32 focus:outline-none focus:ring-2 focus:ring-gold"
                      />
                      <button
                        onClick={() => confirmarPago(a)}
                        disabled={guardandoPago}
                        className="text-xs bg-primary text-white rounded-sm px-3 py-1.5 disabled:opacity-60"
                      >
                        {guardandoPago ? 'Guardando...' : 'Confirmar'}
                      </button>
                      <button onClick={() => setPagandoId(null)} className="text-xs text-muted hover:underline">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {(rueda.periodo_actual > 1 || rueda.ciclo_actual > 1) && (
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
                  const clave = `${a.ciclo}-${a.periodo}`
                  acc[clave] = acc[clave] || { ciclo: a.ciclo, periodo: a.periodo, total: 0, pagado: 0 }
                  acc[clave].total += Number(a.monto)
                  acc[clave].pagado += Number(a.monto_pagado || 0)
                  return acc
                }, {})
              )
                .sort(([, a], [, b]) => b.ciclo - a.ciclo || b.periodo - a.periodo)
                .map(([clave, r]) => (
                  <div key={clave} className="flex justify-between text-sm py-1">
                    <span className="text-ink">
                      Ciclo {r.ciclo} · Período {r.periodo}
                    </span>
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
