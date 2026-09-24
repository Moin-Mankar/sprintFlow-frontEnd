const TOKEN_KEY = 'token'

export class ApiError extends Error {
  constructor({ status, message, fieldErrors = {}, path = null, raw = null }) {
    super(message || `Request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.path = path
    this.raw = raw
  }
}

// Backend validation failures arrive as one string: "field: msg, field: msg"
export function parseValidationMessage(message) {
  const fieldErrors = {}
  if (typeof message !== 'string' || message.length === 0) {
    return { fieldErrors, formMessage: '' }
  }

  const formParts = []
  let lastField = null

  for (const segment of message.split(', ')) {
    const match = segment.match(/^([A-Za-z][A-Za-z0-9._]*)\s*:\s*(.+)$/)
    if (match) {
      lastField = match[1]
      ;(fieldErrors[lastField] ||= []).push(match[2])
    } else if (lastField) {
      fieldErrors[lastField].push(segment)
    } else {
      formParts.push(segment)
    }
  }

  return { fieldErrors, formMessage: formParts.join(', ') }
}

function handleUnauthorized() {
  localStorage.removeItem(TOKEN_KEY)
  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

async function readBody(response) {
  if (response.status === 204 || response.status === 205) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()

  if (text === '') {
    return null
  }
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  return text
}

export async function apiFetch(url, { method = 'GET', body, headers = {}, ...rest } = {}) {
  const options = {
    method,
    headers: { Accept: 'application/json', ...headers },
    // The Bearer JWT below is the only credential this app uses. Sending the container
    // session cookie alongside it lets Spring answer for the session's principal instead,
    // and after a Google sign-in that principal is not an email, so every request would
    // fail with "Authenticated user not found" no matter which JWT is stored.
    credentials: 'omit',
    ...rest,
  }

  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    options.headers.Authorization = `Bearer ${token}`
  }

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(url, options)
  } catch {
    throw new ApiError({
      status: 0,
      message: 'Network error — the server could not be reached.',
    })
  }

  if (response.status === 401) {
    handleUnauthorized()
  }

  const data = await readBody(response)

  if (!response.ok) {
    const envelopeMessage =
      data && typeof data === 'object' ? data.message : undefined
    const fallbackMessage =
      typeof data === 'string' && data !== ''
        ? data
        : response.statusText || `Request failed (${response.status})`

    const fieldErrors =
      response.status === 400 && typeof envelopeMessage === 'string'
        ? parseValidationMessage(envelopeMessage).fieldErrors
        : {}

    throw new ApiError({
      status: response.status,
      message: envelopeMessage || fallbackMessage,
      fieldErrors,
      path: data && typeof data === 'object' ? data.path ?? null : null,
      raw: data,
    })
  }

  return data
}
