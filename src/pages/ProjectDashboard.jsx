import { useEffect, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { initials } from '../utils/format.js'

// GET /api/projects/{projectId}/dashboard → ProjectDashboardResponse:
// { projectId, projectName, totalTasks, todoTasks, inProgressTasks, inReviewTasks,
//   completedTasks, overdueTasks, blockedTasks, priorityDistribution: {HIGH, MEDIUM,
//   LOW}, userWorkload: [{userId, userName, assignedTasks}] }.
// The backend's priorityDistribution never contains CRITICAL, and userWorkload only
// lists assignees (unassigned tasks are not counted anywhere), so both are rendered
// exactly as returned rather than reconstructed here.
const METRICS = [
  { key: 'totalTasks', label: 'Tasks' },
  { key: 'completedTasks', label: 'Completed', tone: 'stat-success' },
  { key: 'overdueTasks', label: 'Overdue', danger: true },
  { key: 'blockedTasks', label: 'Blocked' },
]

const STATUS_BARS = [
  { key: 'todoTasks', label: 'TODO', seg: 'stack-seg-todo' },
  { key: 'inProgressTasks', label: 'IN_PROGRESS', seg: 'stack-seg-in-progress' },
  { key: 'inReviewTasks', label: 'IN_REVIEW', seg: 'stack-seg-in-review' },
  { key: 'completedTasks', label: 'DONE', seg: 'stack-seg-done' },
]

const TABS = [
  { label: 'Overview', end: true },
  { label: 'Dashboard', path: 'dashboard' },
  { label: 'Board', path: 'board' },
]

export default function ProjectDashboard() {
  const { projectId } = useParams()
  const [stats, setStats] = useState({ id: null, data: null, error: '' })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    apiFetch(`/api/projects/${projectId}/dashboard`)
      .then((data) => {
        if (active) setStats({ id: projectId, data, error: '' })
      })
      .catch((err) => {
        // 401 is handled by the API client (token cleared + redirect).
        if (active && err.status !== 401) {
          setStats({ id: projectId, data: null, error: err.message || 'Failed to load dashboard.' })
        }
      })
    return () => {
      active = false
    }
  }, [projectId, reload])

  const loading = stats.id !== projectId
  const error = stats.id === projectId ? stats.error : ''
  const dash = stats.data
  const priorities = dash ? Object.entries(dash.priorityDistribution || {}) : []
  const maxPriority = priorities.reduce((max, [, n]) => Math.max(max, n), 0)
  const workload = dash?.userWorkload || []
  const maxAssigned = workload.reduce((max, w) => Math.max(max, w.assignedTasks), 0)
  const pct = (n) => (dash && dash.totalTasks ? Math.round((n / dash.totalTasks) * 100) : 0)

  return (
    <section>
      <p className="breadcrumb">
        <Link to="/workspaces">Workspaces</Link>
        {dash && (
          <>
            {' / '}
            <Link to={`/projects/${dash.projectId}`}>{dash.projectName}</Link>
          </>
        )}
      </p>

      <div className="page-hero">
        <div className="page-hero-main">
          <p className="page-hero-eyebrow">Project dashboard</p>
          <h1>{dash ? dash.projectName : 'Project'}</h1>
          <p className="page-hero-desc">
            Counts cover every board in this project and are calculated by the backend.
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

      {loading && !error && <p className="loading">Loading dashboard…</p>}
      {error && (
        <div className="form-error">
          <p>{error}</p>
          <p>
            <Link to={`/projects/${projectId}`}>Back to project</Link>
          </p>
        </div>
      )}

      {!loading && !error && dash && (
        <>
          <div className="stat-rail">
            {METRICS.map((m) => (
              <div
                key={m.key}
                className={
                  [
                    'stat',
                    m.tone,
                    m.danger && dash[m.key] > 0 ? 'stat-danger' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                }
              >
                <span className="stat-value">{dash[m.key]}</span>
                <span className="stat-label">{m.label}</span>
                {m.key === 'completedTasks' && (
                  <span className="stat-hint">{pct(dash.completedTasks)}% of all tasks</span>
                )}
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="section-head">
              <h2>Tasks by status</h2>
              <span className="section-meta">
                {dash.totalTasks} task{dash.totalTasks === 1 ? '' : 's'}
              </span>
            </div>
            {dash.totalTasks === 0 ? (
              <div className="empty-block">
                <p className="empty-block-title">No tasks yet</p>
                <p className="empty-block-desc">
                  Add tasks on the board and the status split appears here.
                </p>
                <Link className="btn-secondary" to={`/projects/${projectId}/board`}>
                  Open board
                </Link>
              </div>
            ) : (
              <>
                <div className="stack-bar" role="presentation">
                  {STATUS_BARS.map((b) => (
                    <span
                      key={b.seg}
                      className={`stack-seg ${b.seg}`}
                      style={{ width: `${pct(dash[b.key])}%` }}
                    />
                  ))}
                </div>
                <ul className="legend">
                  {STATUS_BARS.map((b) => (
                    <li key={b.key} className="legend-item">
                      <span className={`legend-swatch ${b.seg}`} aria-hidden="true" />
                      {b.label}
                      <span className="legend-value">{dash[b.key]}</span>
                    </li>
                  ))}
                </ul>
                <p className="section-note">
                  {dash.overdueTasks} past due and {dash.blockedTasks} blocked, as counted by
                  the backend.
                </p>
              </>
            )}
          </div>

          <div className="panel">
            <div className="section-head">
              <h2>Tasks by priority</h2>
              <span className="section-meta">
                {priorities.length} level{priorities.length === 1 ? '' : 's'}
              </span>
            </div>
            {priorities.length === 0 ? (
              <p className="muted">
                The backend returned no priority breakdown for this project.
              </p>
            ) : (
              <ul className="meter-list">
                {priorities.map(([name, count]) => (
                  <li key={name} className="meter-row">
                    <span className="meter-label">{name}</span>
                    <span className="meter-track">
                      <span
                        className="meter-fill meter-fill-alt"
                        style={{ width: `${maxPriority ? Math.round((count / maxPriority) * 100) : 0}%` }}
                      />
                    </span>
                    <span className="meter-value">{count}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="section-note">
              The backend reports HIGH, MEDIUM and LOW only, so CRITICAL tasks are not
              included in this breakdown.
            </p>
          </div>

          <div className="panel">
            <div className="section-head">
              <h2>Assignee workload</h2>
              <span className="section-meta">
                {workload.length} assignee{workload.length === 1 ? '' : 's'}
              </span>
            </div>
            {workload.length === 0 ? (
              <div className="empty-block">
                <p className="empty-block-title">No assigned tasks</p>
                <p className="empty-block-desc">
                  Workload appears per person once tasks on this project are assigned.
                </p>
              </div>
            ) : (
              <ul className="meter-list">
                {workload.map((w) => (
                  <li key={w.userId} className="meter-row">
                    <span className="meter-label byline">
                      <span className="avatar" aria-hidden="true">
                        {initials(w.userName)}
                      </span>
                      <span className="byline-name">{w.userName}</span>
                    </span>
                    <span className="meter-track">
                      <span
                        className="meter-fill"
                        style={{ width: `${maxAssigned ? Math.round((w.assignedTasks / maxAssigned) * 100) : 0}%` }}
                      />
                    </span>
                    <span className="meter-value">{w.assignedTasks}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="section-note">
              Assigned tasks per person, as returned by the backend. Unassigned tasks are
              not listed.
            </p>
          </div>
        </>
      )}
    </section>
  )
}
