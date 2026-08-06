import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children, requireRole }) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg font-body text-muted">
        Cargando...
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (requireRole && profile?.rol !== requireRole) {
    return <Navigate to="/" replace />
  }

  return children
}
