import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // undefined = todavía no sabemos si hay sesión; null = no hay sesión.
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const userId = session?.user?.id

  const loadProfile = useCallback(async (user) => {
    let { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()

    if (!error && !data) {
      // El trigger no llegó a crear el perfil: lo creamos como respaldo (sin rol).
      const meta = user.user_metadata || {}
      const insertResult = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          nombre: meta.nombre || user.email || user.phone || 'Sin nombre',
          telefono: meta.telefono || user.phone || null
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
      return
    }

    // Solo vincula por teléfono si fue verificado por SMS (lo valida el servidor).
    if (user.phone) await supabase.rpc('vincular_miembro_por_telefono')

    setProfileError(null)
    setProfile(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    // Importante: no hacer await de otras llamadas a Supabase dentro de este
    // callback (puede bloquear el cliente). La carga del perfil va en otro efecto.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setProfileError(null)
      return
    }
    loadProfile(session.user)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loadProfile])

  const loading =
    session === undefined || (!!session && !profileError && profile?.id !== session.user.id)

  async function signUp({ email, password, nombre, telefono, redirectTo }) {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre, telefono }, emailRedirectTo: redirectTo }
    })
  }

  async function signIn({ email, password }) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    return supabase.auth.signOut()
  }

  const value = {
    session: session ?? null,
    user: session?.user ?? null,
    profile,
    profileError,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile: () => session?.user && loadProfile(session.user)
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
