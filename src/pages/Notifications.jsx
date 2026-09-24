import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client.js'
import { formatDateTime } from '../utils/format.js'
import { usePushMessage, usePushNotifications } from '../notifications/usePushNotifications.js'

const STATUS_TEXT = {
  unsupported: 'Push is not available in this browser. SprintFlow works normally without it.',
  inactive: '',
  disabled: 'Turn on browser notifications to hear about task assignments even when this tab is closed.',
  enabling: 'Waiting for you to choose in the browser prompt…',
  registering: 'Registering this browser with SprintFlow…',
  enabled: 'This browser is registered for push notifications.',
  error: '',
}

export default function Notifications() {
  const [items, setItems] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reload, setReload] = useState(0)
  const push = usePushNotifications()

  useEffect(() => {
    let active = true
    apiFetch('/api/notifications')
      .then((data) => {
        if (!active) return
        setItems(Array.isArray(data) ? data : [])
        setLoadError('')
      })
      .catch((err) => {
        // 401 is handled by the API client (token cleared + redirect)
        if (active && err.status !== 401) {
          setItems(null)
          setLoadError(err.message || 'Failed to load notifications.')
        }
      })
    return () => {
      active = false
    }
  }, [reload])

  // A foreground push means the backend has already stored the row, so refetch the
  // real list instead of inserting anything locally.
  usePushMessage(() => setReload((n) => n + 1))

  async function handleMarkRead(id) {
    setActionError('')
    setBusyId(id)
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
      setReload((n) => n + 1)
    } catch (err) {
      if (err.status !== 401) {
        setActionError(err.message || 'Failed to mark the notification as read.')
      }
    } finally {
      setBusyId(null)
    }
  }

  const loading = items === null && !loadError
  const unread = items ? items.filter((item) => !item.read).length : 0
  const statusText = push.message || STATUS_TEXT[push.status] || ''
  const canEnable = push.status === 'disabled' && push.permission !== 'denied'

  return (
    <section>
      <div className="page-hero">
        <div className="page-hero-main">
          <p className="page-hero-eyebrow">Inbox</p>
          <h1>Notifications</h1>
        </div>
        <div className="page-hero-actions">
          {items && items.length > 0 && (
            <span className="badge">{unread === 0 ? 'All read' : `${unread} unread`}</span>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setReload((n) => n + 1)}
          >
            Refresh
          </button>
        </div>
      </div>

      <section className="push-card">
        <div>
          <h2 className="push-card-title">Browser notifications</h2>
          {statusText && <p className="muted">{statusText}</p>}
          {push.permission === 'denied' && (
            <p className="muted">
              Your browser is blocking notifications for this site. Allow them in the site
              settings, then refresh this page.
            </p>
          )}
          <p className="muted push-card-note">
            SprintFlow sends a push when a task is assigned to you. Everything here works
            without it.
          </p>
        </div>
        {canEnable && (
          <button type="button" onClick={() => void push.enable()}>
            Enable browser notifications
          </button>
        )}
      </section>

      {loadError && (
        <div className="form-error">
          <p>{loadError}</p>
        </div>
      )}
      {actionError && (
        <div className="form-error">
          <p>{actionError}</p>
        </div>
      )}

      {loading && <p className="loading">Loading notifications…</p>}

      {!loading && !loadError && items.length === 0 && (
        <div className="empty-block">
          <p className="empty-block-title">Nothing yet</p>
          <p className="empty-block-desc">
            Task assignments and comments reach you here as they happen.
          </p>
        </div>
      )}

      {!loading && !loadError && items.length > 0 && (
        <div className="panel panel-flat">
          <ul className="row-list">
            {items.map((item) => (
              <li key={item.id}>
                <div className={'row' + (item.read ? '' : ' notification-unread')}>
                  <div className="row-main">
                    <p className="row-title">{item.message}</p>
                    <p className="row-meta">
                      <span>{formatDateTime(item.createdAt)}</span>
                    </p>
                  </div>
                  <div className="row-side">
                    {!item.read && <span className="badge badge-small">Unread</span>}
                    {!item.read && (
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={busyId === item.id}
                        onClick={() => void handleMarkRead(item.id)}
                      >
                        {busyId === item.id ? 'Marking…' : 'Mark as read'}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
