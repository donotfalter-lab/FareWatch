import { formatDateTime, formatPrice, toTimestamp } from '../utils/format'

function formatStops(stops) {
  if (stops === null || stops === undefined) return '—'
  if (stops === 0) return 'Nonstop'
  return `${stops} ${stops === 1 ? 'stop' : 'stops'}`
}

export default function PriceHistoryTable({ priceChecks }) {
  if (priceChecks.length === 0) return null
  const newestFirst = [...priceChecks].reverse()

  return (
    <div className="table-wrapper">
      <table className="price-table">
        <thead>
          <tr>
            <th>Date and time</th>
            <th>Price</th>
            <th>Airline</th>
            <th>Stops</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((check) => (
            <tr key={check.id}>
              <td>{formatDateTime(toTimestamp(check.checked_at))}</td>
              <td>{formatPrice(check.lowest_price)}</td>
              <td>{check.details?.airline || '—'}</td>
              <td>{formatStops(check.details?.stops)}</td>
              <td>{check.provider === 'mock' ? 'Sample data' : 'Live'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
