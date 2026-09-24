import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { useAuth } from '../auth/context.js'
import { useProjectEvents } from '../realtime/useProjectEvents.js'
import {
  dueClass,
  formatDateTime,
  fromDateTimeLocal,
  initials,
  priorityClass,
  statusClass,
  toDateTimeLocal,
} from '../utils/format.js'
import TaskComments from '../components/TaskComments.jsx'
import TaskActivityFeed from '../components/TaskActivityFeed.jsx'
import TaskBlockers from '../components/TaskBlockers.jsx'

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

// TaskResponse exposes boardId but never projectId, and the task endpoints are all
// mounted under /api/boards/{boardId}/tasks/..., so this page needs the board and
// project ids that the Kanban card passes through router state.
export default function TaskDetail() {
  const { taskId } = useParams()
  const { email } = useAuth()
  const location = useLocation()
  const nav = location.state || {}

  const [ctx, setCtx] = useState({
    taskId: null,
    boardId: null,
    projectId: null,
  })
  const [result, setResult] = useState({ id: null, data: null, error: '' })
  const [project, setProject] = useState(null)
  const [boards, setBoards] = useState([])
  const [members, setMembers] = useState([])
  const [membersError, setMembersError] = useState('')
  const [reload, setReload] = useState(0)

  // Comments were the page's focus before Activity was made discoverable, so they stay
  // the default tab. Once a feed has been opened it remains mounted, which keeps the
  // comment draft alive and stops a tab switch from re-reading the same activity list.
  const [discussion, setDiscussion] = useState('comments')
  const [activitySeen, setActivitySeen] = useState(false)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [fieldErrors, setFieldErrors] = useState({})
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  const ids =
    ctx.taskId === taskId
      ? ctx
      : {
          taskId,
          boardId: nav.boardId || null,
          projectId: nav.projectId || null,
        }
  const { boardId, projectId } = ids
  const loading = result.id !== taskId
  const task = result.data
  const error = result.error
  const currentBoard = boardId ? boards.find((b) => b.id === boardId) : null
  const myMember = members.find(
    (m) => m.email && email && m.email.toLowerCase() === email.toLowerCase(),
  )
  const myUserId = myMember?.userId
  // TaskRelationshipService.verifyRelationshipPermission allows only OWNER/MANAGER to
  // create or delete relationships; any other role gets a generic 500.
  const canManageBlockers = myMember?.projectRole === 'OWNER' || myMember?.projectRole === 'MANAGER'

  function refreshTask() {
    setReload((n) => n + 1)
  }

  function openDiscussion(tab) {
    setDiscussion(tab)
    if (tab === 'activity') setActivitySeen(true)
  }

  useEffect(() => {
    if (!boardId) return undefined
    let active = true
    apiFetch(`/api/boards/${boardId}/tasks/${taskId}`)
      .then((data) => {
        if (active) setResult({ id: taskId, data, error: '' })
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setResult({
            id: taskId,
            data: null,
            error: err.message || 'Failed to load task.',
          })
        }
      })
    return () => {
      active = false
    }
  }, [taskId, boardId, reload])

  useEffect(() => {
    if (!projectId) return undefined
    let active = true
    apiFetch(`/api/projects/${projectId}/boards`)
      .then((data) => {
        if (active) setBoards(data)
      })
      .catch(() => {
        // The task request above reports the real status for an unreadable project.
      })
    return () => {
      active = false
    }
  }, [projectId, reload])

  useEffect(() => {
    if (!projectId) return undefined
    let active = true
    apiFetch(`/api/projects/${projectId}`)
      .then((data) => {
        if (active) setProject(data)
      })
      .catch(() => {
        // Breadcrumb only; the task request already reports access problems.
      })
    return () => {
      active = false
    }
  }, [projectId])

  // AssignTaskRequest wants a user UUID, and the project members list is the only
  // directory the backend exposes to this page.
  useEffect(() => {
    if (!projectId) return undefined
    let active = true
    apiFetch(`/api/projects/${projectId}/members`)
      .then((data) => {
        if (active) {
          setMembers(data)
          setMembersError('')
        }
      })
      .catch((err) => {
        if (active) {
          setMembers([])
          setMembersError(err.message || 'Failed to load project members.')
        }
      })
    return () => {
      active = false
    }
  }, [projectId])

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // Real-time: TASK_UPDATED / TASK_ASSIGNED say nothing we can apply locally, so the
  // page re-reads this task from the server. TASK_MOVED is deliberately ignored here:
  // a move changes the board the task is mounted under, and this page only ever knows
  // the board id it was opened from — the Kanban board itself handles move events.
  const liveTimer = useRef(null)
  useEffect(
    () => () => {
      if (liveTimer.current) clearTimeout(liveTimer.current)
    },
    [],
  )

  useProjectEvents(projectId, (event) => {
    if (event.type !== 'TASK_UPDATED' && event.type !== 'TASK_ASSIGNED') return
    if (event.taskId !== taskId) return
    if (liveTimer.current) return
    liveTimer.current = setTimeout(() => {
      liveTimer.current = null
      setReload((n) => n + 1)
    }, 400)
  })

  function startEdit() {
    setForm({
      title: task.title,
      description: task.description || '',
      taskPriority: task.taskPriority,
      taskStatus: task.taskStatus,
      dueDate: toDateTimeLocal(task.dueDate),
    })
    setFieldErrors({})
    setActionError('')
    setEditing(true)
  }

  // UpdateTaskRequest is a TOTAL update: every field is written, so the values that
  // are not being edited must be resent from the loaded task.
  async function handleSave(e) {
    e.preventDefault()
    setActionError('')
    setFieldErrors({})
    if (!form.title?.trim() || !form.description?.trim()) {
      setActionError('Title and description are both required.')
      return
    }
    setBusy(true)
    try {
      await apiFetch(`/api/boards/${boardId}/tasks/${taskId}`, {
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
      refreshTask()
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors)
      } else {
        setActionError(err.message || 'Failed to update task.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function sendFullUpdate(overrides, fallback) {
    setActionError('')
    try {
      await apiFetch(`/api/boards/${boardId}/tasks/${taskId}`, {
        method: 'PUT',
        body: {
          title: task.title,
          description: task.description,
          taskPriority: task.taskPriority,
          taskStatus: task.taskStatus,
          dueDate: task.dueDate,
          ...overrides,
        },
      })
      refreshTask()
    } catch (err) {
      setActionError(err.message || fallback)
      refreshTask()
    }
  }

  function handleAssign(assigneeId) {
    setActionError('')
    apiFetch(`/api/boards/${boardId}/tasks/${taskId}/assignee`, {
      method: 'PUT',
      body: { assigneeId },
    })
      .catch((err) => setActionError(err.message || 'Failed to assign task.'))
      .finally(refreshTask)
  }

  // PUT /{taskId}/move sends a boardId and the backend maps the destination board's
  // name onto taskStatus, so an unrecognised board name is rejected with 400.
  function handleMove(targetBoardId) {
    setActionError('')
    apiFetch(`/api/boards/${boardId}/tasks/${taskId}/move`, {
      method: 'PUT',
      body: { boardId: targetBoardId },
    })
      .then(() => setCtx({ taskId, boardId: targetBoardId, projectId }))
      .catch((err) => setActionError(err.message || 'Failed to move task.'))
      .finally(refreshTask)
  }

  if (!boardId || !projectId) {
    return (
      <section>
        <h1>Task</h1>
        <div className="form-error">
          <p>
            This task was opened without its board. The backend serves task data only under
            <code> /api/boards/&lt;boardId&gt;/tasks/&lt;taskId&gt;</code>, so a bare task link
            cannot be resolved.
          </p>
          <p>
            Open the task from its project board, or go to <Link to="/workspaces">Workspaces</Link>.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <p className="breadcrumb">
        <Link to="/workspaces">Workspaces</Link>
        {project && (
          <>
            {' / '}
            <Link to={`/workspaces/${project.workspaceId}`}>Workspace</Link>
            {' / '}
            <Link to={`/projects/${project.id}`}>{project.name}</Link>
          </>
        )}
        {project && (
          <>
            {' / '}
            <Link to={`/projects/${project.id}/board`}>Board</Link>
          </>
        )}
      </p>

      {loading && <p className="loading">Loading task…</p>}
      {!loading && error && (
        <div className="form-error">
          <p>{error}</p>
          <p>
            <Link to={`/projects/${projectId}/board`}>Back to board</Link>
          </p>
        </div>
      )}

      {!loading && !error && task && (
        <>
          <div className="page-hero">
            <div className="page-hero-main">
              <p className="page-hero-eyebrow">
                {project ? project.name : 'Task'}
                {currentBoard ? ` · ${currentBoard.name}` : ''}
              </p>
              <h1>{task.title}</h1>
            </div>
            <div className="page-hero-actions">
              <span className={`badge ${statusClass(task.taskStatus)}`}>{task.taskStatus}</span>
              <span className={`badge ${priorityClass(task.taskPriority)}`}>
                {task.taskPriority}
              </span>
              <Link className="btn-ghost" to={`/projects/${projectId}/board`}>
                Back to board
              </Link>
              {!editing && (
                <button type="button" className="btn-ghost" onClick={startEdit}>
                  Edit
                </button>
              )}
            </div>
          </div>

          <div className="issue-grid">
            <div className="issue-main stack">
              {actionError && <p className="form-error">{actionError}</p>}

              <div className="panel">
                <div className="section-head">
                  <h2>Description</h2>
                </div>
                {task.description ? (
                  <p className="workspace-detail-desc">{task.description}</p>
                ) : (
                  <p className="muted">No description.</p>
                )}
              </div>

              {editing && (
                <form
                  className="workspace-form workspace-form-flush"
                  onSubmit={handleSave}
                  noValidate
                >
                  <h2>Edit task</h2>
                  <label className="field">
                    <span>Title</span>
                    <input value={form.title} onChange={update('title')} maxLength={150} />
                    {fieldErrors.title && (
                      <span className="field-error">{fieldErrors.title.join('; ')}</span>
                    )}
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <textarea
                      value={form.description}
                      onChange={update('description')}
                      rows={4}
                      maxLength={2000}
                    />
                    {fieldErrors.description && (
                      <span className="field-error">{fieldErrors.description.join('; ')}</span>
                    )}
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
                  <p className="section-note">
                    Status set here does not move the task between boards; only a move changes its
                    board.
                  </p>
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
                        setActionError('')
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {membersError && <p className="form-error">{membersError}</p>}

              <nav className="tabs" aria-label="Task discussion">
                <button
                  type="button"
                  className={'tab' + (discussion === 'comments' ? ' active' : '')}
                  aria-pressed={discussion === 'comments'}
                  onClick={() => openDiscussion('comments')}
                >
                  Comments
                </button>
                <button
                  type="button"
                  className={'tab' + (discussion === 'activity' ? ' active' : '')}
                  aria-pressed={discussion === 'activity'}
                  onClick={() => openDiscussion('activity')}
                >
                  Activity
                </button>
              </nav>

              <div hidden={discussion !== 'comments'}>
                <TaskComments taskId={task.id} currentUserId={myUserId} projectId={projectId} />
              </div>
              {activitySeen && (
                <div hidden={discussion !== 'activity'}>
                  <TaskActivityFeed taskId={task.id} />
                </div>
              )}

              <TaskBlockers
                taskId={task.id}
                projectId={projectId}
                boards={boards}
                canManage={canManageBlockers}
              />
            </div>

            <aside className="issue-side">
              <div className="panel">
                <div className="section-head">
                  <h2>Details</h2>
                </div>
                <dl className="kv">
                  <dt>Status</dt>
                  <dd>
                    <span className={`badge badge-small ${statusClass(task.taskStatus)}`}>
                      {task.taskStatus}
                    </span>
                  </dd>
                  <dt>Priority</dt>
                  <dd>
                    <span className={`badge badge-small ${priorityClass(task.taskPriority)}`}>
                      {task.taskPriority}
                    </span>
                  </dd>
                  <dt>Assignee</dt>
                  <dd className="byline">
                    <span className="avatar" aria-hidden="true">
                      {initials(task.assigneeName)}
                    </span>
                    {task.assigneeName || 'Unassigned'}
                  </dd>
                  <dt>Due</dt>
                  <dd className={dueClass(task.dueDate, task.taskStatus)}>
                    {formatDateTime(task.dueDate)}
                  </dd>
                  <dt>Board</dt>
                  <dd>{currentBoard ? currentBoard.name : '—'}</dd>
                  <dt>Created by</dt>
                  <dd>{task.createdByName}</dd>
                  <dt>Created</dt>
                  <dd>{formatDateTime(task.createdAt)}</dd>
                  <dt>Updated</dt>
                  <dd>{formatDateTime(task.updatedAt)}</dd>

                  {!editing && (
                    <>
                      <dt>Move to</dt>
                      <dd className="kv-select">
                        <select
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return
                            handleMove(e.target.value)
                          }}
                        >
                          <option value="">Select board…</option>
                          {boards
                            .filter((b) => b.id !== task.boardId)
                            .map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                        </select>
                      </dd>
                      <dt>Assign to</dt>
                      <dd className="kv-select">
                        <select
                          value={task.assigneeId || ''}
                          onChange={(e) => {
                            if (!e.target.value) return
                            handleAssign(e.target.value)
                          }}
                        >
                          <option value="">
                            {members.length ? 'Select member…' : 'No project members'}
                          </option>
                          {members.map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {m.name} ({m.projectRole})
                            </option>
                          ))}
                        </select>
                      </dd>
                    </>
                  )}
                </dl>
                {!editing && task.assigneeId && (
                  <div className="task-card-actions">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        sendFullUpdate({ assigneeId: null }, 'Failed to unassign task.')
                      }
                    >
                      Unassign
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  )
}
