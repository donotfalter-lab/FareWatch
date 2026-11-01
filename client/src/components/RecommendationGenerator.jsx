import { useState } from 'react'
import { apiFetch } from '../api'
import ErrorMessage from './ErrorMessage.jsx'

const QUESTION_MIN_LENGTH = 5
const QUESTION_MAX_LENGTH = 500
const MIN_CHECKS_FOR_ADVICE = 3

export default function RecommendationGenerator({ tripId, priceCheckCount, onCreated }) {
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  // null means there is nothing to retry. An empty string is a real question: the default one.
  const [failedQuestion, setFailedQuestion] = useState(null)

  async function ask(text) {
    setError('')
    setFailedQuestion(null)
    setAsking(true)
    try {
      const recommendation = await apiFetch(`/trips/${tripId}/recommendations`, {
        method: 'POST',
        body: text ? { question: text } : undefined,
      })
      onCreated(recommendation)
      setQuestion('')
    } catch (err) {
      setError(err.message)
      setFailedQuestion(text)
    } finally {
      setAsking(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    const text = question.trim()
    if (text && text.length < QUESTION_MIN_LENGTH) {
      setFailedQuestion(null)
      setError(`Question must be at least ${QUESTION_MIN_LENGTH} characters`)
      return
    }
    ask(text)
  }

  return (
    <form className="form form-full" onSubmit={handleSubmit} noValidate>
      <label htmlFor="question">Your question (optional)</label>
      <textarea
        id="question"
        rows={3}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Should I book now or wait?"
        maxLength={QUESTION_MAX_LENGTH}
        disabled={asking}
      />
      <p className="hint">
        {question.length} / {QUESTION_MAX_LENGTH} characters
      </p>

      {priceCheckCount < MIN_CHECKS_FOR_ADVICE && (
        <p className="tip">Tip: run a few more price checks for a better recommendation.</p>
      )}

      <ErrorMessage message={error} />

      <div className="button-row">
        <button type="submit" className="button" disabled={asking}>
          {asking ? 'Analyzing price history...' : 'Ask AI'}
        </button>
        {failedQuestion !== null && !asking && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => ask(failedQuestion)}
          >
            Retry
          </button>
        )}
      </div>
    </form>
  )
}
