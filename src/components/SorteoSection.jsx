import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { buildWaLink } from '../lib/whatsapp.js'
import { hoyLocal } from '../lib/periodos.js'
import RuletaSorteo from './RuletaSorteo.jsx'
import { IconoMensaje, IconoRueda } from './Iconos.jsx'
import { formatFecha, formatMonto } from '../lib/formato.js'
import { describirError } from '../lib/errores.js'
import { useAvisos } from './Avisos.jsx'

export default function SorteoSection({ rueda, miembros, esAdmin, onActualizado, refreshSignal }) {
  const [sorteos, setSorteos] = useState([])
  const [loading, setLoading] = useState(true)
  const [sorteando, setSorteando] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)
  const [editandoFecha, setEditandoFecha] = useState(false)
  const [nuevaFecha, setNuevaFecha] = useState(rueda.fecha_sorteo || '')
  const [guardandoFecha, setGuardandoFecha] = useState(false)
  const [aportesPeriodo, setAportesPeriodo] = useState([])
  const [ceremonia, setCeremonia] = useState(false) // ruleta a pantalla completa abierta
  const aviso = useAvisos()

  const UMBRAL_PAGO = 0.85

  const contribuyentes = miembros.filter((m) => m.estado !== 'retirado')
  const activos = miembros.filter((m) => m.estado === 'activo')
  const cicloCompleto = contribuyentes.length > 0 && activos.length === 0

  const aportesGenerados = aportesPeriodo.length > 0
  const pagados = aportesPeriodo.filter((a) => a.estado === 'pagado').length
  const porcentajePagado = contribuyentes.length > 0 ? pagados / contribuyentes.length : 0
  const pagoInsuficiente = !aportesGenerados || porcentajePagado < UMBRAL_PAGO

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

  async function loadAportesPeriodo() {
    const { data } = await supabase
      .from('aportes')
      .select('estado')
      .eq('rueda_id', rueda.id)
      .eq('ciclo', rueda.ciclo_actual)
      .eq('periodo', rueda.periodo_actual)
    setAportesPeriodo(data || [])
  }

  useEffect(() => {
    loadSorteos()
  }, [rueda.id, rueda.ciclo_actual])

  useEffect(() => {
    loadAportesPeriodo()
  }, [rueda.id, rueda.ciclo_actual, rueda.periodo_actual, refreshSignal])

  const yaSorteadoEstePeriodo = sorteos.some(
    (s) => s.ciclo === rueda.ciclo_actual && s.periodo === rueda.periodo_actual
  )
  const ultimoGanador = sorteos.find((s) => s.ciclo === rueda.ciclo_actual && s.periodo === rueda.periodo_actual)

  async function realizarSorteo() {
    if (activos.length === 0) return
    if (fechaAunNoLlega) {
      aviso.info('Todavía no es el día del sorteo', {
        detalle: `Está programado para el ${formatFecha(rueda.fecha_sorteo)}. Si querés adelantarlo, cambiá la fecha.`
      })
      return
    }
    if (pagoInsuficiente) {
      aviso.info('Faltan pagos para sortear', {
        detalle: `Se necesita al menos el ${Math.round(UMBRAL_PAGO * 100)}% de los aportes pagados; van ${pagados} de ${contribuyentes.length}.`
      })
      return
    }
    // Abre la ceremonia: la rueda con los nombres, lista para girar.
    // El confirm() nativo queda reemplazado por el botón "Girar la rueda".
    setCeremonia(true)
  }

  // Lo llama la ruleta al tocar "Girar". El ganador se elige en el servidor
  // (no se puede manipular desde el navegador); la rueda frena sobre él.
  async function girarEnServidor() {
    setSorteando(true)
    const { data, error } = await supabase.rpc('realizar_sorteo', { p_rueda_id: rueda.id })
    setSorteando(false)
    if (error) {
      const { titulo, detalle } = describirError(error, 'No se pudo sortear')
      throw new Error(titulo === 'No se pudo sortear' ? detalle : `${titulo}. ${detalle}`)
    }
    return data
  }

  async function cerrarCeremonia(huboSorteo) {
    setCeremonia(false)
    if (huboSorteo) {
      await loadSorteos()
      onActualizado()
    }
  }

  async function reiniciarCiclo() {
    const ok = await aviso.confirmar({
      titulo: `¿Empezar el ciclo ${rueda.ciclo_actual + 1}?`,
      detalle:
        'Todos los integrantes vuelven a ser elegibles y la rueda arranca otra vez desde el período 1. El historial del ciclo actual se conserva. Esto no se puede deshacer.',
      confirmar: `Empezar ciclo ${rueda.ciclo_actual + 1}`
    })
    if (!ok) return
    setReiniciando(true)
    const { error } = await supabase.rpc('reiniciar_ciclo', { p_rueda_id: rueda.id })
    setReiniciando(false)
    if (error) {
      aviso.error(error, 'No se pudo empezar el nuevo ciclo')
      return
    }
    aviso.exito(`Empezó el ciclo ${rueda.ciclo_actual + 1}`, { detalle: 'Generá los aportes del período 1 para arrancar.' })
    onActualizado()
  }

  async function guardarFecha(e) {
    e.preventDefault()
    setGuardandoFecha(true)
    const { error } = await supabase.from('ruedas').update({ fecha_sorteo: nuevaFecha || null }).eq('id', rueda.id)
    setGuardandoFecha(false)
    if (error) {
      aviso.error(error, 'No se pudo guardar la fecha')
      return
    }
    setEditandoFecha(false)
    aviso.exito(nuevaFecha ? `Sorteo programado para el ${formatFecha(nuevaFecha)}` : 'Se quitó la fecha del sorteo')
    onActualizado()
  }

  const hoyStr = hoyLocal()
  const fechaAunNoLlega = rueda.fecha_sorteo && rueda.fecha_sorteo > hoyStr

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
        <div className="bg-surface border border-line rounded-lg p-5 mb-4 flex items-start gap-4">
          <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-10 h-10 rounded-full bg-gold/15 text-gold">
            <IconoRueda width={20} height={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl text-ink leading-tight">{nombreDe(ultimoGanador.ganador_id)}</p>
            <p className="text-sm text-muted mt-1">
              Ganó el período {rueda.periodo_actual} ·{' '}
              <span className="font-mono text-ink">{formatMonto(ultimoGanador.monto_entregado, rueda.moneda)}</span> ·{' '}
              {formatFecha(ultimoGanador.fecha)}
            </p>
            {ultimoGanador.semilla && ultimoGanador.participantes && (
              <p
                className="text-xs text-muted mt-2"
                title="El ganador es el participante número (semilla en hexadecimal mod cantidad) + 1, con los participantes ordenados por id."
              >
                Sorteo verificable · semilla <span className="font-mono">{ultimoGanador.semilla}</span> ·{' '}
                {ultimoGanador.participantes.length} participantes
              </p>
            )}
            {esAdmin &&
              (() => {
                const ganador = miembros.find((m) => m.id === ultimoGanador.ganador_id)
                if (!ganador?.telefono) return null
                const msg = `Hola ${ganador.nombre.split(' ')[0]}! Salió tu número en la rueda "${rueda.nombre}". Te corresponde ${formatMonto(
                  ultimoGanador.monto_entregado,
                  rueda.moneda
                )}. ¡Felicitaciones!`
                return (
                  <a
                    href={buildWaLink(ganador.telefono, msg)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 mt-3 text-sm bg-primary hover:bg-primary-dark transition text-white rounded-sm px-4 py-2 no-print"
                  >
                    <IconoMensaje width={16} height={16} />
                    Avisar al ganador por WhatsApp
                  </a>
                )
              })()}
          </div>
        </div>
      ) : (
        esAdmin && (
          <div className="bg-surface border border-dashed border-line rounded-lg p-6 text-center mb-4">
            <p className="text-sm text-muted mb-3">
              {activos.length} integrante(s) elegibles para el sorteo del período {rueda.periodo_actual}.
            </p>

            {!editandoFecha ? (
              <div className="flex items-center justify-center gap-2 mb-4 text-sm no-print">
                <span className="text-muted">
                  {rueda.fecha_sorteo ? (
                    <>
                      Sorteo programado para{' '}
                      <span className="text-ink font-medium">{formatFecha(rueda.fecha_sorteo)}</span>
                    </>
                  ) : (
                    'Sin fecha programada todavía'
                  )}
                </span>
                <button
                  onClick={() => {
                    setNuevaFecha(rueda.fecha_sorteo || '')
                    setEditandoFecha(true)
                  }}
                  className="text-primary hover:underline text-xs"
                >
                  {rueda.fecha_sorteo ? 'Editar fecha' : 'Programar fecha'}
                </button>
              </div>
            ) : (
              <form onSubmit={guardarFecha} className="flex items-center justify-center gap-2 mb-4 no-print">
                <input
                  type="date"
                  value={nuevaFecha}
                  onChange={(e) => setNuevaFecha(e.target.value)}
                  className="border border-line rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                />
                <button
                  type="submit"
                  disabled={guardandoFecha}
                  className="text-sm bg-primary text-white rounded-sm px-3 py-1.5 disabled:opacity-60"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditandoFecha(false)}
                  className="text-sm text-muted hover:underline"
                >
                  Cancelar
                </button>
              </form>
            )}

            <button
              onClick={realizarSorteo}
              disabled={sorteando || activos.length === 0 || fechaAunNoLlega || pagoInsuficiente}
              title={fechaAunNoLlega ? `Disponible a partir del ${formatFecha(rueda.fecha_sorteo)}` : undefined}
              className="inline-flex items-center gap-2 bg-gold hover:bg-gold-light transition-colors text-ink font-semibold text-sm rounded-sm px-5 py-2.5 shadow-[0_6px_16px_-8px_rgba(201,150,43,0.9)] disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed no-print"
            >
              {!sorteando && !fechaAunNoLlega && aportesGenerados && !pagoInsuficiente && <IconoRueda />}
              {sorteando
                ? 'Sorteando...'
                : fechaAunNoLlega
                ? `Disponible el ${formatFecha(rueda.fecha_sorteo)}`
                : !aportesGenerados
                ? 'Generá los aportes primero'
                : pagoInsuficiente
                ? `Faltan pagos (${pagados}/${contribuyentes.length})`
                : 'Realizar sorteo'}
            </button>

            {aportesGenerados && (
              <p className="text-xs text-muted mt-2 no-print">
                Pagos al día: {pagados}/{contribuyentes.length} ({Math.round(porcentajePagado * 100)}%) · se necesita
                al menos {Math.round(UMBRAL_PAGO * 100)}% para poder sortear.
              </p>
            )}
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
                  <p className="font-mono text-ink">{formatMonto(s.monto_entregado, rueda.moneda)}</p>
                  <p className="text-xs text-muted">{formatFecha(s.fecha)}</p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {ceremonia && (
        <RuletaSorteo
          // Mismo orden que usa el servidor (por id), para que la rueda no se reacomode al llegar el resultado.
          participantes={[...activos].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))}
          rueda={rueda}
          montoEstimado={rueda.monto_aporte * contribuyentes.length}
          onGirar={girarEnServidor}
          onCerrar={cerrarCeremonia}
        />
      )}
    </div>
  )
}
