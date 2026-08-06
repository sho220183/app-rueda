import { Routes, Route } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import MemberDashboard from './pages/MemberDashboard.jsx'
import RuedaDetail from './pages/RuedaDetail.jsx'
import RuedaPublica from './pages/RuedaPublica.jsx'

function Home() {
  const { profile } = useAuth()
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
