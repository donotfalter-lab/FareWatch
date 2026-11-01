import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api'
import ErrorMessage from '../components/ErrorMessage.jsx'
import PriceChart from '../components/PriceChart.jsx'
import PriceChecker from '../components/PriceChecker.jsx'
import PriceHistoryTable from '../components/PriceHistoryTable.jsx'
import PriceSummary from '../components/PriceSummary.jsx'
import RecommendationGenerator from '../components/RecommendationGenerator.jsx'
import RecommendationList from '../components/RecommendationList.jsx'
import VerdictBadge from '../components/VerdictBadge.jsx'
import { formatDate, formatPrice, formatTravelers } from '../utils/format'

export default function TripDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [trip, setTrip] = useState(null)
  const [priceChecks, setPriceChecks] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let ignore = false
    apiFetch(`/trips/${id}`)
      .then((data) => {
        if (ignore) return
        const { price_checks: savedChecks, recommendations: savedAdvice, ...details } = data
        setTrip(details)
        setPriceChecks(savedChecks)
        setRecommendations(savedAdvice)
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

  // Worked out from priceChecks so a new check updates them right away.
  const latestPrice = priceChecks.length ? priceChecks[priceChecks.length - 1].lowest_price : null
  const atOrBelowTarget =
    latestPrice !== null && trip.target_price !== null && latestPrice <= trip.target_price

  return (
    <div className="stack">
      <section className="card">
        <div className="detail-header">
          <div className="detail-title">
            <h1>{trip.origin} → {trip.destination}</h1>
            <VerdictBadge verdict={recommendations[0]?.verdict} />
          </div>
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
              {latestPrice === null ? 'No price checks yet' : formatPrice(latestPrice)}
            </dd>
          </div>
        </dl>

        {atOrBelowTarget && <span className="badge">At or below target</span>}
      </section>

      <section className="card price-history">
        <h2>Price History</h2>
        <PriceChecker
          tripId={trip.id}
          onChecked={(priceCheck) => setPriceChecks((current) => [...current, priceCheck])}
        />
        <PriceSummary priceChecks={priceChecks} />
        <PriceChart priceChecks={priceChecks} targetPrice={trip.target_price} />
        <PriceHistoryTable priceChecks={priceChecks} />
      </section>

      <section className="card should-i-book">
        <h2>Should I Book?</h2>
        <RecommendationGenerator
          tripId={trip.id}
          priceCheckCount={priceChecks.length}
          onCreated={(recommendation) =>
            setRecommendations((current) => [recommendation, ...current])
          }
        />
        <RecommendationList
          recommendations={recommendations}
          onDeleted={(deletedId) =>
            setRecommendations((current) => current.filter((rec) => rec.id !== deletedId))
          }
        />
      </section>
    </div>
  )
}
