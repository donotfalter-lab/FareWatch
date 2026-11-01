import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, clearToken, getToken, setToken, setUnauthorizedHandler } from '../api'

const AuthContext = createContext(null)
const PUBLIC_PATHS = ['/login', '/signup']

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(getToken()))
  const navigate = useNavigate()

  // Any 401 from a protected request means the token is no longer good.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      if (!PUBLIC_PATHS.includes(window.location.pathname)) {
        navigate('/login', { replace: true })
      }
    })
  }, [navigate])

  // On first load, restore the user from a saved token.
  useEffect(() => {
    if (!getToken()) return
    let ignore = false
    apiFetch('/me')
      .then((me) => {
        if (!ignore) setUser(me)
      })
      .catch(() => {
        // A 401 is handled by the api wrapper. For anything else (e.g. the
        // backend is down) keep the token so a later refresh can retry.
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await apiFetch('/login', { method: 'POST', body: { username, password } })
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const signup = useCallback(async (username, password) => {
    const data = await apiFetch('/signup', { method: 'POST', body: { username, password } })
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    navigate('/login', { replace: true })
  }, [navigate])

  const value = useMemo(
    () => ({ user, loading, login, signup, logout }),
    [user, loading, login, signup, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
