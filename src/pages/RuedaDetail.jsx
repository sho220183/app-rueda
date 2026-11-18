import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext.jsx'
import TopBar from '../components/TopBar.jsx'
import WheelVisual from '../components/WheelVisual.jsx'
import AportesSection from '../components/AportesSection.jsx'
import SorteoSection from '../components/SorteoSection.jsx'
import CalendarioRueda from '../components/CalendarioRueda.jsx'
import AdminSecundario from '../components/AdminSecundario.jsx'
import Footer from '../components/Footer.jsx'
import { buildWaLink } from '../lib/whatsapp.js'
import { exportarRuedaExcel } from '../lib/exportExcel.js'
import { copiarTexto, esNativo, urlPublica } from '../lib/plataforma.js'
import { mensajeDeError } from '../lib/errores.js'
import { formatMonto } from '../lib/formato.js'
import { useAvisos } from '../components/Avisos.jsx'

const ESTADO_LABEL = { activo: 'Activo', ganador: 'Ya ganó este ciclo', retirado: 'Retirado' }

export default function RuedaDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [rueda, setRueda] = useState(null)
  const [miembros, setMiembros] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', telefono: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [eventos, setEventos] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [showEditRueda, setShowEditRueda] = useState(false)
  const [editRueda, setEditRueda] = useState(null)
  const [savingRueda, setSavingRueda] = useState(false)
  const [editandoMiembroId, setEditandoMiembroId] = useState(null)
  const [editMiembro, setEditMiembro] = useState({ nombre: '', telefono: '' })
  const [savingMiembro, setSavingMiembro] = useState(false)
  const [invitandoId, setInvitandoId] = useState(null)
  const [invitacion, setInvitacion] = useState(null) // { miembroId, link, mensaje }
  const aviso = useAvisos()

  async function handleExportar() {
    setExportando(true)
    try {
      await exportarRuedaExcel(rueda)
      if (!esNativo) aviso.exito('Reporte descargado', { detalle: 'Integrantes, aportes y sorteos en un archivo de Excel.' })
    } catch (e) {
      // Cerrar el menú de compartir sin elegir nada no es un error.
      if (!/cancel/i.test(e?.message || '')) aviso.error(e, 'No se pudo generar el reporte')
    }
    setExportando(false)
  }

  const esPrincipal = rueda && user && rueda.admin_id === user.id
  const esCoadmin = rueda && user && rueda.co_admin_id === user.id
  const esAdmin = esPrincipal || esCoadmin
  const ruedaActiva = rueda?.estado === 'activa'
  const puedeGestionar = esAdmin && ruedaActiva
  const linkPublico = rueda ? urlPublica(`/publico/${rueda.token}`) : ''

  function mensajeRecordatorio(nombre) {
    return `Hola ${nombre.split(' ')[0]}! Te escribo por la rueda "${rueda.nombre}". Te recuerdo tu aporte de ${formatMonto(
      rueda.monto_aporte,
      rueda.moneda
    )} de este período. Podés ver el estado de la rueda acá: ${linkPublico}`
  }

  async function copiarLink() {
    if (await copiarTexto(linkPublico)) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
      aviso.exito('Link copiado', { detalle: 'Cualquiera con el link ve el estado de la rueda, sin teléfonos.' })
    } else {
      aviso.error('No se pudo copiar el link', { detalle: linkPublico })
    }
  }

  async function loadAll() {
    setLoading(true)
    const [{ data: r }, { data: m }] = await Promise.all([
      supabase.from('ruedas').select('*').eq('id', id).single(),
      supabase.from('rueda_miembros').select('*').eq('rueda_id', id).order('fecha_ingreso')
    ])
    setRueda(r)
    setMiembros(m || [])
    setLoading(false)

    if (r) {
      const [{ data: aportesPeriodo }, { data: sorteosHistoricos }] = await Promise.all([
        supabase
          .from('aportes')
          .select('fecha_vencimiento')
          .eq('rueda_id', r.id)
          .eq('ciclo', r.ciclo_actual)
          .eq('periodo', r.periodo_actual)
          .limit(1),
        supabase.from('sorteos').select('fecha, ciclo, periodo').eq('rueda_id', r.id)
      ])
      const evts = []
      if (aportesPeriodo?.[0]) evts.push({ fecha: aportesPeriodo[0].fecha_vencimiento, tipo: 'pago' })
      if (r.fecha_sorteo) evts.push({ fecha: r.fecha_sorteo, tipo: 'sorteo_programado' })
      ;(sorteosHistoricos || []).forEach((s) =>
        evts.push({ fecha: s.fecha, tipo: 'sorteo_realizado', label: `Sorteo realizado · ciclo ${s.ciclo}, período ${s.periodo}` })
      )
      setEventos(evts)
    }
    setRefreshKey((k) => k + 1)
  }

  useEffect(() => {
    loadAll()
  }, [id])

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { data, error } = await supabase
      .from('rueda_miembros')
      .insert({
        rueda_id: id,
        nombre: nuevo.nombre,
        telefono: nuevo.telefono || null
      })
      .select('id')
      .single()
    setSaving(false)
    if (error) {
      setError(mensajeDeError(error, 'No se pudo agregar al integrante'))
      return
    }
    aviso.exito(`${nuevo.nombre} se sumó a la rueda`, { detalle: 'Tocá "Invitar" para que vea la rueda desde su celular.' })
    setNuevo({ nombre: '', telefono: '' })
    setShowAdd(false)
    loadAll()
  }

  function abrirEdicionRueda() {
    setEditRueda({
      nombre: rueda.nombre,
      monto_aporte: rueda.monto_aporte,
      frecuencia: rueda.frecuencia,
      fecha_inicio: rueda.fecha_inicio
    })
    setShowEditRueda(true)
  }

  async function guardarEdicionRueda(e) {
    e.preventDefault()
    setSavingRueda(true)
    const { error } = await supabase
      .from('ruedas')
      .update({
        nombre: editRueda.nombre,
        monto_aporte: Number(editRueda.monto_aporte),
        frecuencia: editRueda.frecuencia,
        fecha_inicio: editRueda.fecha_inicio
      })
      .eq('id', rueda.id)
    setSavingRueda(false)
    if (error) {
      aviso.error(error, 'No se pudieron guardar los cambios')
      return
    }
    setShowEditRueda(false)
    aviso.exito('Cambios guardados')
    loadAll()
  }

  function abrirEdicionMiembro(m) {
    setEditandoMiembroId(m.id)
    setEditMiembro({ nombre: m.nombre, telefono: m.telefono || '' })
  }

  async function guardarEdicionMiembro(e) {
    e.preventDefault()
    setSavingMiembro(true)
    const { error } = await supabase
      .from('rueda_miembros')
      .update({ nombre: editMiembro.nombre, telefono: editMiembro.telefono || null })
      .eq('id', editandoMiembroId)
    setSavingMiembro(false)
    if (error) {
      aviso.error(error, 'No se pudieron guardar los datos del integrante')
      return
    }
    setEditandoMiembroId(null)
    aviso.exito('Datos del integrante guardados')
    loadAll()
  }

  // Opción B: invitación personal de un solo uso (válida 14 días).
  async function invitar(m) {
    setInvitandoId(m.id)
    const { data: token, error } = await supabase.rpc('crear_invitacion', { p_miembro_id: m.id })
    setInvitandoId(null)
    if (error) {
      aviso.error(error, 'No se pudo crear la invitación')
      return
    }
    const link = urlPublica(`/unirme/${token}`)
    const mensaje = `Hola ${m.nombre.split(' ')[0]}! Te invito a la rueda "${rueda.nombre}" en La Rueda. Entrá con este link para ver tus aportes y los sorteos: ${link} (es personal y se usa una sola vez, no lo reenvíes).`
    setInvitacion({ miembroId: m.id, link, mensaje })
  }

  async function copiarInvitacion() {
    if (await copiarTexto(invitacion.mensaje)) {
      aviso.exito('Mensaje de invitación copiado', { detalle: 'Pegalo en WhatsApp o en el chat que uses con esa persona.' })
    } else {
      aviso.error('No se pudo copiar', { detalle: invitacion.link })
    }
  }

  // Desvincular no se puede deshacer desde acá (la persona necesita otra invitación): se confirma.
  async function desvincular(m) {
    const ok = await aviso.confirmar({
      titulo: `¿Desvincular la cuenta de ${m.nombre}?`,
      detalle: 'Deja de ver la rueda en su celular. Para volver a entrar vas a tener que mandarle una invitación nueva.',
      confirmar: 'Desvincular',
      peligro: true
    })
    if (!ok) return
    const { error } = await supabase.from('rueda_miembros').update({ usuario_id: null }).eq('id', m.id)
    if (error) {
      aviso.error(error, 'No se pudo desvincular la cuenta')
      return
    }
    aviso.exito(`${m.nombre} ya no tiene cuenta vinculada`)
    loadAll()
  }

  async function cambiarEstadoMiembro(m, estado) {
    const { error } = await supabase.from('rueda_miembros').update({ estado }).eq('id', m.id)
    return error
  }

  // Quitar es reversible: en vez de preguntar, se ofrece "Deshacer".
  async function handleQuitar(m) {
    const error = await cambiarEstadoMiembro(m, 'retirado')
    if (error) {
      aviso.error(error, `No se pudo quitar a ${m.nombre}`)
      return
    }
    aviso.info(`${m.nombre} salió de la rueda`, {
      detalle: 'Sus aportes ya registrados quedan en el historial.',
      accion: { etiqueta: 'Deshacer', alHacer: () => handleReactivar(m, true) }
    })
    loadAll()
  }

  async function handleReactivar(m, deshaciendo = false) {
    // El servidor decide si vuelve como activo o como "ya ganó este ciclo".
    const error = await cambiarEstadoMiembro(m, 'activo')
    if (error) {
      aviso.error(error, `No se pudo reactivar a ${m.nombre}`)
      return
    }
    aviso.exito(deshaciendo ? `${m.nombre} sigue en la rueda` : `${m.nombre} volvió a la rueda`)
    loadAll()
  }

  async function cerrarRueda() {
    const ok = await aviso.confirmar({
      titulo: `¿Cerrar "${rueda.nombre}"?`,
      detalle:
        'No se van a poder generar aportes ni hacer sorteos. Todo el historial queda disponible para consultar y exportar, y podés reabrirla cuando quieras.',
      confirmar: 'Cerrar rueda',
      peligro: true
    })
    if (!ok) return
    const { error } = await supabase.from('ruedas').update({ estado: 'finalizada' }).eq('id', rueda.id)
    if (error) {
      aviso.error(error, 'No se pudo cerrar la rueda')
      return
    }
    aviso.info('Rueda cerrada', { accion: { etiqueta: 'Reabrir', alHacer: reabrirRueda } })
    loadAll()
  }

  async function reabrirRueda() {
    const { error } = await supabase.from('ruedas').update({ estado: 'activa' }).eq('id', rueda.id)
    if (error) {
      aviso.error(error, 'No se pudo reabrir la rueda')
      return
    }
    aviso.exito('Rueda reabierta', { detalle: 'Ya podés volver a generar aportes y sortear.' })
    loadAll()
  }

  // Solo la primera carga muestra la pantalla de espera; las recargas
  // posteriores actualizan en el lugar, sin parpadeo.
  if (loading && !rueda) {
    return (
      <div className="min-h-screen bg-bg font-body flex items-center justify-center text-muted">
        Cargando rueda...
      </div>
    )
  }

  if (!rueda) {
    return (
      <div className="min-h-screen bg-bg font-body flex items-center justify-center text-muted">
        No se encontró esa rueda o no tenés acceso.
      </div>
    )
  }

  const montoFondo = Number(rueda.monto_aporte) * miembros.filter((m) => m.estado !== 'retirado').length
  const activos = miembros.filter((m) => m.estado === 'activo').length
  const ganadores = miembros.filter((m) => m.estado === 'ganador').length

  return (
    <div className="min-h-screen bg-bg font-body">
      <TopBar className="no-print" />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-3 no-print">
          <Link to="/" className="text-sm text-muted hover:text-primary">
            ← Volver a mis ruedas
          </Link>
          <div className="flex items-center gap-2">
            {/* En el celular no hay impresión: el reporte se comparte como Excel. */}
            {!esNativo && (
              <button
                onClick={() => window.print()}
                className="text-sm border border-line rounded-sm px-3 py-2 text-ink hover:border-primary transition"
              >
                Imprimir / PDF
              </button>
            )}
            {esAdmin && (
              <button
                onClick={handleExportar}
                disabled={exportando}
                className="text-sm border border-line rounded-sm px-3 py-2 text-ink hover:border-primary transition disabled:opacity-60"
              >
                {exportando ? 'Generando...' : esNativo ? 'Compartir Excel' : 'Exportar a Excel'}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 mb-6">
          <div>
            <h1 className="font-display text-2xl text-ink">{rueda.nombre}</h1>
            <p className="text-muted text-sm">
              Aporte Gs. {Number(rueda.monto_aporte).toLocaleString('es-PY')} · {rueda.frecuencia} · Ciclo {rueda.ciclo_actual}
              {!ruedaActiva && <span className="text-alert"> · Cerrada</span>}
            </p>
          </div>
          {esPrincipal && (
            <div className="flex items-center gap-3 no-print">
              <button onClick={abrirEdicionRueda} className="text-xs text-primary hover:underline">
                Editar rueda
              </button>
              <button
                onClick={ruedaActiva ? cerrarRueda : reabrirRueda}
                className={`text-xs hover:underline ${ruedaActiva ? 'text-alert' : 'text-primary'}`}
              >
                {ruedaActiva ? 'Cerrar rueda' : 'Reabrir rueda'}
              </button>
            </div>
          )}
        </div>

        {showEditRueda && (
          <form onSubmit={guardarEdicionRueda} className="bg-surface border border-line rounded-lg p-5 mb-6 space-y-4 no-print">
            <div>
              <label className="block text-xs text-muted mb-1">Nombre de la rueda</label>
              <input
                required
                value={editRueda.nombre}
                onChange={(e) => setEditRueda({ ...editRueda, nombre: e.target.value })}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted mb-1">Monto de aporte (Gs.)</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={editRueda.monto_aporte}
                  onChange={(e) => setEditRueda({ ...editRueda, monto_aporte: e.target.value })}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Frecuencia</label>
                <select
                  value={editRueda.frecuencia}
                  onChange={(e) => setEditRueda({ ...editRueda, frecuencia: e.target.value })}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                >
                  <option value="semanal">Semanal</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Fecha de inicio</label>
              <input
                type="date"
                required
                value={editRueda.fecha_inicio}
                onChange={(e) => setEditRueda({ ...editRueda, fecha_inicio: e.target.value })}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              />
              <p className="text-xs text-muted mt-1">
                Cambiarla solo afecta el cálculo de futuros vencimientos, no los aportes ya generados.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingRueda}
                className="bg-primary hover:bg-primary-dark transition text-white text-sm rounded-sm px-4 py-2 disabled:opacity-60"
              >
                {savingRueda ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button type="button" onClick={() => setShowEditRueda(false)} className="text-sm text-muted hover:underline">
                Cancelar
              </button>
            </div>
          </form>
        )}

        {!ruedaActiva && (
          <div className="bg-line/40 border border-line rounded-lg p-3 mb-6 text-sm text-muted no-print">
            Esta rueda está cerrada: no se pueden generar nuevos aportes ni sorteos. El historial sigue disponible
            para consulta y exportación.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-surface border border-line rounded-lg p-5 flex items-center justify-center">
            <WheelVisual
              miembros={miembros.filter((m) => m.estado !== 'retirado')}
              montoFondo={montoFondo}
            />
          </div>
          <div className="space-y-3">
            <div className="bg-surface border border-line rounded-lg p-4">
              <p className="text-xs text-muted uppercase tracking-wide">Fondo del período</p>
              <p className="font-mono text-2xl text-ink mt-1">Gs. {montoFondo.toLocaleString('es-PY')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface border border-line rounded-lg p-4">
                <p className="text-xs text-muted uppercase tracking-wide">Aún elegibles</p>
                <p className="font-mono text-xl text-ink mt-1">{activos}</p>
              </div>
              <div className="bg-surface border border-line rounded-lg p-4">
                <p className="text-xs text-muted uppercase tracking-wide">Ya ganaron</p>
                <p className="font-mono text-xl text-ink mt-1">{ganadores} / {miembros.filter(m => m.estado !== 'retirado').length}</p>
              </div>
            </div>
            <CalendarioRueda eventos={eventos} />
          </div>
        </div>

        {esAdmin && (
          <div className="bg-surface border border-line rounded-lg p-4 mb-8 flex items-center justify-between flex-wrap gap-3 no-print">
            <div>
              <p className="text-sm font-medium text-ink">Link de consulta para los integrantes</p>
              <p className="text-xs text-muted mt-0.5">No necesitan cuenta, solo ver el estado de la rueda</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copiarLink}
                className="text-sm border border-line rounded-sm px-3 py-2 text-ink hover:border-primary transition"
              >
                {copiado ? 'Copiado' : 'Copiar link'}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Mirá el estado de la rueda "${rueda.nombre}" acá: ${linkPublico}`)}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm bg-primary hover:bg-primary-dark transition text-white rounded-sm px-3 py-2"
              >
                Compartir por WhatsApp
              </a>
            </div>
          </div>
        )}

        {esPrincipal && <AdminSecundario rueda={rueda} onActualizado={loadAll} />}

        <AportesSection rueda={rueda} miembros={miembros} esAdmin={puedeGestionar} onRuedaActualizada={loadAll} />

        <SorteoSection
          rueda={rueda}
          miembros={miembros}
          esAdmin={puedeGestionar}
          onActualizado={loadAll}
          refreshSignal={refreshKey}
        />

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl text-ink">Integrantes</h2>
          {puedeGestionar && (
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="bg-primary hover:bg-primary-dark transition text-white text-sm rounded-sm px-4 py-2 no-print"
            >
              {showAdd ? 'Cancelar' : '+ Agregar integrante'}
            </button>
          )}
        </div>

        {showAdd && puedeGestionar && (
          <form onSubmit={handleAdd} className="bg-surface border border-line rounded-lg p-5 mb-5 space-y-4 no-print">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted mb-1">Nombre</label>
                <input
                  required
                  value={nuevo.nombre}
                  onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Teléfono (opcional)</label>
                <input
                  value={nuevo.telefono}
                  onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>
            </div>
            {error && <p className="text-alert text-sm">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary-dark transition text-white text-sm rounded-sm px-4 py-2 disabled:opacity-60"
            >
              {saving ? 'Agregando...' : 'Agregar a la rueda'}
            </button>
          </form>
        )}

        <div className="bg-surface border border-line rounded-lg divide-y divide-line">
          {miembros.length === 0 && (
            <p className="p-4 text-sm text-muted">Todavía no hay integrantes en esta rueda.</p>
          )}
          {miembros.map((m) => (
            <div key={m.id} className="p-4">
              {editandoMiembroId === m.id ? (
                <form onSubmit={guardarEdicionMiembro} className="flex items-center gap-2 flex-wrap no-print">
                  <input
                    required
                    value={editMiembro.nombre}
                    onChange={(e) => setEditMiembro({ ...editMiembro, nombre: e.target.value })}
                    className="border border-line rounded-sm px-2 py-1.5 text-sm flex-1 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-gold"
                    placeholder="Nombre"
                  />
                  <input
                    value={editMiembro.telefono}
                    onChange={(e) => setEditMiembro({ ...editMiembro, telefono: e.target.value })}
                    className="border border-line rounded-sm px-2 py-1.5 text-sm flex-1 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-gold"
                    placeholder="Teléfono"
                  />
                  <button
                    type="submit"
                    disabled={savingMiembro}
                    className="text-xs bg-primary text-white rounded-sm px-3 py-1.5 disabled:opacity-60"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoMiembroId(null)}
                    className="text-xs text-muted hover:underline"
                  >
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-ink font-medium">{m.nombre}</p>
                    <p className="text-xs text-muted">
                      {m.telefono || 'Sin teléfono'}
                      {m.usuario_id && <span className="text-primary"> · con cuenta vinculada</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {puedeGestionar && !m.usuario_id && m.estado !== 'retirado' && (
                      <button
                        onClick={() => invitar(m)}
                        disabled={invitandoId === m.id}
                        className="text-xs text-primary hover:underline disabled:opacity-60 no-print"
                      >
                        {invitandoId === m.id ? 'Generando...' : 'Invitar'}
                      </button>
                    )}
                    {puedeGestionar && m.usuario_id && m.usuario_id !== user.id && (
                      <button onClick={() => desvincular(m)} className="text-xs text-muted hover:underline no-print">
                        Desvincular
                      </button>
                    )}
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        m.estado === 'activo'
                          ? 'bg-primary/10 text-primary'
                          : m.estado === 'ganador'
                          ? 'bg-gold/20 text-gold'
                          : 'bg-line text-muted'
                      }`}
                    >
                      {ESTADO_LABEL[m.estado]}
                    </span>
                    {esAdmin && m.telefono && m.estado === 'activo' && (
                      <a
                        href={buildWaLink(m.telefono, mensajeRecordatorio(m.nombre))}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline no-print"
                      >
                        Recordar por WhatsApp
                      </a>
                    )}
                    {puedeGestionar && (
                      <button onClick={() => abrirEdicionMiembro(m)} className="text-xs text-muted hover:underline no-print">
                        Editar
                      </button>
                    )}
                    {puedeGestionar && m.estado !== 'retirado' && (
                      <button onClick={() => handleQuitar(m)} className="text-xs text-alert hover:underline no-print">
                        Quitar
                      </button>
                    )}
                    {puedeGestionar && m.estado === 'retirado' && (
                      <button onClick={() => handleReactivar(m)} className="text-xs text-primary hover:underline no-print">
                        Reactivar
                      </button>
                    )}
                  </div>
                </div>
                {invitacion?.miembroId === m.id && (
                  <div className="mt-3 bg-gold/10 border border-gold/40 rounded-sm p-3 no-print">
                    <p className="text-xs text-ink mb-2">
                      Invitación lista para {m.nombre.split(' ')[0]} (válida 14 días, un solo uso). Si generás otra, esta
                      deja de funcionar.
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {m.telefono && (
                        <a
                          href={buildWaLink(m.telefono, invitacion.mensaje)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs bg-primary hover:bg-primary-dark transition text-white rounded-sm px-3 py-1.5"
                        >
                          Enviar por WhatsApp
                        </a>
                      )}
                      <button
                        onClick={copiarInvitacion}
                        className="text-xs border border-line rounded-sm px-3 py-1.5 text-ink hover:border-primary transition"
                      >
                        Copiar mensaje
                      </button>
                      <button onClick={() => setInvitacion(null)} className="text-xs text-muted hover:underline">
                        Cerrar
                      </button>
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          ))}
        </div>

      </main>
      <Footer />
    </div>
  )
}
