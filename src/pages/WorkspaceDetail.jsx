import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import InviteMember from '../components/InviteMember.jsx'
import WorkspaceProjects from '../components/WorkspaceProjects.jsx'
import { formatDay } from '../utils/format.js'

export default function WorkspaceDetail() {
  const { workspaceId } = useParams()
  const nav = useNavigate()
  const [result, setResult] = useState({ id: null, data: null, error: '' })
  // The confirmed target is held as the workspace id it was opened for, so a param
  // change can never leave a pending confirmation pointing at another workspace.
  const [confirmDeleteFor, setConfirmDeleteFor] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const deleteInFlight = useRef(false)
  const [deleteError, setDeleteError] = useState({ id: null, message: '' })

  useEffect(() => {
    let active = true
    apiFetch(`/api/workspaces/${workspaceId}`)
      .then((data) => {
        if (active) setResult({ id: workspaceId, data, error: '' })
      })
      .catch((err) => {
        // 401 is handled by the API client (token cleared + redirect)
        if (active && err.status !== 401) {
          setResult({ id: workspaceId, data: null, error: err.message || 'Failed to load workspace.' })
        }
      })
    return () => {
      active = false
    }
  }, [workspaceId])

  const loading = result.id !== workspaceId
  const workspace = result.data
  const error = result.error
  const confirmDelete = confirmDeleteFor === workspaceId

  // WorkspaceController answers 403 for anyone but the workspace OWNER, and no
  // endpoint exposes that role to this page, so the action is always offered and the
  // server's own error is what the user sees.
  async function handleDelete() {
    if (deleteInFlight.current) return
    const target = workspaceId
    setConfirmDeleteFor(null)
    setDeleteError({ id: null, message: '' })
    deleteInFlight.current = true
    setDeleting(true)
    try {
      await apiFetch(`/api/workspaces/${target}`, { method: 'DELETE' })
      nav('/workspaces')
    } catch (err) {
      setDeleteError({
        id: target,
        message: err.message || 'Failed to delete workspace.',
      })
      deleteInFlight.current = false
      setDeleting(false)
    }
  }

  return (
    <section>
      <p className="breadcrumb">
        <Link to="/workspaces">Workspaces</Link>
      </p>
      {loading && <p className="loading">Loading workspace…</p>}
      {!loading && error && (
        <div className="form-error">
          <p>{error}</p>
          <p>
            <Link to="/workspaces">Back to workspaces</Link>
          </p>
        </div>
      )}
      {!loading && !error && workspace && (
        <>
          <div className="page-hero">
            <div className="page-hero-main">
              <p className="page-hero-eyebrow">Workspace</p>
              <h1>{workspace.name}</h1>
              <p className="page-hero-desc">
                {workspace.description || 'No description yet.'}
              </p>
            </div>
            <div className="page-hero-actions">
              <span className="badge">{workspace.workspaceType}</span>
              <Link
                className="btn-secondary"
                to={`/workspaces/${workspaceId}/dashboard`}
              >
                Dashboard
              </Link>
            </div>
          </div>

          <nav className="tabs" aria-label="Workspace">
            <NavLink className={({ isActive }) => 'tab' + (isActive ? ' active' : '')} to={`/workspaces/${workspaceId}`} end>
              Projects
            </NavLink>
            <NavLink
              className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
              to={`/workspaces/${workspaceId}/dashboard`}
            >
              Dashboard
            </NavLink>
          </nav>

          <div className="split">
            <WorkspaceProjects workspaceId={workspaceId} />
            <aside className="stack">
              <InviteMember workspaceId={workspaceId} />
              <div className="panel">
                <p className="panel-title">Details</p>
                <dl className="kv">
                  <dt>Created</dt>
                  <dd>{formatDay(workspace.createdAt)}</dd>
                  <dt>Updated</dt>
                  <dd>{formatDay(workspace.updatedAt)}</dd>
                  <dt>Type</dt>
                  <dd>{workspace.workspaceType}</dd>
                </dl>
              </div>
              <div className="panel danger-zone">
                <p className="panel-title">Danger Zone</p>
                <p className="muted">
                  {confirmDelete
                    ? 'This will permanently delete this workspace and its associated data. This action cannot be undone.'
                    : 'Permanently delete this workspace and its associated data.'}
                </p>
                {deleteError.id === workspaceId && (
                  <p className="form-error">{deleteError.message}</p>
                )}
                <div className="task-card-actions">
                  {confirmDelete ? (
                    <>
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => setConfirmDeleteFor(null)}
                        disabled={deleting}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-danger btn-small"
                        onClick={handleDelete}
                        disabled={deleting}
                      >
                        {deleting ? 'Deleting…' : 'Delete Workspace'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary btn-danger btn-small"
                      onClick={() => setConfirmDeleteFor(workspaceId)}
                    >
                      Delete Workspace
                    </button>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  )
}
