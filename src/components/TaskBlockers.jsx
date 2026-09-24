import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client.js'
import { formatDateTime } from '../utils/format.js'

// Blockers are task relationships: POST /api/task-relationships { sourceTaskId,
// targetTaskId } always stores type BLOCKS (source blocks target),
// GET /api/task-relationships/task/{taskId} returns both directions,
// DELETE /api/task-relationships/{id} removes one. There is no update or
// resolve endpoint, so nothing here pretends otherwise.
export default function TaskBlockers({ taskId, projectId, boards, canManage }) {
  const [result, setResult] = useState({ id: null, data: null, error: '' })
  const [reload, setReload] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ direction: 'blockedBy', otherTaskId: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState(null)
  const [candidates, setCandidates] = useState({ id: null, data: [], loading: false, error: '' })

  useEffect(() => {
    let active = true
    apiFetch(`/api/task-relationships/task/${taskId}`)
      .then((data) => {
        if (active) setResult({ id: taskId, data, error: '' })
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setResult({ id: taskId, data: [], error: err.message || 'Failed to load blockers.' })
        }
      })
    return () => {
      active = false
    }
  }, [taskId, reload])

  // The backend wants plain task UUIDs and both tasks must be in the same project,
  // so the choices come from that project's boards through the existing board and
  // task list endpoints. Nothing is searched or filtered.
  function loadCandidates() {
    if (candidates.id === projectId && !candidates.error) return
    setCandidates({ id: projectId, data: [], loading: true, error: '' })
    Promise.all(
      boards.map((board) =>
        apiFetch(`/api/boards/${board.id}/tasks`)
          .then((tasks) => tasks.map((t) => ({ ...t, boardName: board.name })))
          .catch(() => [])
      )
    )
      .then((groups) => {
        setCandidates({
          id: projectId,
          data: groups.flat(),
          loading: false,
          error: '',
        })
      })
      .catch((err) => {
        setCandidates({
          id: projectId,
          data: [],
          loading: false,
          error: err.message || 'Failed to load project tasks.',
        })
      })
  }

  const loading = result.id !== taskId
  const relationships = result.data || []
  const blockedBy = relationships.filter((r) => r.targetTaskId === taskId)
  const blocking = relationships.filter((r) => r.sourceTaskId === taskId && r.targetTaskId !== taskId)
  const linkedIds = new Set(relationships.flatMap((r) => [r.sourceTaskId, r.targetTaskId]))

  async function handleCreate(e) {
    e.preventDefault()
    setActionError('')
    setFieldErrors({})
    if (!form.otherTaskId) {
      setFieldErrors({ otherTaskId: ['Select the other task'] })
      return
    }
    const body =
      form.direction === 'blockedBy'
        ? { sourceTaskId: form.otherTaskId, targetTaskId: taskId }
        : { sourceTaskId: taskId, targetTaskId: form.otherTaskId }
    setBusy(true)
    try {
      await apiFetch('/api/task-relationships', { method: 'POST', body })
      setForm({ direction: 'blockedBy', otherTaskId: '' })
      setShowForm(false)
      setReload((n) => n + 1)
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors)
      } else {
        setActionError(err.message || 'Failed to add blocker.')
      }
      setReload((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(relationshipId) {
    setConfirmId(null)
    setActionError('')
    try {
      await apiFetch(`/api/task-relationships/${relationshipId}`, { method: 'DELETE' })
    } catch (err) {
      setActionError(err.message || 'Failed to remove blocker.')
    } finally {
      setReload((n) => n + 1)
    }
  }

  function renderRow(rel, label, otherTitle) {
    return (
      <li key={rel.id}>
        <div className="row">
          <div className="row-main">
            <p className="row-title">{otherTitle}</p>
            <p className="row-meta">
              <span className="badge badge-small">{label}</span>
              <span>{rel.type}</span>
              <span>{formatDateTime(rel.createdAt)}</span>
            </p>
          </div>
          {canManage && (
            <div className="row-side">
              {confirmId === rel.id ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary btn-danger btn-small"
                    onClick={() => handleDelete(rel.id)}
                  >
                    Confirm remove
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setConfirmId(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-ghost btn-danger"
                  onClick={() => setConfirmId(rel.id)}
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="panel panel-flat">
      <div className="panel-pad">
        <div className="section-head">
          <h2>Blockers</h2>
          {!loading && !result.error && (
            <span className="section-meta">
              Blocked by {blockedBy.length} · Blocks {blocking.length}
            </span>
          )}
          {canManage && !showForm && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setShowForm(true)
                setActionError('')
                setFieldErrors({})
                loadCandidates()
              }}
            >
              Add blocker
            </button>
          )}
        </div>

        <p className="muted">
          The backend blocks moving a task out of TODO while a task that blocks it is still open.
          Only project owners and managers can add or remove blockers.
        </p>

        {loading && <p className="loading">Loading blockers…</p>}
        {!loading && result.error && <p className="form-error">{result.error}</p>}
        {actionError && <p className="form-error">{actionError}</p>}
        {!loading && !result.error && relationships.length === 0 && (
          <p className="muted">No blockers on this task.</p>
        )}
      </div>

      {!loading && relationships.length > 0 && (
        <ul className="row-list">
          {blockedBy.map((r) => renderRow(r, 'Blocked by', r.sourceTaskTitle))}
          {blocking.map((r) => renderRow(r, 'Blocks', r.targetTaskTitle))}
        </ul>
      )}

      {showForm && canManage && (
        <form className="comment-form panel-pad" onSubmit={handleCreate} noValidate>
          <label className="field field-narrow">
            <span>Relationship</span>
            <select
              value={form.direction}
              onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
            >
              <option value="blockedBy">This task is blocked by…</option>
              <option value="blocks">This task blocks…</option>
            </select>
          </label>
          <label className="field">
            <span>Other task (same project)</span>
            <select
              value={form.otherTaskId}
              onChange={(e) => setForm((f) => ({ ...f, otherTaskId: e.target.value }))}
            >
              <option value="">
                {candidates.loading ? 'Loading tasks…' : 'Select task…'}
              </option>
              {candidates.data
                .filter((t) => t.id !== taskId && !linkedIds.has(t.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.boardName} — {t.title}
                  </option>
                ))}
            </select>
            {fieldErrors.otherTaskId && (
              <span className="field-error">{fieldErrors.otherTaskId.join('; ')}</span>
            )}
            {fieldErrors.targetTaskId && (
              <span className="field-error">{fieldErrors.targetTaskId.join('; ')}</span>
            )}
            {fieldErrors.sourceTaskId && (
              <span className="field-error">{fieldErrors.sourceTaskId.join('; ')}</span>
            )}
          </label>
          {candidates.error && <p className="form-error">{candidates.error}</p>}
          <p className="muted">
            Tasks are read from this project&apos;s boards. The backend stores both ids as a
            BLOCKS relationship and rejects duplicates, self-links and cross-project pairs with a
            generic server error.
          </p>
          <div className="page-header page-header-tight">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save blocker'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
