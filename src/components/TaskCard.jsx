import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import {
  dueClass,
  formatDay,
  fromDateTimeLocal,
  initials,
  prioClass,
  priorityClass,
  statusClass,
  toDateTimeLocal,
} from '../utils/format.js'

// Enums copied from the backend: TaskStatus / TaskPriority.
const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

// UpdateTaskRequest always carries title/description/priority/status; the backend
// writes every field it receives, so anything left out would be nulled server-side.
export default function TaskCard({ task, boards, members, projectId, onTasksChanged, onMove, onAssign }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    taskPriority: 'MEDIUM',
    taskStatus: 'TODO',
    dueDate: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const otherBoards = boards.filter((b) => b.id !== task.boardId)
  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function startEdit() {
    setForm({
      title: task.title,
      description: task.description || '',
      taskPriority: task.taskPriority,
      taskStatus: task.taskStatus,
      dueDate: toDateTimeLocal(task.dueDate),
    })
    setError('')
    setEditing(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are both required.')
      return
    }
    setBusy(true)
    try {
      await apiFetch(`/api/boards/${task.boardId}/tasks/${task.id}`, {
        method: 'PUT',
        body: {
          title: form.title,
          description: form.description,
          taskPriority: form.taskPriority,
          taskStatus: form.taskStatus,
          dueDate: fromDateTimeLocal(form.dueDate),
          assigneeId: task.assigneeId,
        },
      })
      setEditing(false)
      onTasksChanged()
    } catch (err) {
      setError(err.message || 'Failed to update task.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnassign() {
    setError('')
    try {
      await apiFetch(`/api/boards/${task.boardId}/tasks/${task.id}`, {
        method: 'PUT',
        body: {
          title: task.title,
          description: task.description,
          taskPriority: task.taskPriority,
          taskStatus: task.taskStatus,
          dueDate: task.dueDate,
          assigneeId: null,
        },
      })
      onTasksChanged()
    } catch (err) {
      setError(err.message || 'Failed to unassign task.')
    }
  }

  return (
    <li className={`task-card ${prioClass(task.taskPriority)}`}>
      <div className="task-card-inner">
        <div className="task-card-head">
          <Link
            className="task-card-title task-card-link"
            to={`/tasks/${task.id}`}
            state={{ boardId: task.boardId, projectId }}
          >
            {task.title}
          </Link>
          <span className={`badge badge-small ${statusClass(task.taskStatus)}`}>
            {task.taskStatus}
          </span>
          <span className={`badge badge-small ${priorityClass(task.taskPriority)}`}>
            {task.taskPriority}
          </span>
        </div>
        {task.description && <p className="task-card-desc">{task.description}</p>}
        <p className="task-card-meta">
          <span className="byline">
            <span className="avatar" aria-hidden="true">
              {initials(task.assigneeName)}
            </span>
            {task.assigneeName || 'Unassigned'}
          </span>
          {task.dueDate && (
            <span className={dueClass(task.dueDate, task.taskStatus)}>
              Due {formatDay(task.dueDate)}
            </span>
          )}
          <span>by {task.createdByName}</span>
        </p>

        {error && <p className="form-error">{error}</p>}
      </div>

      {!editing && (
        <div className="card-actions">
          <button type="button" className="btn-ghost" onClick={startEdit}>
            Edit
          </button>
          {otherBoards.length > 0 && (
            <label className="field field-narrow">
              <span>Move to</span>
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return
                  onMove(task, e.target.value)
                }}
              >
                <option value="">Select board…</option>
                {otherBoards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field field-narrow">
            <span>Assign to</span>
            <select
              value={task.assigneeId || ''}
              onChange={(e) => {
                if (!e.target.value) return
                onAssign(task, e.target.value)
              }}
            >
              <option value="">{members.length ? 'Select member…' : 'No project members'}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} ({m.projectRole})
                </option>
              ))}
            </select>
          </label>
          {task.assigneeId && (
            <button type="button" className="link-button" onClick={handleUnassign}>
              Unassign
            </button>
          )}
        </div>
      )}

      {editing && (
        <form className="task-form" onSubmit={handleSave} noValidate>
          <label className="field">
            <span>Title</span>
            <input value={form.title} onChange={update('title')} maxLength={150} />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={update('description')}
              rows={3}
              maxLength={2000}
            />
          </label>
          <label className="field field-narrow">
            <span>Priority</span>
            <select value={form.taskPriority} onChange={update('taskPriority')}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="field field-narrow">
            <span>Status</span>
            <select value={form.taskStatus} onChange={update('taskStatus')}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field field-narrow">
            <span>Due date</span>
            <input
              type="datetime-local"
              value={form.dueDate}
              onChange={update('dueDate')}
            />
          </label>
          <div className="task-card-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEditing(false)
                setError('')
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  )
}
