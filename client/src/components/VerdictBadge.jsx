const VERDICT_STYLES = {
  'BOOK NOW': 'verdict-book',
  'KEEP WATCHING': 'verdict-watch',
  'NOT ENOUGH DATA': 'verdict-unknown',
}

export default function VerdictBadge({ verdict }) {
  if (!verdict) return null
  return <span className={`badge verdict ${VERDICT_STYLES[verdict]}`}>{verdict}</span>
}
