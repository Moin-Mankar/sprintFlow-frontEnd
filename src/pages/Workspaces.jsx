import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { formatDay, initials } from '../utils/format.js'

// Mirrors CreateWorkspaceRequest: name (required, ≤100),
// description (optional, ≤500), workspaceType (required PERSONAL|ORGANIZATION).
const WORKSPACE_TYPES = ['PERSONAL', 'ORGANIZATION']

const EMPTY_FORM = { name: '', description: '', workspaceType: 'PERSONAL' }

export default function Workspaces() {
  const navigate = useNavigate()
  const [result, setResult] = useState(null)
  const [reloadId, setReloadId] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    apiFetch('/api/workspaces')
      .then((data) => {
        if (active) setResult({ data, error: '' })
      })
      .catch((err) => {
        // 401 is handled by the API client (token cleared + redirect to /login)
        if (active && err.status !== 401) {
          setResult({ data: null, error: err.message || 'Failed to load workspaces.' })
        }
      })
    return () => {
      active = false
    }
  }, [reloadId])

  const workspaces = result ? result.data : null
  const loadError = result ? result.error : ''
  const refreshList = () => setReloadId((n) => n + 1)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function validate() {
    const errors = {}
    if (!form.name.trim()) errors.name = ['Workspace name is required']
    else if (form.name.length > 100) errors.name = ['Name must be 100 characters or fewer']
    if (form.description.length > 500)
      errors.description = ['Description must be 500 characters or fewer']
    if (!WORKSPACE_TYPES.includes(form.workspaceType))
      errors.workspaceType = ['Workspace type is required']
    return errors
  }

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setSaving(true)
    try {
      await apiFetch('/api/workspaces', {
        method: 'POST',
        body: {
          name: form.name,
          description: form.description || null,
          workspaceType: form.workspaceType,
        },
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
      refreshList()
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors)
      } else {
        setFormError(err.message || 'Failed to create workspace.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="page-hero">
        <div className="page-hero-main">
          <p className="page-hero-eyebrow">SprintFlow</p>
          <h1>Workspaces</h1>
          <p className="page-hero-desc">
            {workspaces === null
              ? 'Loading your workspaces…'
              : `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} you can plan and track work in.`}
          </p>
        </div>
        <div className="page-hero-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowForm((v) => !v)
              setFormError('')
              setFieldErrors({})
            }}
          >
            {showForm ? 'Cancel' : 'Create Workspace'}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="workspace-form" onSubmit={handleCreate} noValidate>
          <h2>Create Workspace</h2>
          {formError && <p className="form-error">{formError}</p>}
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={update('name')} maxLength={100} />
            {fieldErrors.name && (
              <span className="field-error">{fieldErrors.name.join('; ')}</span>
            )}
          </label>
          <label className="field">
            <span>Description (optional)</span>
            <textarea
              value={form.description}
              onChange={update('description')}
              rows={3}
              maxLength={500}
            />
            {fieldErrors.description && (
              <span className="field-error">{fieldErrors.description.join('; ')}</span>
            )}
          </label>
          <label className="field">
            <span>Type</span>
            <select value={form.workspaceType} onChange={update('workspaceType')}>
              {WORKSPACE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {fieldErrors.workspaceType && (
              <span className="field-error">{fieldErrors.workspaceType.join('; ')}</span>
            )}
          </label>
          <div className="task-card-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {loadError && (
        <p className="form-error">
          {loadError}{' '}
          <button type="button" className="link-button" onClick={refreshList}>
            Retry
          </button>
        </p>
      )}

      {workspaces === null ? (
        !loadError && <p className="loading">Loading workspaces…</p>
      ) : workspaces.length === 0 ? (
        !loadError && (
          <div className="empty-block">
            <p className="empty-block-title">No workspaces yet</p>
            <p className="empty-block-desc">
              Create your first workspace to start organising projects and tasks.
            </p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowForm(true)
                setFormError('')
                setFieldErrors({})
              }}
            >
              Create Workspace
            </button>
          </div>
        )
      ) : (
        <ul className="card-grid">
          {workspaces.map((ws) => (
            <li key={ws.id}>
              <button
                type="button"
                className="item-card"
                onClick={() => navigate(`/workspaces/${ws.id}`)}
              >
                <span className="item-card-head">
                  <span className="tile" aria-hidden="true">
                    {initials(ws.name)}
                  </span>
                  <span className="item-card-title">{ws.name}</span>
                </span>
                {ws.description && (
                  <span className="workspace-card-desc">{ws.description}</span>
                )}
                <span className="item-card-foot">
                  <span>{formatDay(ws.updatedAt)}</span>
                  <span className="badge">{ws.workspaceType}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
