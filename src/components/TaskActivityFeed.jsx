import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client.js'
import { formatDateTime, initials } from '../utils/format.js'

// GET /api/tasks/{taskId}/activities -> List<TaskActivityResponse>
// { id, taskActivityType, description, createdAt, user_id, userName }
// Ordered createdAt ASC by the backend and recorded automatically by TaskService and
// CommentService, so this section is display-only: there is no activity write endpoint.
export default function TaskActivityFeed({ taskId }) {
  const [result, setResult] = useState({ id: null, data: null, error: '' })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    apiFetch(`/api/tasks/${taskId}/activities`)
      .then((data) => {
        if (active) setResult({ id: taskId, data, error: '' })
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setResult({
            id: taskId,
            data: [],
            error: err.message || 'Failed to load activity.',
          })
        }
      })
    return () => {
      active = false
    }
  }, [taskId, reload])

  const loading = result.id !== taskId
  const activities = result.data || []

  return (
    <div className="panel panel-flat">
      <div className="panel-pad">
        <div className="section-head">
          <h2>Activity</h2>
          <span className="section-meta">Recorded by the backend</span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setReload((n) => n + 1)}
          >
            Refresh
          </button>
        </div>

        {loading && <p className="loading">Loading activity…</p>}
        {!loading && result.error && <p className="form-error">{result.error}</p>}
        {!loading && !result.error && activities.length === 0 && (
          <p className="muted">No activity recorded yet.</p>
        )}
      </div>

      {!loading && activities.length > 0 && (
        <ul className="activity-list">
          {activities.map((a) => (
            <li key={a.id} className="activity">
              <p className="comment-head">
                <span className="byline">
                  <span className="avatar" aria-hidden="true">
                    {initials(a.userName)}
                  </span>
                  <strong>{a.userName}</strong>{' '}
                  <span className="badge badge-small">{a.taskActivityType}</span>
                </span>
                <span className="muted">{formatDateTime(a.createdAt)}</span>
              </p>
              <p className="activity-desc">{a.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
