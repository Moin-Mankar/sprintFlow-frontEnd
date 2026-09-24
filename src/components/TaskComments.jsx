import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client.js'
import { useProjectEvents } from '../realtime/useProjectEvents.js'
import { formatDateTime, initials } from '../utils/format.js'

// CommentResponse: { id, content, createdAt, taskId, userId, userName }.
// The backend has no updatedAt field and no comment update endpoint, so comments
// cannot be edited here. Deletion is author-only server-side, and the backend
// answers a non-author with a generic 500, so the control is shown only on the
// caller's own comments.
export default function TaskComments({ taskId, currentUserId, projectId }) {
  const [result, setResult] = useState({ id: null, data: null, error: '' })
  const [reload, setReload] = useState(0)
  const [draft, setDraft] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState(null)

  // COMMENT_ADDED carries only { type, projectId, taskId, message }, so the list is
  // re-read from the backend rather than patched with fields the event never sends.
  const liveTimer = useRef(null)
  useEffect(
    () => () => {
      if (liveTimer.current) clearTimeout(liveTimer.current)
    },
    [],
  )

  useProjectEvents(projectId, (event) => {
    if (event.type !== 'COMMENT_ADDED' || event.taskId !== taskId) return
    if (liveTimer.current) return
    liveTimer.current = setTimeout(() => {
      liveTimer.current = null
      setReload((n) => n + 1)
    }, 400)
  })

  useEffect(() => {
    let active = true
    apiFetch(`/api/tasks/${taskId}/comments`)
      .then((data) => {
        if (active) setResult({ id: taskId, data, error: '' })
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setResult({
            id: taskId,
            data: [],
            error: err.message || 'Failed to load comments.',
          })
        }
      })
    return () => {
      active = false
    }
  }, [taskId, reload])

  const loading = result.id !== taskId
  const comments = result.data || []

  async function handleAdd(e) {
    e.preventDefault()
    setActionError('')
    setFieldErrors({})
    if (!draft.trim()) {
      setFieldErrors({ content: ['Comment is required'] })
      return
    }
    if (draft.length > 1000) {
      setFieldErrors({ content: ['Comment must be 1000 characters or fewer'] })
      return
    }
    setBusy(true)
    try {
      await apiFetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        body: { content: draft },
      })
      setDraft('')
      setReload((n) => n + 1)
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors)
      } else {
        setActionError(err.message || 'Failed to add comment.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(commentId) {
    setConfirmId(null)
    setActionError('')
    try {
      await apiFetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' })
      setReload((n) => n + 1)
    } catch (err) {
      setActionError(err.message || 'Failed to delete comment.')
    }
  }

  return (
    <div className="panel">
      <div className="section-head">
        <h2>Comments</h2>
        {!loading && !result.error && (
          <span className="section-meta">
            {comments.length} comment{comments.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {loading && <p className="loading">Loading comments…</p>}
      {!loading && result.error && <p className="form-error">{result.error}</p>}
      {!loading && !result.error && comments.length === 0 && (
        <p className="muted">No comments yet.</p>
      )}
      {actionError && <p className="form-error">{actionError}</p>}

      {!loading && comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <p className="comment-head">
                <span className="byline">
                  <span className="avatar" aria-hidden="true">
                    {initials(c.userName)}
                  </span>
                  <strong>{c.userName}</strong>
                </span>
                <span className="muted">{formatDateTime(c.createdAt)}</span>
              </p>
              <p className="comment-body">{c.content}</p>
              {currentUserId && c.userId === currentUserId && (
                <p className="comment-actions">
                  {confirmId === c.id ? (
                    <>
                      <button
                        type="button"
                        className="btn-secondary btn-danger btn-small"
                        onClick={() => handleDelete(c.id)}
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setConfirmId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setConfirmId(c.id)}
                    >
                      Delete
                    </button>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="comment-form" onSubmit={handleAdd} noValidate>
        <label className="field">
          <span>Add comment</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={1000}
          />
          {fieldErrors.content && (
            <span className="field-error">{fieldErrors.content.join('; ')}</span>
          )}
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Posting…' : 'Post comment'}
        </button>
      </form>
    </div>
  )
}
