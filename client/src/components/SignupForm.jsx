import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import ErrorMessage from './ErrorMessage.jsx'

const MIN_PASSWORD_LENGTH = 8

export default function SignupForm() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function validate() {
    if (!username.trim()) return 'Username is required'
    if (!password) return 'Password is required'
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    }
    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validate()
    setError(validationError)
    if (validationError) return

    setSubmitting(true)
    try {
      await signup(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <h1>Sign Up</h1>
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
        autoComplete="new-password"
      />
      <p className="hint">At least {MIN_PASSWORD_LENGTH} characters.</p>

      <button type="submit" className="button" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Sign Up'}
      </button>
      <p className="form-footer">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </form>
  )
}
