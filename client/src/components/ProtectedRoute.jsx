import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) return <p className="loading">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
