import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client.js'
import { initials } from '../utils/format.js'

// AddProjectMemberRequest: { email (@NotBlank @Email), projectRole (@NotNull) }
// ProjectRole enum from the backend:
const PROJECT_ROLES = ['OWNER', 'MANAGER', 'DEVELOPER', 'TESTER', 'VIEWER']

export default function ProjectMembersPanel({ projectId }) {
  const [result, setResult] = useState(null) // { id, data, error }
  const [reloadId, setReloadId] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('DEVELOPER')
  const [fieldErrors, setFieldErrors] = useState({})
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    apiFetch(`/api/projects/${projectId}/members`)
      .then((data) => {
        if (active) setResult({ id: projectId, data, error: '' })
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setResult({ id: projectId, data: null, error: err.message || 'Failed to load members.' })
        }
      })
    return () => {
      active = false
    }
  }, [projectId, reloadId])

  const loading = !result || result.id !== projectId
  const members = result && result.id === projectId ? result.data : null
  const listError = result && result.id === projectId ? result.error : ''
  const refresh = () => setReloadId((n) => n + 1)

  function reportError(err) {
    if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
      setFieldErrors(err.fieldErrors)
    } else {
      setActionError(err.message || 'Action failed.')
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    setActionError('')
    setFieldErrors({})
    if (!email.trim()) {
      setFieldErrors({ email: ['Email is required'] })
      return
    }
    setBusy(true)
    try {
      await apiFetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        body: { email, projectRole: role },
      })
      setEmail('')
      setShowForm(false)
      refresh()
    } catch (err) {
      reportError(err)
    } finally {
      setBusy(false)
    }
  }

  async function handleRoleChange(memberUserId, nextRole) {
    setActionError('')
    try {
      await apiFetch(`/api/projects/${projectId}/members/${memberUserId}`, {
        method: 'PUT',
        body: { projectRole: nextRole },
      })
      refresh()
    } catch (err) {
      reportError(err)
      refresh() // backend may have changed state anyway; resync
    }
  }

  async function handleRemove(memberUserId) {
    setActionError('')
    try {
      await apiFetch(`/api/projects/${projectId}/members/${memberUserId}`, {
        method: 'DELETE',
      })
      refresh()
    } catch (err) {
      reportError(err)
      refresh()
    }
  }

  return (
    <div className="panel">
      <div className="section-head">
        <h2>Members</h2>
        {!listError && !loading && members !== null && (
          <span className="section-meta">
            {members.length} member{members.length === 1 ? '' : 's'}
          </span>
        )}
        {!listError && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setShowForm((v) => !v)
              setActionError('')
              setFieldErrors({})
            }}
          >
            {showForm ? 'Cancel' : 'Add member'}
          </button>
        )}
      </div>

      {actionError && <p className="form-error">{actionError}</p>}

      {showForm && (
        <form className="invite-form" onSubmit={handleAdd} noValidate>
          <label className="field">
            <span>Email (must be a workspace member)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
            {fieldErrors.email && (
              <span className="field-error">{fieldErrors.email.join('; ')}</span>
            )}
          </label>
          <label className="field field-narrow">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {PROJECT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {fieldErrors.projectRole && (
              <span className="field-error">{fieldErrors.projectRole.join('; ')}</span>
            )}
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}

      {listError && <p className="form-error">{listError}</p>}
      {!listError && loading && <p className="loading">Loading members…</p>}
      {!listError && !loading && members !== null && members.length === 0 && (
        <div className="empty-block">
          <p className="empty-block-title">No members yet</p>
          <p className="empty-block-desc">
            Add workspace members to this project so they can be assigned tasks.
          </p>
        </div>
      )}
      {!listError && !loading && members !== null && members.length > 0 && (
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.userId} className="member-row">
              <span className="avatar" aria-hidden="true">
                {initials(m.name || m.email)}
              </span>
              <span className="member-name">{m.name}</span>
              <span className="member-email">{m.email}</span>
              <select
                aria-label={`Role for ${m.email}`}
                value={m.projectRole}
                onChange={(e) => handleRoleChange(m.userId, e.target.value)}
              >
                {PROJECT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="link-button"
                onClick={() => handleRemove(m.userId)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
