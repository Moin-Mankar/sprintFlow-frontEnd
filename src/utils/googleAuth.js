const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const TOKEN_IN_TEXT = /"token"\s*:\s*"([^"]+)"/

export const GOOGLE_TOKEN_MESSAGE = 'sprintflow:google-token'

// The OAuth callback page and this app share an origin, so the channel carries the token
// between them. It is origin-scoped by the browser, and Google's consent page severs
// window.opener, which is why postMessage alone cannot be the only handoff path.
const AUTH_CHANNEL = 'sprintflow-auth'

const POPUP_TIMEOUT_MS = 3 * 60 * 1000
// The handoff page closes itself the moment it posts the token, so a closed popup only
// means "cancelled" once any message still in flight has had time to arrive.
const CLOSE_GRACE_MS = 1000

// Google's registered redirect URI pins the callback host to `localhost`, while the app may
// have been opened as `127.0.0.1`, so both loopback spellings are legitimate peers and
// nothing else. Never accept a message from an arbitrary origin.
function handoffOrigins() {
  const { protocol, hostname, port, origin } = window.location
  const peerHost =
    hostname === 'localhost' ? '127.0.0.1' : hostname === '127.0.0.1' ? 'localhost' : null
  const origins = [origin]
  if (peerHost) {
    const peer = `${protocol}//${peerHost}:${port}`
    if (peer !== origin) origins.push(peer)
  }
  return origins
}

export function openGoogleLoginPopup() {
  const width = 480
  const height = 640
  const left = window.screenX + Math.round((window.outerWidth - width) / 2)
  const top = window.screenY + Math.round((window.outerHeight - height) / 2)
  const features = `width=${width},height=${height},left=${left},top=${top}`

  const popup = window.open('/oauth2/authorization/google', 'sprintflow-google-login', features)
  if (!popup) {
    return Promise.reject(new Error('Popup was blocked by the browser. Allow popups and try again.'))
  }

  const allowedOrigins = handoffOrigins()

  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    let timer = null
    let closedAt = 0

    function settle(done, value) {
      clearInterval(timer)
      timer = null
      window.removeEventListener('message', onMessage)
      if (channel) {
        channel.onmessage = null
        channel.close()
        channel = null
      }
      done(value)
    }

    function closePopup() {
      try {
        popup.close()
      } catch {
        /* ignore */
      }
    }

    function acceptToken(token) {
      if (typeof token !== 'string' || !JWT_SHAPE.test(token)) return
      closePopup()
      settle(resolve, token)
    }

    function onMessage(event) {
      if (event.source !== popup) return
      if (!allowedOrigins.includes(event.origin)) return
      const { type, token } = event.data || {}
      if (type !== GOOGLE_TOKEN_MESSAGE) return
      acceptToken(token)
    }

    let channel = null
    window.addEventListener('message', onMessage)
    try {
      channel = new BroadcastChannel(AUTH_CHANNEL)
      channel.onmessage = (event) => {
        const { type, token } = event.data || {}
        if (type === GOOGLE_TOKEN_MESSAGE) acceptToken(token)
      }
    } catch {
      channel = null
    }

    timer = setInterval(() => {
      if (popup.closed) {
        if (!closedAt) closedAt = Date.now()
        else if (Date.now() - closedAt > CLOSE_GRACE_MS) {
          settle(reject, new Error('Google sign-in was cancelled.'))
        }
        return
      }
      closedAt = 0

      if (Date.now() - startedAt > POPUP_TIMEOUT_MS) {
        closePopup()
        settle(reject, new Error('Google sign-in timed out. Please try again.'))
        return
      }

      let url = ''
      let text = ''
      try {
        url = popup.location.href
        text = popup.document.documentElement.textContent || ''
      } catch {
        // Google's pages are cross-origin, and after the popup has traversed them the
        // opener may lose document access for good. That is why the callback page posts
        // the token instead; keep polling either way.
        return
      }

      if (url.includes('/login?error')) {
        closePopup()
        settle(reject, new Error('Google sign-in failed. Please try again.'))
        return
      }

      // Fallback for a bare JSON callback that the opener can still read, e.g. a built
      // frontend served by Spring itself, where no dev-server handoff page exists.
      const match = text.match(TOKEN_IN_TEXT)
      if (match && JWT_SHAPE.test(match[1])) {
        closePopup()
        settle(resolve, match[1])
      }
    }, 300)
  })
}

// DISPLAY ONLY. Never used for authentication, authorization or expiry decisions —
// the backend is the sole authority (a 401 from any API call handles invalid tokens).
export function extractEmailFromJwt(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(payload))
    return typeof claims.sub === 'string' ? claims.sub : null
  } catch {
    return null
  }
}
