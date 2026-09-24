import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { useRealtimeStatus } from '../realtime/useProjectEvents.js'

const STATUS_LABELS = {
  idle: '',
  connecting: 'Live: connecting',
  connected: 'Live: connected',
  disconnected: 'Live: disconnected',
}

// Context comes from the path only — the navbar does not fetch names.
function readContext(pathname) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'projects') return 'Project'
  if (parts[0] === 'workspaces' && parts[1]) return 'Workspace'
  if (parts[0] === 'tasks') return 'Task'
  if (parts[0] === 'search') return 'Search'
  if (parts[0] === 'notifications') return 'Notifications'
  return ''
}

export default function Navbar() {
  const { email, logout } = useAuth()
  const status = useRealtimeStatus()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const label = STATUS_LABELS[status] || ''
  const context = readContext(pathname)

  return (
    <header className="navbar">
      <div className="navbar-left">
        <Link className="navbar-brand" to="/workspaces">
          SprintFlow
        </Link>
        {context && (
          <span className="navbar-context">
            <span className="navbar-context-sep" aria-hidden="true">
              /
            </span>
            <span className="navbar-context-item">{context}</span>
          </span>
        )}
      </div>
      <div className="navbar-right">
        {label && (
          <span className={`realtime-status realtime-status-${status}`}>{label}</span>
        )}
        <Link className="navbar-link" to="/notifications">
          Notifications
        </Link>
        {email && (
          <span className="navbar-identity">
            <span className="avatar" aria-hidden="true">
              {email[0].toUpperCase()}
            </span>
            <span className="navbar-email">{email}</span>
          </span>
        )}
        <button type="button" className="btn-ghost" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}
