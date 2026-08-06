import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AdminSecundario({ rueda, onActualizado }) {
  const [nombreCoadmin, setNombreCoadmin] = useState(null)
  const [identificador, setIdentificador] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    async function load() {
      if (!rueda.co_admin_id) {
        setNombreCoadmin(null)
        return
      }
      const { data } = await supabase.rpc('nombre_publico', { p_id: rueda.co_admin_id })
      setNombreCoadmin(data)
    }
    load()
  }, [rueda.co_admin_id])

  async function asignar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    const { error } = await supabase.rpc('asignar_coadmin', {
      p_rueda_id: rueda.id,
      p_identificador: identificador
    })
    setGuardando(false)
    if (error) {
      setError(error.message)
      return
    }
    setIdentificador('')
    setEditando(false)
    onActualizado()
  }

  async function quitar() {
    if (!confirm('¿Quitar a este co-administrador? Ya no va a poder gestionar la rueda.')) return
    const { error } = await supabase.rpc('quitar_coadmin', { p_rueda_id: rueda.id })
    if (!error) onActualizado()
  }

  return (
    <div className="bg-surface border border-line rounded-lg p-4 mb-8 no-print">
      <p className="text-sm font-medium text-ink mb-1">Co-administrador</p>

      {nombreCoadmin ? (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted">{nombreCoadmin} también puede gestionar esta rueda.</p>
          <button onClick={quitar} className="text-xs text-alert hover:underline">
            Quitar
          </button>
        </div>
      ) : !editando ? (
        <button onClick={() => setEditando(true)} className="text-sm text-primary hover:underline">
          + Asignar un co-administrador
        </button>
      ) : (
        <form onSubmit={asignar} className="flex items-center gap-2 flex-wrap mt-1">
          <input
            required
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            placeholder="Correo o teléfono de la persona (ya debe tener cuenta creada)"
            className="flex-1 min-w-[240px] border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
          />
          <button
            type="submit"
            disabled={guardando}
            className="text-sm bg-primary text-white rounded-sm px-3 py-2 disabled:opacity-60"
          >
            {guardando ? 'Asignando...' : 'Asignar'}
          </button>
          <button type="button" onClick={() => setEditando(false)} className="text-sm text-muted hover:underline">
            Cancelar
          </button>
        </form>
      )}

      {error && <p className="text-alert text-xs mt-2">{error}</p>}
    </div>
  )
}
