import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext.jsx'
import TopBar from '../components/TopBar.jsx'

const FRECUENCIAS = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' }
]

export default function AdminDashboard() {
  const { user } = useAuth()
  const [ruedas, setRuedas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    nombre: '',
    monto_aporte: '',
    frecuencia: 'mensual',
    fecha_inicio: new Date().toISOString().slice(0, 10)
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadRuedas() {
    setLoading(true)
    const { data, error } = await supabase
      .from('ruedas')
      .select('*, rueda_miembros(count)')
      .order('created_at', { ascending: false })
    if (!error) setRuedas(data)
    setLoading(false)
  }

  useEffect(() => {
    loadRuedas()
  }, [])

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
    setForm({ nombre: '', monto_aporte: '', frecuencia: 'mensual', fecha_inicio: new Date().toISOString().slice(0, 10) })
    loadRuedas()
  }

  return (
    <div className="min-h-screen bg-bg font-body">
      <TopBar />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl text-ink">Tus ruedas</h1>
            <p className="text-muted text-sm">Administrá tus grupos de ahorro rotativo</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-primary hover:bg-primary-dark transition text-white text-sm rounded-sm px-4 py-2"
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
                  value={form.monto_aporte}
                  onChange={(e) => setForm({ ...form, monto_aporte: e.target.value })}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Frecuencia de sorteo</label>
                <select
                  value={form.frecuencia}
                  onChange={(e) => setForm({ ...form, frecuencia: e.target.value })}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
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
                className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
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
        ) : ruedas.length === 0 ? (
          <div className="text-center py-16 text-muted text-sm border border-dashed border-line rounded-lg">
            Todavía no creaste ninguna rueda. Usá "+ Nueva rueda" para empezar.
          </div>
        ) : (
          <div className="grid gap-3">
            {ruedas.map((r) => (
              <Link
                key={r.id}
                to={`/ruedas/${r.id}`}
                className="bg-surface border border-line rounded-lg p-4 flex items-center justify-between hover:border-primary transition"
              >
                <div>
                  <p className="font-medium text-ink">{r.nombre}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {r.rueda_miembros[0]?.count ?? 0} integrantes · {FRECUENCIAS.find((f) => f.value === r.frecuencia)?.label} · Ciclo {r.ciclo_actual}
                  </p>
                </div>
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
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
