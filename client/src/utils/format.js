const CURRENT_YEAR = new Date().getFullYear()

const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

// new Date("2026-11-20") is read as midnight UTC, which shows as Nov 19 in the
// Americas. Building the date from its parts keeps it in the viewer's own timezone.
export function formatDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  const options = { month: 'short', day: 'numeric' }
  if (year !== CURRENT_YEAR) options.year = 'numeric'
  return new Date(year, month - 1, day).toLocaleDateString('en-US', options)
}

export function formatPrice(number) {
  return priceFormatter.format(number)
}

export function formatTravelers(count) {
  return `${count} ${count === 1 ? 'traveler' : 'travelers'}`
}
