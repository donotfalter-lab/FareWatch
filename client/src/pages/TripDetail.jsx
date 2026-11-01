import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api'
import ErrorMessage from '../components/ErrorMessage.jsx'
import { formatDate, formatPrice, formatTravelers } from '../utils/format'

export default function TripDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [trip, setTrip] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let ignore = false
    apiFetch(`/trips/${id}`)
      .then((data) => {
        if (!ignore) setTrip(data)
      })
      .catch((err) => {
        if (ignore) return
        if (err.status === 404) setNotFound(true)
        else setError(err.message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [id])

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete your ${trip.origin} → ${trip.destination} trip? ` +
        'This also deletes its price history and recommendations.',
    )
    if (!confirmed) return
    setError('')
    setDeleting(true)
    try {
      await apiFetch(`/trips/${id}`, { method: 'DELETE' })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  if (loading) return <p className="loading">Loading trip…</p>

  if (notFound) {
    return (
      <section className="card not-found">
        <h1>Trip not found</h1>
        <p className="muted">It may have been deleted, or the link is wrong.</p>
        <Link to="/">Back to dashboard</Link>
      </section>
    )
  }

  if (!trip) return <ErrorMessage message={error} />

  return (
    <div className="stack">
      <section className="card">
        <div className="detail-header">
          <h1>{trip.origin} → {trip.destination}</h1>
          <div className="button-row">
            <Link to={`/trips/${id}/edit`} className="button button-secondary">
              Edit
            </Link>
            <button
              type="button"
              className="button button-danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>

        <ErrorMessage message={error} />

        <dl className="trip-facts">
          <div>
            <dt>Dates</dt>
            <dd>{formatDate(trip.start_date)} to {formatDate(trip.end_date)}</dd>
          </div>
          <div>
            <dt>Travelers</dt>
            <dd>{formatTravelers(trip.travelers)}</dd>
          </div>
          <div>
            <dt>Target price</dt>
            <dd>{trip.target_price === null ? 'Not set' : formatPrice(trip.target_price)}</dd>
          </div>
          <div>
            <dt>Latest price</dt>
            <dd>
              {trip.latest_price === null ? 'No price checks yet' : formatPrice(trip.latest_price)}
            </dd>
          </div>
        </dl>

        {trip.at_or_below_target && <span className="badge">At or below target</span>}
      </section>

      <section className="card">
        <h2>Price History</h2>
        <p className="muted">The price history chart is coming soon.</p>
      </section>

      <section className="card">
        <h2>Should I Book?</h2>
        <p className="muted">AI booking recommendations are coming soon.</p>
      </section>
    </div>
  )
}
