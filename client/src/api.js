const TOKEN_KEY = 'farewatch_token'
const AUTH_PATHS = ['/login', '/signup']
const BACKEND_DOWN_MESSAGE = "Can't reach the server. Is the backend running?"

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

// AuthContext registers a handler so a 401 can clear the user and redirect
// through React Router. Falls back to a full page load if none is registered.
let unauthorizedHandler = () => window.location.assign('/login')

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

async function parseBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Send a request to the Flask API. `path` is the backend path, e.g. "/login".
 * Returns the parsed JSON body (or null for empty responses like 204).
 * Throws an Error with the backend's error message on failure.
 */
export async function apiFetch(path, { method = 'GET', body, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error(BACKEND_DOWN_MESSAGE)
  }

  const data = await parseBody(response)

  if (!response.ok) {
    if (response.status === 401 && !AUTH_PATHS.includes(path)) {
      clearToken()
      unauthorizedHandler()
    }
    const message = data?.error || `Request failed (${response.status})`
    const error = new Error(message)
    error.status = response.status
    throw error
  }

  return data
}
