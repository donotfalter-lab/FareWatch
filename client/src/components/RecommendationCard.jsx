import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api'
import { formatDateTime, toTimestamp } from '../utils/format'
import ErrorMessage from './ErrorMessage.jsx'
import VerdictBadge from './VerdictBadge.jsx'

function explanationText(recommendation) {
  if (!recommendation.verdict) return recommendation.generated_text
  return recommendation.generated_text.split('\n').slice(1).join('\n').trim()
}

export default function RecommendationCard({ recommendation, onDeleted }) {
  const [copyLabel, setCopyLabel] = useState('Copy')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const resetTimer = useRef(null)

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(recommendation.generated_text)
      setCopyLabel('Copied!')
    } catch {
      setCopyLabel('Copy failed')
    }
    clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setCopyLabel('Copy'), 2000)
  }

  async function handleDelete() {
    if (!window.confirm('Delete this recommendation?')) return
    setError('')
    setDeleting(true)
    try {
      await apiFetch(`/recommendations/${recommendation.id}`, { method: 'DELETE' })
      onDeleted(recommendation.id)
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  return (
    <article className="recommendation-card">
      <VerdictBadge verdict={recommendation.verdict} />
      <p className="recommendation-question">{recommendation.prompt}</p>
      <p className="preserve-lines">{explanationText(recommendation)}</p>
      <ErrorMessage message={error} />
      <div className="recommendation-footer">
        <time className="muted" dateTime={recommendation.created_at}>
          {formatDateTime(toTimestamp(recommendation.created_at))}
        </time>
        <div className="button-row">
          <button type="button" className="button button-secondary button-small" onClick={handleCopy}>
            {copyLabel}
          </button>
          <button
            type="button"
            className="button button-danger button-small"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </article>
  )
}
