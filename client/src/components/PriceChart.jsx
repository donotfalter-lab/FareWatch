import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDateTime, formatPrice, formatShortDate, toTimestamp } from '../utils/format'

const AXIS_TEXT = { fill: 'var(--muted)', fontSize: 13 }

// Several checks on one day would repeat its label, so each day gets one tick.
function oneTickPerDay(points) {
  const seen = new Set()
  return points
    .filter((point) => {
      const day = formatShortDate(point.time)
      if (seen.has(day)) return false
      seen.add(day)
      return true
    })
    .map((point) => point.time)
}

function PriceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { time, price } = payload[0].payload
  return (
    <div className="chart-tooltip">
      <strong>{formatPrice(price)}</strong>
      <span>{formatDateTime(time)}</span>
    </div>
  )
}

export default function PriceChart({ priceChecks, targetPrice }) {
  if (priceChecks.length < 2) {
    return <p className="muted chart-empty">Run at least 2 price checks to see a trend</p>
  }

  const points = priceChecks.map((check) => ({
    time: toTimestamp(check.checked_at),
    price: check.lowest_price,
  }))

  return (
    <div className="chart" role="img" aria-label="Line chart of the lowest price over time">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={points} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={oneTickPerDay(points)}
            tickFormatter={formatShortDate}
            tick={AXIS_TEXT}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            padding={{ left: 16, right: 16 }}
            minTickGap={24}
          />
          <YAxis
            domain={['auto', 'auto']}
            tickFormatter={formatPrice}
            tick={AXIS_TEXT}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip content={PriceTooltip} cursor={{ stroke: 'var(--muted)', strokeWidth: 1 }} />
          {targetPrice !== null && (
            <ReferenceLine
              y={targetPrice}
              ifOverflow="extendDomain"
              stroke="var(--muted)"
              strokeDasharray="6 4"
              label={{ value: 'Target', position: 'insideBottomRight', ...AXIS_TEXT }}
            />
          )}
          <Line
            dataKey="price"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--surface)', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: 'var(--primary)', stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
