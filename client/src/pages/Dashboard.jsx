import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import ErrorMessage from '../components/ErrorMessage.jsx'
import TripCard from '../components/TripCard.jsx'

export default function Dashboard() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    apiFetch('/trips')
      .then((data) => {
        if (!ignore) setTrips(data)
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  if (loading) return <p className="loading">Loading trips…</p>

  return (
    <section>
      <div className="page-header">
        <h1>Your Trips</h1>
        {trips.length > 0 && (
          <Link to="/trips/new" className="button">
            New Trip
          </Link>
        )}
      </div>

      <ErrorMessage message={error} />

      {!error && trips.length === 0 && (
        <div className="card empty-state">
          <p>No trips yet</p>
          <Link to="/trips/new" className="button">
            Add your first trip
          </Link>
        </div>
      )}

      <div className="trip-grid">
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} />
        ))}
      </div>
    </section>
  )
}
