import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'

export default function JoinInvitation() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState('idle') // idle | submitting | success
  const [error, setError] = useState('')

  async function handleAccept() {
    setState('submitting')
    setError('')
    try {
      await apiFetch(`/api/invitations/${encodeURIComponent(token)}/join`, {
        method: 'POST',
      })
      // Backend answers 204 with no body — no workspace id is returned,
      // so the safest supported destination is the workspaces list.
      setState('success')
      setTimeout(() => navigate('/workspaces'), 1500)
    } catch (err) {
      // 401 keeps the user logged out and is handled by the API client
      if (err.status === 401) return
      setState('idle')
      setError(err.message || 'Could not accept the invitation.')
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Workspace invitation</h1>
        {state === 'success' ? (
          <>
            <p className="invite-success-line">You joined the workspace.</p>
            <p className="muted">Opening your workspaces…</p>
          </>
        ) : (
          <>
            {error && <p className="form-error">{error}</p>}
            {state === 'idle' && (
              <p className="muted">
                Accept this invitation to join the workspace as your account
                {"'"}s email address.
              </p>
            )}
            <button
              type="button"
              className="btn-block"
              onClick={handleAccept}
              disabled={state === 'submitting'}
            >
              {state === 'submitting' ? 'Joining…' : 'Accept invitation'}
            </button>
          </>
        )}
        <p className="auth-switch">
          <Link to="/workspaces">Cancel</Link>
        </p>
      </div>
    </main>
  )
}
