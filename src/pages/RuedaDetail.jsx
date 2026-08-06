import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext.jsx'
import TopBar from '../components/TopBar.jsx'
import WheelVisual from '../components/WheelVisual.jsx'
import AportesSection from '../components/AportesSection.jsx'
import SorteoSection from '../components/SorteoSection.jsx'
import { buildWaLink } from '../lib/whatsapp.js'
import { exportarRuedaExcel } from '../lib/exportExcel.js'

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

  async function handleExportar() {
    setExportando(true)
    try {
      await exportarRuedaExcel(rueda)
    } catch (e) {
      alert('Error al exportar: ' + e.message)
    }
    setExportando(false)
  }

  const esAdmin = rueda && user && rueda.admin_id === user.id
  const linkPublico = rueda ? `${window.location.origin}/publico/${rueda.token}` : ''

  function mensajeRecordatorio(nombre) {
    return `Hola ${nombre.split(' ')[0]}! Te escribo por la rueda "${rueda.nombre}". Te recuerdo tu aporte de Gs. ${Number(
      rueda.monto_aporte
    ).toLocaleString('es-PY')} de este período. Podés ver el estado de la rueda acá: ${linkPublico}`
  }

  async function copiarLink() {
    await navigator.clipboard.writeText(linkPublico)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
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
  }

  useEffect(() => {
    loadAll()
  }, [id])

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('rueda_miembros').insert({
      rueda_id: id,
      nombre: nuevo.nombre,
      telefono: nuevo.telefono || null
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setNuevo({ nombre: '', telefono: '' })
    setShowAdd(false)
    loadAll()
  }

  async function handleQuitar(miembroId) {
    if (!confirm('¿Quitar a este integrante de la rueda? Sus aportes ya registrados quedan en el historial.')) return
    const { error } = await supabase.from('rueda_miembros').update({ estado: 'retirado' }).eq('id', miembroId)
    if (!error) loadAll()
  }

  async function handleReactivar(miembroId) {
    const { error } = await supabase.from('rueda_miembros').update({ estado: 'activo' }).eq('id', miembroId)
    if (!error) loadAll()
  }

  if (loading) {
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
            <button
              onClick={() => window.print()}
              className="text-sm border border-line rounded-sm px-3 py-2 text-ink hover:border-primary transition"
            >
              Imprimir / PDF
            </button>
            {esAdmin && (
              <button
                onClick={handleExportar}
                disabled={exportando}
                className="text-sm border border-line rounded-sm px-3 py-2 text-ink hover:border-primary transition disabled:opacity-60"
              >
                {exportando ? 'Generando...' : 'Exportar a Excel'}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 mb-6">
          <div>
            <h1 className="font-display text-2xl text-ink">{rueda.nombre}</h1>
            <p className="text-muted text-sm">
              Aporte Gs. {Number(rueda.monto_aporte).toLocaleString('es-PY')} · {rueda.frecuencia} · Ciclo {rueda.ciclo_actual}
            </p>
          </div>
        </div>

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
                {copiado ? 'Copiado ✓' : 'Copiar link'}
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

        <AportesSection rueda={rueda} miembros={miembros} esAdmin={esAdmin} onRuedaActualizada={loadAll} />

        <SorteoSection rueda={rueda} miembros={miembros} esAdmin={esAdmin} onActualizado={loadAll} />

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl text-ink">Integrantes</h2>
          {esAdmin && (
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="bg-primary hover:bg-primary-dark transition text-white text-sm rounded-sm px-4 py-2 no-print"
            >
              {showAdd ? 'Cancelar' : '+ Agregar integrante'}
            </button>
          )}
        </div>

        {showAdd && (
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
            <div key={m.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-ink font-medium">{m.nombre}</p>
                <p className="text-xs text-muted">{m.telefono || 'Sin teléfono'}</p>
              </div>
              <div className="flex items-center gap-3">
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
                {esAdmin && m.estado !== 'retirado' && (
                  <button onClick={() => handleQuitar(m.id)} className="text-xs text-alert hover:underline no-print">
                    Quitar
                  </button>
                )}
                {esAdmin && m.estado === 'retirado' && (
                  <button onClick={() => handleReactivar(m.id)} className="text-xs text-primary hover:underline no-print">
                    Reactivar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

      </main>
    </div>
  )
}
