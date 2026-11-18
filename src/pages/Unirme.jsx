import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext.jsx'
import Footer from '../components/Footer.jsx'
import { mensajeDeError } from '../lib/errores.js'

// Opción B: link personal de un solo uso que el admin manda por WhatsApp.
// Muestra a qué rueda te invitan; si no tenés sesión te manda a login
// y vuelve acá; al aceptar, tu cuenta queda vinculada a tu lugar.
export default function Unirme() {
  const { token } = useParams()
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [inv, setInv] = useState(null)
  const [estado, setEstado] = useState('cargando') // cargando | ok | invalida
  const [error, setError] = useState('')
  const [aceptando, setAceptando] = useState(false)

  useEffect(() => {
    supabase.rpc('ver_invitacion', { p_token: token }).then(({ data, error }) => {
      if (error || !data) setEstado('invalida')
      else {
        setInv(data)
        setEstado('ok')
      }
    })
  }, [token])

  async function aceptar() {
    setAceptando(true)
    setError('')
    const { data, error } = await supabase.rpc('aceptar_invitacion', { p_token: token })
    setAceptando(false)
    if (error) {
      setError(mensajeDeError(error, 'No se pudo aceptar la invitación'))
      return
    }
    navigate(`/ruedas/${data}`, { replace: true })
  }

  const next = encodeURIComponent(`/unirme/${token}`)
  const noUsable = inv && (inv.vencida || inv.ya_vinculada)

  return (
    <div className="min-h-screen bg-bg font-body flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary text-gold-light font-display text-xl mb-4">
              R
            </div>
            <h1 className="font-display text-2xl text-ink">Invitación a una rueda</h1>
          </div>

          <div className="bg-surface border border-line rounded-lg p-6">
            {estado === 'cargando' || authLoading ? (
              <p className="text-sm text-muted text-center">Cargando...</p>
            ) : estado === 'invalida' ? (
              <p className="text-sm text-muted text-center">
                Este link de invitación no es válido o ya fue usado. Pedile al administrador que te mande uno nuevo.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  {inv.admin_nombre} te invitó a la rueda
                </p>
                <p className="font-display text-xl text-ink mt-1">{inv.rueda_nombre}</p>
                <p className="text-sm text-muted mt-1">
                  Aporte {inv.moneda === 'PYG' ? 'Gs.' : inv.moneda} {Number(inv.monto_aporte).toLocaleString('es-PY')} ·{' '}
                  {inv.frecuencia}
                </p>
                <p className="text-sm text-ink mt-4">
                  Tu lugar: <span className="font-medium">{inv.miembro_nombre}</span>
                </p>

                {noUsable ? (
                  <p className="text-sm text-alert mt-4">
                    {inv.ya_vinculada
                      ? 'Este lugar ya está vinculado a una cuenta.'
                      : 'Esta invitación venció. Pedile al administrador una nueva.'}
                  </p>
                ) : session ? (
                  <button
                    onClick={aceptar}
                    disabled={aceptando}
                    className="w-full mt-5 bg-primary hover:bg-primary-dark transition text-white rounded-sm py-2.5 text-sm font-medium disabled:opacity-60"
                  >
                    {aceptando ? 'Uniéndote...' : 'Aceptar y unirme'}
                  </button>
                ) : (
                  <div className="mt-5 space-y-2">
                    <Link
                      to={`/login?next=${next}&modo=registro`}
                      className="block text-center w-full bg-primary hover:bg-primary-dark transition text-white rounded-sm py-2.5 text-sm font-medium"
                    >
                      Crear mi cuenta
                    </Link>
                    <Link
                      to={`/login?next=${next}`}
                      className="block text-center w-full border border-line rounded-sm py-2.5 text-sm text-ink hover:border-primary transition"
                    >
                      Ya tengo cuenta
                    </Link>
                  </div>
                )}

                {error && <p className="text-alert text-sm mt-3">{error}</p>}
                <p className="text-xs text-muted mt-5">
                  Este link es personal y se puede usar una sola vez. No lo reenvíes.
                </p>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
