import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Login and signup pages: send already logged-in users to the dashboard.
export default function PublicOnlyRoute() {
  const { user, loading } = useAuth()

  if (loading) return <p className="loading">Loading…</p>
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}
