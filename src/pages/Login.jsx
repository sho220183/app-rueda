import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient'
import { rutaSegura } from '../lib/periodos.js'
import Footer from '../components/Footer.jsx'
import { mensajeDeError } from '../lib/errores.js'
import { urlPublica } from '../lib/plataforma.js'

const INPUT =
  'w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold'

export default function Login() {
  const { session, loading } = useAuth()
  const [params] = useSearchParams()
  const next = rutaSegura(params.get('next'))
  const vieneDeInvitacion = next.startsWith('/unirme/')
  const [via, setVia] = useState('correo') // 'correo' | 'telefono'

  if (!loading && session) return <Navigate to={next} replace />

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 font-body relative">
      <div className="w-full max-w-sm pb-16">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary text-gold-light font-display text-xl mb-4">
            R
          </div>
          <h1 className="font-display text-3xl text-ink">La Rueda</h1>
          <p className="text-muted text-sm mt-1">Fondos rotativos, control transparente</p>
        </div>

        {vieneDeInvitacion && (
          <p className="text-sm text-ink bg-gold/10 border border-gold/40 rounded-sm p-3 mb-4">
            Iniciá sesión o creá tu cuenta para aceptar la invitación a la rueda.
          </p>
        )}

        <div className="flex mb-4 rounded-sm bg-line/40 p-1">
          {[
            ['correo', 'Con correo'],
            ['telefono', 'Con teléfono']
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setVia(value)}
              className={`flex-1 py-2 text-sm rounded-sm transition ${
                via === value ? 'bg-surface shadow-sm text-ink font-medium' : 'text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="bg-surface rounded-lg border border-line p-6">
          {via === 'correo' ? (
            <LoginConCorreo next={next} modoInicial={params.get('modo') === 'registro' ? 'registro' : 'login'} />
          ) : (
            <LoginConTelefono next={next} />
          )}
        </div>

        <p className="text-xs text-muted text-center mt-4">
          Cualquier cuenta puede crear ruedas y participar en otras. Para sumarte a una rueda existente, usá el link
          de invitación que te manda el administrador.
        </p>
      </div>
      <div className="absolute bottom-4 left-0 right-0">
        <Footer />
      </div>
    </div>
  )
}

function LoginConCorreo({ next, modoInicial }) {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState(modoInicial)
  const [form, setForm] = useState({ email: '', password: '', nombre: '', telefono: '' })
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setAviso('')
    setLoading(true)

    const { data, error } =
      mode === 'login'
        ? await signIn({ email: form.email, password: form.password })
        : await signUp({ ...form, redirectTo: urlPublica(next) })

    setLoading(false)

    if (error) {
      setError(mensajeDeError(error, mode === 'login' ? 'No se pudo entrar' : 'No se pudo crear la cuenta'))
      return
    }

    if (mode === 'registro' && !data.session) {
      setMode('login')
      setAviso('Cuenta creada. Te mandamos un correo para confirmarla; después iniciá sesión acá.')
      return
    }

    navigate(next, { replace: true })
  }

  return (
    <>
      <div className="flex mb-6 rounded-sm bg-bg p-1">
        {[
          ['login', 'Iniciar sesión'],
          ['registro', 'Crear cuenta']
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`flex-1 py-2 text-sm rounded-sm transition ${
              mode === value ? 'bg-surface shadow-sm text-ink font-medium' : 'text-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'registro' && (
          <>
            <div>
              <label className="block text-xs text-muted mb-1">Nombre completo</label>
              <input required value={form.nombre} onChange={(e) => update('nombre', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Teléfono (WhatsApp, opcional)</label>
              <input value={form.telefono} onChange={(e) => update('telefono', e.target.value)} className={INPUT} />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs text-muted mb-1">Correo</label>
          <input
            required
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Contraseña</label>
          <input
            required
            type="password"
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            className={INPUT}
          />
        </div>

        {aviso && <p className="text-primary text-sm">{aviso}</p>}
        {error && <p className="text-alert text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary hover:bg-primary-dark transition text-white rounded-sm py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {loading ? 'Un momento...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
    </>
  )
}

function aInternacional(t) {
  let d = t.replace(/[^\d]/g, '')
  if (d.startsWith('0')) d = '595' + d.slice(1)
  else if (!d.startsWith('595')) d = '595' + d
  return '+' + d
}

function LoginConTelefono({ next }) {
  const navigate = useNavigate()
  const [paso, setPaso] = useState('numero') // 'numero' | 'codigo'
  const [telefono, setTelefono] = useState('')
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function enviarCodigo(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      phone: aInternacional(telefono),
      options: { data: nombre ? { nombre } : undefined }
    })
    setLoading(false)
    if (error) {
      setError(mensajeDeError(error, 'No se pudo enviar el código'))
      return
    }
    setPaso('codigo')
  }

  async function verificarCodigo(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      phone: aInternacional(telefono),
      token: codigo,
      type: 'sms'
    })
    setLoading(false)
    if (error) {
      setError(mensajeDeError(error, 'No se pudo verificar el código'))
      return
    }
    navigate(next, { replace: true })
  }

  if (paso === 'codigo') {
    return (
      <form onSubmit={verificarCodigo} className="space-y-4">
        <p className="text-sm text-muted">
          Te enviamos un código por SMS al <span className="font-mono">{aInternacional(telefono)}</span>.
        </p>
        <div>
          <label className="block text-xs text-muted mb-1">Código de 6 dígitos</label>
          <input
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className={`${INPUT} font-mono tracking-widest`}
          />
        </div>
        {error && <p className="text-alert text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary hover:bg-primary-dark transition text-white rounded-sm py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {loading ? 'Verificando...' : 'Verificar y entrar'}
        </button>
        <button type="button" onClick={() => setPaso('numero')} className="w-full text-xs text-muted hover:text-primary">
          Cambiar número
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={enviarCodigo} className="space-y-4">
      <div>
        <label className="block text-xs text-muted mb-1">Número de teléfono</label>
        <input
          required
          type="tel"
          autoComplete="tel"
          placeholder="0981 123 456"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          className={INPUT}
        />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Nombre completo (solo si es tu primera vez)</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} />
      </div>
      {error && <p className="text-alert text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary hover:bg-primary-dark transition text-white rounded-sm py-2.5 text-sm font-medium disabled:opacity-60"
      >
        {loading ? 'Enviando...' : 'Enviar código por SMS'}
      </button>
      <p className="text-xs text-muted text-center">
        Si el administrador te cargó con este número, al entrar quedás vinculado a tu rueda automáticamente.
      </p>
    </form>
  )
}
