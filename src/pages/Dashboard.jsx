import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext.jsx'
import { hoyLocal } from '../lib/periodos.js'
import TopBar from '../components/TopBar.jsx'
import Footer from '../components/Footer.jsx'

const FRECUENCIAS = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' }
]

const INPUT =
  'w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold'

const formVacio = () => ({ nombre: '', monto_aporte: '', frecuencia: 'mensual', fecha_inicio: hoyLocal() })

// Panel único (opción A): el rol no se elige, se deduce de los datos.
// Si creaste la rueda (o te nombraron co-admin) la administrás; si te
// invitaron, participás. Una misma cuenta puede hacer las dos cosas.
export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [administradas, setAdministradas] = useState([])
  const [participaciones, setParticipaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(formVacio)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [duplicando, setDuplicando] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: rs }, { data: ms }] = await Promise.all([
      supabase
        .from('ruedas')
        .select('*, rueda_miembros(count)')
        .or(`admin_id.eq.${user.id},co_admin_id.eq.${user.id}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('rueda_miembros')
        .select('id, estado, rueda_id, ruedas(id, nombre, ciclo_actual, estado, monto_aporte)')
        .eq('usuario_id', user.id)
    ])
    setAdministradas(rs || [])
    setParticipaciones((ms || []).filter((m) => m.ruedas))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('ruedas').insert({
      nombre: form.nombre,
      admin_id: user.id,
      monto_aporte: Number(form.monto_aporte),
      frecuencia: form.frecuencia,
      fecha_inicio: form.fecha_inicio
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setShowForm(false)
    setForm(formVacio())
    load()
  }

  async function duplicarRueda(r, e) {
    e.preventDefault()
    e.stopPropagation()
    setDuplicando(r.id)
    const { data, error } = await supabase
      .from('ruedas')
      .insert({
        nombre: `${r.nombre} (copia)`,
        admin_id: user.id,
        monto_aporte: r.monto_aporte,
        frecuencia: r.frecuencia,
        fecha_inicio: hoyLocal()
      })
      .select('id')
      .single()
    setDuplicando(null)
    if (error) {
      alert('Error al duplicar: ' + error.message)
      return
    }
    navigate(`/ruedas/${data.id}`)
  }

  return (
    <div className="min-h-screen bg-bg font-body">
      <TopBar />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* ---------- Ruedas que administro ---------- */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="font-display text-2xl text-ink">Ruedas que administrás</h1>
            <p className="text-muted text-sm">Grupos que creaste o en los que sos co-administrador</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-primary hover:bg-primary-dark transition text-white text-sm rounded-sm px-4 py-2 shrink-0"
          >
            {showForm ? 'Cancelar' : '+ Nueva rueda'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-surface border border-line rounded-lg p-5 mb-6 space-y-4">
            <div>
              <label className="block text-xs text-muted mb-1">Nombre de la rueda</label>
              <input
                required
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Rueda oficina JCG"
                className={INPUT}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted mb-1">Monto de aporte (Gs.)</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={form.monto_aporte}
                  onChange={(e) => setForm({ ...form, monto_aporte: e.target.value })}
                  className={`${INPUT} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Frecuencia de sorteo</label>
                <select
                  value={form.frecuencia}
                  onChange={(e) => setForm({ ...form, frecuencia: e.target.value })}
                  className={INPUT}
                >
                  {FRECUENCIAS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Fecha de inicio</label>
              <input
                type="date"
                required
                value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                className={INPUT}
              />
            </div>
            {error && <p className="text-alert text-sm">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary-dark transition text-white text-sm rounded-sm px-4 py-2 disabled:opacity-60"
            >
              {saving ? 'Creando...' : 'Crear rueda'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-muted text-sm">Cargando ruedas...</p>
        ) : administradas.length === 0 ? (
          <div className="text-center py-10 text-muted text-sm border border-dashed border-line rounded-lg">
            No administrás ninguna rueda. Usá "+ Nueva rueda" para crear la primera.
          </div>
        ) : (
          <div className="grid gap-3">
            {administradas.map((r) => (
              <Link
                key={r.id}
                to={`/ruedas/${r.id}`}
                className="bg-surface border border-line rounded-lg p-4 flex items-center justify-between gap-3 hover:border-primary transition"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">
                    {r.nombre}
                    {r.co_admin_id === user.id && (
                      <span className="ml-2 text-[11px] align-middle px-1.5 py-0.5 rounded-full bg-line text-muted">
                        co-admin
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {r.rueda_miembros[0]?.count ?? 0} integrantes ·{' '}
                    {FRECUENCIAS.find((f) => f.value === r.frecuencia)?.label} · Ciclo {r.ciclo_actual}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={(e) => duplicarRueda(r, e)}
                    disabled={duplicando === r.id}
                    className="text-xs text-muted hover:text-primary hover:underline disabled:opacity-60"
                  >
                    {duplicando === r.id ? 'Duplicando...' : 'Duplicar'}
                  </button>
                  <div className="text-right">
                    <p className="font-mono text-sm text-ink">Gs. {Number(r.monto_aporte).toLocaleString('es-PY')}</p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        r.estado === 'activa' ? 'bg-primary/10 text-primary' : 'bg-line text-muted'
                      }`}
                    >
                      {r.estado}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ---------- Ruedas en las que participo ---------- */}
        <h2 className="font-display text-xl text-ink mt-10 mb-1">Ruedas en las que participás</h2>
        <p className="text-muted text-sm mb-4">Tu estado como integrante</p>

        {loading ? null : participaciones.length === 0 ? (
          <div className="text-center py-10 text-muted text-sm border border-dashed border-line rounded-lg px-4">
            Todavía no estás en ninguna rueda como integrante. Cuando el administrador te mande tu link de
            invitación por WhatsApp, abrilo y la rueda va a aparecer acá.
          </div>
        ) : (
          <div className="grid gap-3">
            {participaciones.map((f) => (
              <Link
                key={f.id}
                to={`/ruedas/${f.rueda_id}`}
                className="bg-surface border border-line rounded-lg p-4 flex items-center justify-between hover:border-primary transition"
              >
                <div>
                  <p className="font-medium text-ink">{f.ruedas.nombre}</p>
                  <p className="text-xs text-muted mt-0.5">
                    Ciclo {f.ruedas.ciclo_actual} · Gs. {Number(f.ruedas.monto_aporte).toLocaleString('es-PY')}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    f.estado === 'activo'
                      ? 'bg-primary/10 text-primary'
                      : f.estado === 'ganador'
                      ? 'bg-gold/20 text-gold'
                      : 'bg-line text-muted'
                  }`}
                >
                  {f.estado === 'activo' ? 'Activo' : f.estado === 'ganador' ? 'Ya ganaste' : 'Retirado'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
