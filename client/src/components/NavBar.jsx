import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function NavBar() {
  const { user, loading, logout } = useAuth()

  return (
    <header className="navbar">
      <nav className="navbar-inner">
        <Link to="/" className="brand">FareWatch</Link>

        {!loading && user && (
          <>
            <div className="nav-links">
              <NavLink to="/" end>Dashboard</NavLink>
              <NavLink to="/trips/new">New Trip</NavLink>
            </div>
            <div className="nav-user">
              <span className="username">{user.username}</span>
              <button type="button" className="button button-secondary" onClick={logout}>
                Logout
              </button>
            </div>
          </>
        )}

        {!loading && !user && (
          <div className="nav-links nav-links-end">
            <NavLink to="/login">Login</NavLink>
            <NavLink to="/signup">Sign Up</NavLink>
          </div>
        )}
      </nav>
    </header>
  )
}
