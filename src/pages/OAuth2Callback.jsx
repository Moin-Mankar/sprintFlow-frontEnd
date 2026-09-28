import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const GOOGLE_TOKEN_MESSAGE = 'sprintflow:google-token'
const AUTH_CHANNEL = 'sprintflow-auth'

export default function OAuth2Callback() {
  const navigate = useNavigate()

  useEffect(() => {
    const token = new URLSearchParams(
      window.location.hash.slice(1)
    ).get('token')

    if (!token) {
      navigate('/login?error=google', { replace: true })
      return
    }

    const message = {
      type: GOOGLE_TOKEN_MESSAGE,
      token,
    }

    // Send token to the tab that opened this popup.
    if (window.opener) {
      try {
        window.opener.postMessage(message, window.location.origin)
      } catch {
        // BroadcastChannel below is the fallback.
      }
    }

    // Same-origin fallback.
    try {
      const channel = new BroadcastChannel(AUTH_CHANNEL)
      channel.postMessage(message)
      channel.close()
    } catch {
      // BroadcastChannel may not be available.
    }

    // The opener will store the token and navigate.
    // This callback page does not need to authenticate itself.
    setTimeout(() => {
      window.close()
    }, 250)
  }, [navigate])

  return <p>Completing Google sign-in...</p>
}