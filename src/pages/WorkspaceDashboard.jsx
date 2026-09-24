import { useEffect, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'

// GET /api/workspaces/{workspaceId}/dashboard → DashboardResponse:
// { totalProjects, totalTasks, todoTasks, inProgressTasks, inReviewTasks,
//   completedTasks, overdueTasks } — all counts computed by the backend for the
// whole workspace. "completed" is TaskStatus.DONE; "overdue" is a due date before
// now on any task that is not DONE. There is no member count in this response.
const STATUS_BARS = [
  { key: 'todoTasks', label: 'TODO', seg: 'stack-seg-todo' },
  { key: 'inProgressTasks', label: 'IN_PROGRESS', seg: 'stack-seg-in-progress' },
  { key: 'inReviewTasks', label: 'IN_REVIEW', seg: 'stack-seg-in-review' },
  { key: 'completedTasks', label: 'DONE', seg: 'stack-seg-done' },
]

export default function WorkspaceDashboard() {
  const { workspaceId } = useParams()
  const [stats, setStats] = useState({ id: null, data: null, error: '' })
  const [reload, setReload] = useState(0)
  // Only used for the page title; a failure here must not hide the dashboard.
  const [workspaceName, setWorkspaceName] = useState('')

  useEffect(() => {
    let active = true
    apiFetch(`/api/workspaces/${workspaceId}/dashboard`)
      .then((data) => {
        if (active) setStats({ id: workspaceId, data, error: '' })
      })
      .catch((err) => {
        // 401 is handled by the API client (token cleared + redirect).
        if (active && err.status !== 401) {
          setStats({ id: workspaceId, data: null, error: err.message || 'Failed to load dashboard.' })
        }
      })
    return () => {
      active = false
    }
  }, [workspaceId, reload])

  useEffect(() => {
    let active = true
    apiFetch(`/api/workspaces/${workspaceId}`)
      .then((data) => {
        if (active) setWorkspaceName(data.name || '')
      })
      .catch(() => {
        if (active) setWorkspaceName('')
      })
    return () => {
      active = false
    }
  }, [workspaceId])

  const loading = stats.id !== workspaceId
  const error = stats.id === workspaceId ? stats.error : ''
  const counts = stats.data
  const pct = (n) =>
    counts && counts.totalTasks ? Math.round((n / counts.totalTasks) * 100) : 0

  return (
    <section>
      <p className="breadcrumb">
        <Link to="/workspaces">Workspaces</Link>
        {' / '}
        <Link to={`/workspaces/${workspaceId}`}>
          {workspaceName || 'Workspace'}
        </Link>
      </p>

      <div className="page-hero">
        <div className="page-hero-main">
          <p className="page-hero-eyebrow">Workspace dashboard</p>
          <h1>{workspaceName || 'Workspace'}</h1>
          <p className="page-hero-desc">
            Every count below covers all projects and boards in this workspace and is
            calculated by the backend.
          </p>
        </div>
        <div className="page-hero-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setReload((n) => n + 1)}
          >
            Refresh
          </button>
        </div>
      </div>

      <nav className="tabs" aria-label="Workspace">
        <NavLink
          className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          to={`/workspaces/${workspaceId}`}
          end
        >
          Projects
        </NavLink>
        <NavLink
          className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          to={`/workspaces/${workspaceId}/dashboard`}
        >
          Dashboard
        </NavLink>
      </nav>

      {loading && !error && <p className="loading">Loading dashboard…</p>}
      {error && (
        <div className="form-error">
          <p>{error}</p>
          <p>
            <Link to={`/workspaces/${workspaceId}`}>Back to workspace</Link>
          </p>
        </div>
      )}

      {!loading && !error && counts && (
        <>
          <div className="stat-rail">
            <div className="stat">
              <span className="stat-value">{counts.totalProjects}</span>
              <span className="stat-label">Projects</span>
            </div>
            <div className="stat">
              <span className="stat-value">{counts.totalTasks}</span>
              <span className="stat-label">Tasks</span>
            </div>
            <div className="stat stat-success">
              <span className="stat-value">{counts.completedTasks}</span>
              <span className="stat-label">Completed</span>
              <span className="stat-hint">{pct(counts.completedTasks)}% of all tasks</span>
            </div>
            <div className={counts.overdueTasks > 0 ? 'stat stat-danger' : 'stat'}>
              <span className="stat-value">{counts.overdueTasks}</span>
              <span className="stat-label">Overdue</span>
            </div>
          </div>

          <div className="panel">
            <div className="section-head">
              <h2>Task status</h2>
              <span className="section-meta">
                {counts.totalTasks} task{counts.totalTasks === 1 ? '' : 's'} across{' '}
                {counts.totalProjects} project{counts.totalProjects === 1 ? '' : 's'}
              </span>
            </div>
            {counts.totalTasks === 0 ? (
              <div className="empty-block">
                <p className="empty-block-title">No tasks yet</p>
                <p className="empty-block-desc">
                  Status appears here as soon as projects in this workspace have work on
                  their boards.
                </p>
                <Link className="btn-secondary" to={`/workspaces/${workspaceId}`}>
                  Go to projects
                </Link>
              </div>
            ) : (
              <>
                <div className="stack-bar" role="presentation">
                  {STATUS_BARS.map((b) => (
                    <span
                      key={b.seg}
                      className={`stack-seg ${b.seg}`}
                      style={{ width: `${pct(counts[b.key])}%` }}
                    />
                  ))}
                </div>
                <ul className="legend">
                  {STATUS_BARS.map((b) => (
                    <li key={b.key} className="legend-item">
                      <span className={`legend-swatch ${b.seg}`} aria-hidden="true" />
                      {b.label}
                      <span className="legend-value">{counts[b.key]}</span>
                    </li>
                  ))}
                </ul>
                <p className="section-note">
                  {counts.overdueTasks} task{counts.overdueTasks === 1 ? '' : 's'} past due
                  and not done, as counted by the backend.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
