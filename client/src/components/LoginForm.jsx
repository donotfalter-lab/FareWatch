import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import ErrorMessage from './ErrorMessage.jsx'

export default function LoginForm() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function validate() {
    if (!username.trim()) return 'Username is required'
    if (!password) return 'Password is required'
    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validate()
    setError(validationError)
    if (validationError) return

    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <h1>Log In</h1>
      <ErrorMessage message={error} />

      <label htmlFor="username">Username</label>
      <input
        id="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
      />

      <button type="submit" className="button" disabled={submitting}>
        {submitting ? 'Logging in…' : 'Log In'}
      </button>
      <p className="form-footer">
        Don&apos;t have an account? <Link to="/signup">Sign up</Link>
      </p>
    </form>
  )
}
