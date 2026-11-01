import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api'
import ErrorMessage from '../components/ErrorMessage.jsx'

const EMPTY_FORM = {
  origin: '',
  destination: '',
  start_date: '',
  end_date: '',
  travelers: '1',
  target_price: '',
}
const AIRPORT_CODE = /^[A-Z]{3}$/

function airportCodeError(label, code) {
  if (!code) return `${label} is required`
  if (!AIRPORT_CODE.test(code)) return `${label} must be a 3-letter airport code`
  return ''
}

function validate(form) {
  const errors = {}
  const origin = airportCodeError('Origin', form.origin)
  const destination = airportCodeError('Destination', form.destination)
  if (origin) errors.origin = origin
  if (destination) errors.destination = destination

  if (!form.start_date) errors.start_date = 'Start date is required'
  if (!form.end_date) errors.end_date = 'End date is required'
  // "YYYY-MM-DD" strings sort in date order, so they can be compared directly.
  else if (form.start_date && form.end_date < form.start_date) {
    errors.end_date = 'End date cannot be before start date'
  }

  const travelers = Number(form.travelers)
  if (!form.travelers || !Number.isInteger(travelers) || travelers < 1) {
    errors.travelers = 'Travelers must be a whole number of at least 1'
  }

  if (form.target_price && Number(form.target_price) <= 0) {
    errors.target_price = 'Target price must be positive'
  }
  return errors
}

export default function TripForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    let ignore = false
    apiFetch(`/trips/${id}`)
      .then((trip) => {
        if (ignore) return
        setForm({
          origin: trip.origin,
          destination: trip.destination,
          start_date: trip.start_date,
          end_date: trip.end_date,
          travelers: String(trip.travelers),
          target_price: trip.target_price === null ? '' : String(trip.target_price),
        })
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
  }, [id, isEdit])

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
    if (fieldErrors[name]) setFieldErrors((current) => ({ ...current, [name]: '' }))
  }

  function handleChange(event) {
    updateField(event.target.name, event.target.value)
  }

  function handleCodeChange(event) {
    updateField(event.target.name, event.target.value.toUpperCase())
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const errors = validate(form)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const body = {
      ...form,
      travelers: Number(form.travelers),
      target_price: form.target_price ? Number(form.target_price) : null,
    }

    setSaving(true)
    try {
      const saved = isEdit
        ? await apiFetch(`/trips/${id}`, { method: 'PATCH', body })
        : await apiFetch('/trips', { method: 'POST', body })
      navigate(`/trips/${saved.id}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  function handleCancel() {
    navigate(isEdit ? `/trips/${id}` : '/')
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

  return (
    <form className="card form form-wide" onSubmit={handleSubmit} noValidate>
      <h1>{isEdit ? 'Edit Trip' : 'New Trip'}</h1>
      <ErrorMessage message={error} />

      <div className="form-row">
        <div className="field">
          <label htmlFor="origin">Origin *</label>
          <input
            id="origin"
            name="origin"
            value={form.origin}
            onChange={handleCodeChange}
            maxLength={3}
            placeholder="ATL"
            aria-invalid={Boolean(fieldErrors.origin)}
          />
          {fieldErrors.origin && <p className="field-error">{fieldErrors.origin}</p>}
        </div>

        <div className="field">
          <label htmlFor="destination">Destination *</label>
          <input
            id="destination"
            name="destination"
            value={form.destination}
            onChange={handleCodeChange}
            maxLength={3}
            placeholder="LAX"
            aria-invalid={Boolean(fieldErrors.destination)}
          />
          {fieldErrors.destination && <p className="field-error">{fieldErrors.destination}</p>}
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="start_date">Start date *</label>
          <input
            id="start_date"
            name="start_date"
            type="date"
            value={form.start_date}
            onChange={handleChange}
            aria-invalid={Boolean(fieldErrors.start_date)}
          />
          {fieldErrors.start_date && <p className="field-error">{fieldErrors.start_date}</p>}
        </div>

        <div className="field">
          <label htmlFor="end_date">End date *</label>
          <input
            id="end_date"
            name="end_date"
            type="date"
            value={form.end_date}
            onChange={handleChange}
            aria-invalid={Boolean(fieldErrors.end_date)}
          />
          {fieldErrors.end_date && <p className="field-error">{fieldErrors.end_date}</p>}
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="travelers">Travelers *</label>
          <input
            id="travelers"
            name="travelers"
            type="number"
            min="1"
            step="1"
            value={form.travelers}
            onChange={handleChange}
            aria-invalid={Boolean(fieldErrors.travelers)}
          />
          {fieldErrors.travelers && <p className="field-error">{fieldErrors.travelers}</p>}
        </div>

        <div className="field">
          <label htmlFor="target_price">Target price (USD)</label>
          <input
            id="target_price"
            name="target_price"
            type="number"
            min="1"
            step="any"
            value={form.target_price}
            onChange={handleChange}
            aria-invalid={Boolean(fieldErrors.target_price)}
          />
          {fieldErrors.target_price && <p className="field-error">{fieldErrors.target_price}</p>}
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={handleCancel}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Trip'}
        </button>
      </div>
    </form>
  )
}
