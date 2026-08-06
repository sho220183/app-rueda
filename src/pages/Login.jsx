import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient'
import Footer from '../components/Footer.jsx'

export default function Login() {
  const [via, setVia] = useState('correo') // 'correo' | 'telefono'

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 font-body relative">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary text-gold-light font-display text-xl mb-4">
            R
          </div>
          <h1 className="font-display text-3xl text-ink">La Rueda</h1>
          <p className="text-muted text-sm mt-1">Fondos rotativos, control transparente</p>
        </div>

        <div className="flex mb-4 rounded-sm bg-line/40 p-1">
          <button
            type="button"
            onClick={() => setVia('correo')}
            className={`flex-1 py-2 text-sm rounded-sm transition ${
              via === 'correo' ? 'bg-surface shadow-sm text-ink font-medium' : 'text-muted'
            }`}
          >
            Con correo
          </button>
          <button
            type="button"
            onClick={() => setVia('telefono')}
            className={`flex-1 py-2 text-sm rounded-sm transition ${
              via === 'telefono' ? 'bg-surface shadow-sm text-ink font-medium' : 'text-muted'
            }`}
          >
            Con teléfono
          </button>
        </div>

        <div className="bg-surface rounded-lg border border-line p-6">
          {via === 'correo' ? <LoginConCorreo /> : <LoginConTelefono />}
        </div>
      </div>
      <div className="absolute bottom-4 left-0 right-0">
        <Footer />
      </div>
    </div>
  )
}

function LoginConCorreo() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', nombre: '', telefono: '', rol: 'admin' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } =
      mode === 'login'
        ? await signIn({ email: form.email, password: form.password })
        : await signUp(form)

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    if (mode === 'registro') {
      setMode('login')
      alert('Cuenta creada. Revisá tu correo si tu proyecto de Supabase requiere confirmación, o iniciá sesión directamente.')
      return
    }

    navigate('/')
  }

  return (
    <>
      <div className="flex mb-6 rounded-sm bg-bg p-1">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`flex-1 py-2 text-sm rounded-sm transition ${
            mode === 'login' ? 'bg-surface shadow-sm text-ink font-medium' : 'text-muted'
          }`}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          onClick={() => setMode('registro')}
          className={`flex-1 py-2 text-sm rounded-sm transition ${
            mode === 'registro' ? 'bg-surface shadow-sm text-ink font-medium' : 'text-muted'
          }`}
        >
          Crear cuenta
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'registro' && <CamposRegistro form={form} update={update} />}

        <div>
          <label className="block text-xs text-muted mb-1">Correo</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Contraseña</label>
          <input
            required
            type="password"
            minLength={6}
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </div>

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

function LoginConTelefono() {
  const navigate = useNavigate()
  const [paso, setPaso] = useState('numero') // 'numero' | 'codigo'
  const [telefono, setTelefono] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState('admin')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function aInternacional(t) {
    let d = t.replace(/[^\d]/g, '')
    if (d.startsWith('0')) d = '595' + d.slice(1)
    else if (!d.startsWith('595')) d = '595' + d
    return '+' + d
  }

  async function enviarCodigo(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      phone: aInternacional(telefono),
      options: { data: { nombre, rol } }
    })
    setLoading(false)
    if (error) {
      setError(error.message)
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
      setError(error.message)
      return
    }
    navigate('/')
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
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-gold"
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
        <button
          type="button"
          onClick={() => setPaso('numero')}
          className="w-full text-xs text-muted hover:text-primary"
        >
          Cambiar número
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={enviarCodigo} className="space-y-4">
      <div>
        <label className="block text-xs text-muted mb-1">Nombre completo</label>
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Número de teléfono</label>
        <input
          required
          placeholder="0981 123 456"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">¿Cómo vas a usar el sistema?</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRol('admin')}
            className={`flex-1 py-2 text-sm rounded-sm border ${
              rol === 'admin' ? 'border-primary bg-primary text-white' : 'border-line text-muted'
            }`}
          >
            Administro ruedas
          </button>
          <button
            type="button"
            onClick={() => setRol('miembro')}
            className={`flex-1 py-2 text-sm rounded-sm border ${
              rol === 'miembro' ? 'border-primary bg-primary text-white' : 'border-line text-muted'
            }`}
          >
            Soy integrante
          </button>
        </div>
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
        Si ya tenés cuenta con este número, el mismo código te inicia sesión.
      </p>
    </form>
  )
}

function CamposRegistro({ form, update }) {
  return (
    <>
      <div>
        <label className="block text-xs text-muted mb-1">Nombre completo</label>
        <input
          required
          value={form.nombre}
          onChange={(e) => update('nombre', e.target.value)}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Teléfono (WhatsApp)</label>
        <input
          value={form.telefono}
          onChange={(e) => update('telefono', e.target.value)}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">¿Cómo vas a usar el sistema?</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => update('rol', 'admin')}
            className={`flex-1 py-2 text-sm rounded-sm border ${
              form.rol === 'admin' ? 'border-primary bg-primary text-white' : 'border-line text-muted'
            }`}
          >
            Administro ruedas
          </button>
          <button
            type="button"
            onClick={() => update('rol', 'miembro')}
            className={`flex-1 py-2 text-sm rounded-sm border ${
              form.rol === 'miembro' ? 'border-primary bg-primary text-white' : 'border-line text-muted'
            }`}
          >
            Soy integrante
          </button>
        </div>
      </div>
    </>
  )
}
