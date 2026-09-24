import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePushMessage } from '../notifications/usePushNotifications.js'

// In-app feedback for a push that arrives while this tab is in the foreground: the
// browser shows nothing there, so the FCM notification payload is echoed briefly.
// The payload carries only a title and a body, and nothing else is invented.
export default function PushNotice() {
  const [notice, setNotice] = useState(null)

  usePushMessage((message) => {
    if (message.body || message.title) setNotice(message)
  })

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), 8000)
    return () => clearTimeout(timer)
  }, [notice])

  if (!notice) return null

  return (
    <div className="push-notice" role="status">
      <span className="push-notice-body">{notice.body || notice.title}</span>
      <Link className="push-notice-link" to="/notifications" onClick={() => setNotice(null)}>
        View
      </Link>
      <button
        type="button"
        className="link-button push-notice-close"
        onClick={() => setNotice(null)}
      >
        Dismiss
      </button>
    </div>
  )
}
