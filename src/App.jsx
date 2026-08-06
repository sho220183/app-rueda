import { Routes, Route } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import MemberDashboard from './pages/MemberDashboard.jsx'
import RuedaDetail from './pages/RuedaDetail.jsx'
import RuedaPublica from './pages/RuedaPublica.jsx'

function Home() {
  const { profile, profileError, refreshProfile } = useAuth()

  if (profileError) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4 font-body">
        <div className="max-w-sm text-center">
          <p className="text-alert font-medium mb-2">No pudimos cargar tu perfil</p>
          <p className="text-sm text-muted mb-4">
            Tu cuenta se creó, pero falta la fila correspondiente en la tabla <code>profiles</code>. Esto suele
            pasar si el trigger <code>on_auth_user_created</code> no se ejecutó. Revisá el esquema en Supabase, o
            reintentá.
          </p>
          <button
            onClick={refreshProfile}
            className="text-sm bg-primary text-white rounded-sm px-4 py-2 hover:bg-primary-dark transition"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!profile) return null
  return profile.rol === 'admin' ? <AdminDashboard /> : <MemberDashboard />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/publico/:token" element={<RuedaPublica />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ruedas/:id"
        element={
          <ProtectedRoute>
            <RuedaDetail />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
