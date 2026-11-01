import { formatPrice } from '../utils/format'

function PriceChange({ change }) {
  if (change === 0) return <span className="stat-value">No change</span>
  const direction = change < 0 ? 'down' : 'up'
  return (
    <span className={`stat-value price-${direction}`}>
      {change < 0 ? '▼' : '▲'} {formatPrice(Math.abs(change))}
    </span>
  )
}

export default function PriceSummary({ priceChecks }) {
  if (priceChecks.length === 0) return null

  const prices = priceChecks.map((check) => check.lowest_price)
  const latest = prices[prices.length - 1]

  return (
    <dl className="stat-grid">
      <div className="stat">
        <dt>Latest</dt>
        <dd className="stat-value">{formatPrice(latest)}</dd>
      </div>
      <div className="stat">
        <dt>Lowest</dt>
        <dd className="stat-value">{formatPrice(Math.min(...prices))}</dd>
      </div>
      <div className="stat">
        <dt>Highest</dt>
        <dd className="stat-value">{formatPrice(Math.max(...prices))}</dd>
      </div>
      <div className="stat">
        <dt>Change since first check</dt>
        <dd>
          <PriceChange change={latest - prices[0]} />
        </dd>
      </div>
    </dl>
  )
}
