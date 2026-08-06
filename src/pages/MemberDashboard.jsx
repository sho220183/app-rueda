import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext.jsx'
import TopBar from '../components/TopBar.jsx'

export default function MemberDashboard() {
  const { user } = useAuth()
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('rueda_miembros')
        .select('*, ruedas(*)')
        .eq('usuario_id', user.id)
      if (!error) setFilas(data)
      setLoading(false)
    }
    load()
  }, [user.id])

  return (
    <div className="min-h-screen bg-bg font-body">
      <TopBar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="font-display text-2xl text-ink mb-1">Tus ruedas</h1>
        <p className="text-muted text-sm mb-6">Estado de los grupos en los que participás</p>

        {loading ? (
          <p className="text-muted text-sm">Cargando...</p>
        ) : filas.length === 0 ? (
          <div className="text-center py-16 text-muted text-sm border border-dashed border-line rounded-lg">
            Todavía no estás vinculado a ninguna rueda. Pedile al administrador de tu grupo que te agregue
            con el mismo correo o teléfono con el que te registraste acá.
          </div>
        ) : (
          <div className="grid gap-3">
            {filas.map((f) => (
              <Link
                key={f.id}
                to={`/ruedas/${f.rueda_id}`}
                className="bg-surface border border-line rounded-lg p-4 flex items-center justify-between hover:border-primary transition"
              >
                <div>
                  <p className="font-medium text-ink">{f.ruedas.nombre}</p>
                  <p className="text-xs text-muted mt-0.5">Ciclo {f.ruedas.ciclo_actual}</p>
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
    </div>
  )
}
