import { useState } from 'react'
import { apiFetch } from '../api'
import ErrorMessage from './ErrorMessage.jsx'

const WAIT_MESSAGE = 'Please wait a moment before checking again'

export default function PriceChecker({ tripId, onChecked }) {
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  async function handleCheck() {
    setError('')
    setChecking(true)
    try {
      const priceCheck = await apiFetch(`/trips/${tripId}/price-checks`, { method: 'POST' })
      onChecked(priceCheck)
    } catch (err) {
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="price-checker">
      <button type="button" className="button" onClick={handleCheck} disabled={checking}>
        {checking ? 'Checking prices...' : 'Check Price Now'}
      </button>

      <ErrorMessage message={error} />
      {error && error !== WAIT_MESSAGE && (
        <button
          type="button"
          className="button button-secondary"
          onClick={handleCheck}
          disabled={checking}
        >
          Retry
        </button>
      )}
    </div>
  )
}
