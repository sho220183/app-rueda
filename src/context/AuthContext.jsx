import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId, userMeta) {
    let { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()

    if (error && error.code === 'PGRST116') {
      // No existe el perfil (el trigger no llegó a crearlo): lo creamos nosotros como respaldo.
      const meta = userMeta || {}
      const insertResult = await supabase
        .from('profiles')
        .insert({
          id: userId,
          nombre: meta.nombre || meta.email || 'Sin nombre',
          telefono: meta.telefono || meta.phone || null,
          rol: meta.rol || 'miembro'
        })
        .select('*')
        .single()
      data = insertResult.data
      error = insertResult.error
    }

    if (error) {
      console.error('No se pudo cargar el perfil:', error.message)
      setProfileError(error.message)
      setProfile(null)
    } else {
      setProfileError(null)
      setProfile(data)
      if (data?.telefono) {
        supabase.rpc('vincular_miembro_por_telefono').then(null, () => {})
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) await loadProfile(session.user.id, { ...session.user.user_metadata, email: session.user.email })
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session?.user) {
        await loadProfile(session.user.id, { ...session.user.user_metadata, email: session.user.email })
      } else {
        setProfile(null)
        setProfileError(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signUp({ email, password, nombre, telefono, rol }) {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre, telefono, rol } }
    })
  }

  async function signIn({ email, password }) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    return supabase.auth.signOut()
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    profileError,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile: () =>
      session?.user &&
      loadProfile(session.user.id, { ...session.user.user_metadata, email: session.user.email })
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
