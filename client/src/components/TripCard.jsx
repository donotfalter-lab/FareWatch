import { Link } from 'react-router-dom'
import { formatDate, formatPrice, formatTravelers } from '../utils/format'

export default function TripCard({ trip }) {
  return (
    <Link to={`/trips/${trip.id}`} className="card trip-card">
      <h2>{trip.origin} → {trip.destination}</h2>
      <p className="muted">{formatDate(trip.start_date)} to {formatDate(trip.end_date)}</p>
      <p className="muted">{formatTravelers(trip.travelers)}</p>

      <div className="trip-card-prices">
        {trip.latest_price === null ? (
          <p className="muted">No price checks yet</p>
        ) : (
          <p className="trip-price">{formatPrice(trip.latest_price)}</p>
        )}
        {trip.target_price !== null && (
          <p className="muted">Target {formatPrice(trip.target_price)}</p>
        )}
      </div>

      {trip.at_or_below_target && <span className="badge">At or below target</span>}
    </Link>
  )
}
