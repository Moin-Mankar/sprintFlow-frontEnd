import { useEffect, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { formatDay, statusClass } from '../utils/format.js'
import ProjectMembersPanel from '../components/ProjectMembersPanel.jsx'

// UpdateProjectRequest: { name @NotBlank ≤100, description ≤500, status?: ProjectStatus }
const STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED']

const TABS = [
  { label: 'Overview', end: true },
  { label: 'Dashboard', path: 'dashboard' },
  { label: 'Board', path: 'board' },
]

export default function ProjectDetail() {
  const { projectId } = useParams()
  const [result, setResult] = useState({ id: null, data: null, error: '' })
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', status: 'ACTIVE' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    let active = true
    apiFetch(`/api/projects/${projectId}`)
      .then((data) => {
        if (active) setResult({ id: projectId, data, error: '' })
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setResult({ id: projectId, data: null, error: err.message || 'Failed to load project.' })
        }
      })
    return () => {
      active = false
    }
  }, [projectId])

  const loading = result.id !== projectId
  const project = result.data
  const error = result.error

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function startEdit() {
    setForm({
      name: project.name,
      description: project.description || '',
      status: project.status,
    })
    setFieldErrors({})
    setActionError('')
    setEditing(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setActionError('')
    setFieldErrors({})
    if (!form.name.trim()) {
      setFieldErrors({ name: ['Project name is required'] })
      return
    }
    setBusy(true)
    try {
      const updated = await apiFetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        body: {
          name: form.name,
          description: form.description || null,
          status: form.status,
        },
      })
      setResult({ id: projectId, data: updated, error: '' })
      setEditing(false)
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors)
      } else {
        setActionError(err.message || 'Failed to update project.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setActionError('')
    setConfirmDelete(false)
    try {
      await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      window.location.assign('/workspaces') // project no longer exists; leave this page
    } catch (err) {
      setActionError(err.message || 'Failed to delete project.')
    }
  }

  return (
    <section>
      <p className="breadcrumb">
        <Link to="/workspaces">Workspaces</Link>
        {project && (
          <>
            {' / '}
            <Link to={`/workspaces/${project.workspaceId}`}>Workspace</Link>
          </>
        )}
      </p>
      {loading && <p className="loading">Loading project…</p>}
      {!loading && error && (
        <div className="form-error">
          <p>{error}</p>
          <p>
            <Link to="/workspaces">Back to workspaces</Link>
          </p>
        </div>
      )}
      {!loading && !error && project && (
        <>
          <div className="page-hero">
            <div className="page-hero-main">
              <p className="page-hero-eyebrow">Project</p>
              <h1>{project.name}</h1>
              <p className="page-hero-desc">
                {project.description || 'No description yet.'}
              </p>
            </div>
            <div className="page-hero-actions">
              <span className={`badge ${statusClass(project.status)}`}>{project.status}</span>
            </div>
          </div>

          <nav className="tabs" aria-label="Project">
            {TABS.map((t) => (
              <NavLink
                key={t.label}
                className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
                to={`/projects/${projectId}${t.path ? `/${t.path}` : ''}`}
                end={t.end}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>

          {actionError && <p className="form-error">{actionError}</p>}

          {editing ? (
            <form
              className="workspace-form workspace-form-flush"
              onSubmit={handleSave}
              noValidate
            >
              <h2>Edit project</h2>
              <label className="field">
                <span>Name</span>
                <input value={form.name} onChange={update('name')} maxLength={100} />
                {fieldErrors.name && (
                  <span className="field-error">{fieldErrors.name.join('; ')}</span>
                )}
              </label>
              <label className="field">
                <span>Description</span>
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
              <label className="field">
                <span>Status</span>
                <select value={form.status} onChange={update('status')}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {fieldErrors.status && (
                  <span className="field-error">{fieldErrors.status.join('; ')}</span>
                )}
              </label>
              <div className="task-card-actions">
                <button type="submit" disabled={busy}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="split">
              <div className="stack">
                <ProjectMembersPanel projectId={projectId} />
              </div>

              <aside className="stack">
                <div className="panel panel-flat">
                  <div className="panel-pad">
                    <div className="section-head">
                      <h2>Details</h2>
                    </div>
                    <dl className="kv">
                      <dt>Created</dt>
                      <dd>{formatDay(project.createdAt)}</dd>
                      <dt>Updated</dt>
                      <dd>{formatDay(project.updatedAt)}</dd>
                      <dt>Workspace</dt>
                      <dd>
                        <Link to={`/workspaces/${project.workspaceId}`}>Open workspace</Link>
                      </dd>
                    </dl>
                  </div>
                  <div className="card-actions">
                    <button type="button" className="btn-ghost" onClick={startEdit}>
                      Edit project
                    </button>
                    {confirmDelete ? (
                      <>
                        <button
                          type="button"
                          className="btn-secondary btn-danger"
                          onClick={handleDelete}
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost btn-danger"
                        onClick={() => setConfirmDelete(true)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          )}
        </>
      )}
    </section>
  )
}
