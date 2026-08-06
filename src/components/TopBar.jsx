import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function TopBar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="border-b border-line bg-surface">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-gold-light font-display text-sm flex items-center justify-center">
            R
          </div>
          <span className="font-display text-lg text-ink">La Rueda</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">{profile?.nombre}</span>
          <button onClick={handleLogout} className="text-primary hover:underline">
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}
