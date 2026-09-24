import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { initials } from '../utils/format.js'

// CreateProjectRequest: { name required ≤100, description optional ≤500 }
// status is set by the backend (ACTIVE on create), not by this form.
const EMPTY_FORM = { name: '', description: '' }

export default function WorkspaceProjects({ workspaceId }) {
  const [result, setResult] = useState(null) // { id, data, error }
  const [reloadId, setReloadId] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    apiFetch(`/api/workspaces/${workspaceId}/projects`)
      .then((data) => {
        if (active) setResult({ id: workspaceId, data, error: '' })
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setResult({ id: workspaceId, data: null, error: err.message || 'Failed to load projects.' })
        }
      })
    return () => {
      active = false
    }
  }, [workspaceId, reloadId])

  const loading = !result || result.id !== workspaceId
  const projects = result && result.id === workspaceId ? result.data : null
  const listError = result && result.id === workspaceId ? result.error : ''

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function validate() {
    const errors = {}
    if (!form.name.trim()) errors.name = ['Project name is required']
    else if (form.name.length > 100) errors.name = ['Name must be 100 characters or fewer']
    if (form.description.length > 500)
      errors.description = ['Description must be 500 characters or fewer']
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
      await apiFetch(`/api/workspaces/${workspaceId}/projects`, {
        method: 'POST',
        body: {
          name: form.name,
          description: form.description || null,
        },
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
      setReloadId((n) => n + 1)
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors)
      } else {
        setFormError(err.message || 'Failed to create project.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>Projects</h2>
        {!loading && projects !== null && projects.length > 0 && (
          <span className="section-meta">
            {projects.length} project{projects.length === 1 ? '' : 's'}
          </span>
        )}
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setShowForm((v) => !v)
            setFormError('')
            setFieldErrors({})
          }}
        >
          {showForm ? 'Cancel' : 'Create Project'}
        </button>
      </div>

      {showForm && (
        <form className="workspace-form workspace-form-flush" onSubmit={handleCreate} noValidate>
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
              rows={2}
              maxLength={500}
            />
            {fieldErrors.description && (
              <span className="field-error">{fieldErrors.description.join('; ')}</span>
            )}
          </label>
          <div className="task-card-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {listError && <p className="form-error">{listError}</p>}

      {loading && !listError && <p className="loading">Loading projects…</p>}
      {!loading && projects !== null && projects.length === 0 && !listError && (
        <div className="empty-block">
          <p className="empty-block-title">No projects yet</p>
          <p className="empty-block-desc">
            Create your first project to start organising boards and tasks.
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
            Create Project
          </button>
        </div>
      )}
      {!loading && projects !== null && projects.length > 0 && (
        <ul className="card-grid">
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="item-card">
                <span className="item-card-head">
                  <span className="tile" aria-hidden="true">
                    {initials(p.name)}
                  </span>
                  <span className="item-card-title">{p.name}</span>
                </span>
                {p.description && <p className="item-card-desc">{p.description}</p>}
                <span className="item-card-foot">
                  <span className="badge">{p.status}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
