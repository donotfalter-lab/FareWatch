import { useAuth } from '../context/AuthContext.jsx'

export default function Dashboard() {
  const { user } = useAuth()

  return (
    <section className="card">
      <h1>Welcome, {user.username}</h1>
      <p className="muted">Your trip watches will appear here.</p>
    </section>
  )
}
