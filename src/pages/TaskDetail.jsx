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

const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const WORKFLOW_BOARDS = new Set([
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
])

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

  const [result, setResult] = useState({
    id: null,
    data: null,
    error: '',
  })

  const [project, setProject] = useState(null)
  const [boards, setBoards] = useState([])
  const [members, setMembers] = useState([])
  const [membersError, setMembersError] = useState('')
  const [reload, setReload] = useState(0)

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

  const currentBoard = boardId
    ? boards.find((board) => board.id === boardId)
    : null

  const myMember = members.find(
    (member) =>
      member.email &&
      email &&
      member.email.toLowerCase() === email.toLowerCase(),
  )

  const myUserId = myMember?.userId

  const isOwnerOrManager =
    myMember?.projectRole === 'OWNER' ||
    myMember?.projectRole === 'MANAGER'

  const isAssignedToMe =
    Boolean(task?.assigneeId) &&
    Boolean(myUserId) &&
    task.assigneeId === myUserId

  const isDone =
    (currentBoard?.name || '').toUpperCase() === 'DONE' ||
    (task?.taskStatus || '').toUpperCase() === 'DONE'

  /*
   * Active task permissions:
   *
   * OWNER/MANAGER:
   * - edit
   * - move
   * - assign
   * - unassign
   *
   * Assigned user:
   * - edit
   * - move
   *
   * Normal unassigned member:
   * - read only
   *
   * DONE:
   * - completely locked
   */
  const canEditTask =
    !isDone &&
    (isOwnerOrManager || isAssignedToMe)

  const canMoveTask =
    !isDone &&
    (isOwnerOrManager || isAssignedToMe)

  const canManageAssignee =
    !isDone &&
    isOwnerOrManager

  const canManageBlockers =
    !isDone && isOwnerOrManager

  function refreshTask() {
    setReload((value) => value + 1)
  }

  function openDiscussion(tab) {
    setDiscussion(tab)

    if (tab === 'activity') {
      setActivitySeen(true)
    }
  }

  useEffect(() => {
    if (!boardId) {
      return undefined
    }

    let active = true

    apiFetch(`/api/boards/${boardId}/tasks/${taskId}`)
      .then((data) => {
        if (active) {
          setResult({
            id: taskId,
            data,
            error: '',
          })
        }
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setResult({
            id: taskId,
            data: null,
            error:
              err.message ||
              'Failed to load task.',
          })
        }
      })

    return () => {
      active = false
    }
  }, [taskId, boardId, reload])

  useEffect(() => {
    if (!projectId) {
      return undefined
    }

    let active = true

    apiFetch(`/api/projects/${projectId}/boards`)
      .then((data) => {
        if (active) {
          setBoards(data)
        }
      })
      .catch(() => {
        // Task request handles the visible error.
      })

    return () => {
      active = false
    }
  }, [projectId, reload])

  useEffect(() => {
    if (!projectId) {
      return undefined
    }

    let active = true

    apiFetch(`/api/projects/${projectId}`)
      .then((data) => {
        if (active) {
          setProject(data)
        }
      })
      .catch(() => {
        // Breadcrumb only.
      })

    return () => {
      active = false
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) {
      return undefined
    }

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
          setMembersError(
            err.message ||
              'Failed to load project members.',
          )
        }
      })

    return () => {
      active = false
    }
  }, [projectId])

  const update = (key) => (event) => {
    setForm((current) => ({
      ...current,
      [key]: event.target.value,
    }))
  }

  const liveTimer = useRef(null)

  useEffect(() => {
    return () => {
      if (liveTimer.current) {
        clearTimeout(liveTimer.current)
      }
    }
  }, [])

  useProjectEvents(projectId, (event) => {
    if (
      event.type !== 'TASK_UPDATED' &&
      event.type !== 'TASK_ASSIGNED'
    ) {
      return
    }

    if (event.taskId !== taskId) {
      return
    }

    if (liveTimer.current) {
      return
    }

    liveTimer.current = setTimeout(() => {
      liveTimer.current = null
      setReload((value) => value + 1)
    }, 400)
  })

  function startEdit() {
    if (!canEditTask || !task) {
      return
    }

    setForm({
      title: task.title,
      description: task.description || '',
      taskPriority: task.taskPriority,
      dueDate: toDateTimeLocal(task.dueDate),
    })

    setFieldErrors({})
    setActionError('')
    setEditing(true)
  }

  async function handleSave(event) {
    event.preventDefault()

    if (!canEditTask || busy) {
      return
    }

    setActionError('')
    setFieldErrors({})

    if (
      !form.title?.trim() ||
      !form.description?.trim()
    ) {
      setActionError(
        'Title and description are both required.',
      )
      return
    }

    setBusy(true)

    try {
      await apiFetch(
        `/api/boards/${boardId}/tasks/${taskId}`,
        {
          method: 'PUT',
          body: {
            title: form.title,
            description: form.description,
            taskPriority: form.taskPriority,

            /*
             * Keep the backend's existing status.
             * Workflow state is controlled by board movement.
             */
            taskStatus: task.taskStatus,

            dueDate: fromDateTimeLocal(
              form.dueDate,
            ),

            /*
             * Keep the existing assignee.
             * Assignee changes have their own permission-controlled action.
             */
            assigneeId: task.assigneeId,
          },
        },
      )

      setEditing(false)
      refreshTask()
    } catch (err) {
      if (
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setFieldErrors(err.fieldErrors)
      } else {
        setActionError(
          err.message ||
            'Failed to update task.',
        )
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleAssign(assigneeId) {
    if (!canManageAssignee || busy) {
      return
    }

    if (!assigneeId) {
      return
    }

    setActionError('')
    setBusy(true)

    try {
      await apiFetch(
        `/api/boards/${boardId}/tasks/${taskId}/assignee`,
        {
          method: 'PUT',
          body: {
            assigneeId,
          },
        },
      )

      refreshTask()
    } catch (err) {
      setActionError(
        err.message ||
          'Failed to assign task.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleUnassign() {
    if (
      !canManageAssignee ||
      !task.assigneeId ||
      busy
    ) {
      return
    }

    setActionError('')
    setBusy(true)

    try {
      /*
       * The backend has no dedicated DELETE/unassign endpoint.
       * Its existing total task-update endpoint accepts assigneeId: null.
       */
      await apiFetch(
        `/api/boards/${boardId}/tasks/${taskId}`,
        {
          method: 'PUT',
          body: {
            title: task.title,
            description: task.description,
            taskPriority: task.taskPriority,
            taskStatus: task.taskStatus,
            dueDate: task.dueDate,
            assigneeId: null,
          },
        },
      )

      refreshTask()
    } catch (err) {
      setActionError(
        err.message ||
          'Failed to unassign task.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleMove(targetBoardId) {
    if (
      !canMoveTask ||
      !targetBoardId ||
      targetBoardId === task.boardId ||
      busy
    ) {
      return
    }

    setActionError('')
    setBusy(true)

    try {
      await apiFetch(
        `/api/boards/${boardId}/tasks/${taskId}/move`,
        {
          method: 'PUT',
          body: {
            boardId: targetBoardId,
          },
        },
      )

      /*
       * The task now belongs to the destination board.
       * Update the page context before reloading it.
       */
      setCtx({
        taskId,
        boardId: targetBoardId,
        projectId,
      })
    } catch (err) {
      setActionError(
        err.message ||
          'Failed to move task.',
      )
    } finally {
      setBusy(false)
      refreshTask()
    }
  }

  if (!boardId || !projectId) {
    return (
      <section>
        <h1>Task</h1>

        <div className="form-error">
          <p>
            This task was opened without its
            board. Open the task from its project
            board.
          </p>

          <p>
            <Link to="/workspaces">
              Workspaces
            </Link>
          </p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <p className="breadcrumb">
        <Link to="/workspaces">
          Workspaces
        </Link>

        {project && (
          <>
            {' / '}

            <Link
              to={`/workspaces/${project.workspaceId}`}
            >
              Workspace
            </Link>

            {' / '}

            <Link
              to={`/projects/${project.id}`}
            >
              {project.name}
            </Link>

            {' / '}

            <Link
              to={`/projects/${project.id}/board`}
            >
              Board
            </Link>
          </>
        )}
      </p>

      {loading && (
        <p className="loading">
          Loading task…
        </p>
      )}

      {!loading && error && (
        <div className="form-error">
          <p>{error}</p>

          <p>
            <Link
              to={`/projects/${projectId}/board`}
            >
              Back to board
            </Link>
          </p>
        </div>
      )}

      {!loading && !error && task && (
        <>
          <div className="page-hero">
            <div className="page-hero-main">
              <p className="page-hero-eyebrow">
                {project
                  ? project.name
                  : 'Task'}

                {currentBoard
                  ? ` · ${currentBoard.name}`
                  : ''}
              </p>

              <h1>{task.title}</h1>
            </div>

            <div className="page-hero-actions">
              {currentBoard && (
                <span
                  className={`badge ${statusClass(
                    currentBoard.name,
                  )}`}
                >
                  {currentBoard.name}
                </span>
              )}

              <span
                className={`badge ${priorityClass(
                  task.taskPriority,
                )}`}
              >
                {task.taskPriority}
              </span>

              <Link
                className="btn-ghost"
                to={`/projects/${projectId}/board`}
              >
                Back to board
              </Link>

              {canEditTask && !editing && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={startEdit}
                  disabled={busy}
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {isDone && (
            <p className="section-note">
              This task is completed and locked.
              Completed tasks cannot be moved,
              edited, assigned, or unassigned.
            </p>
          )}

          {!isDone &&
            !isOwnerOrManager &&
            !isAssignedToMe && (
              <p className="section-note">
                This task is read-only because it
                is not assigned to you.
              </p>
            )}

          <div className="issue-grid">
            <div className="issue-main stack">
              {actionError && (
                <p className="form-error">
                  {actionError}
                </p>
              )}

              <div className="panel">
                <div className="section-head">
                  <h2>Description</h2>
                </div>

                {task.description ? (
                  <p className="workspace-detail-desc">
                    {task.description}
                  </p>
                ) : (
                  <p className="muted">
                    No description.
                  </p>
                )}
              </div>

              {editing && canEditTask && (
                <form
                  className="workspace-form workspace-form-flush"
                  onSubmit={handleSave}
                  noValidate
                >
                  <h2>Edit task</h2>

                  <label className="field">
                    <span>Title</span>

                    <input
                      value={form.title}
                      onChange={update('title')}
                      maxLength={150}
                    />

                    {fieldErrors.title && (
                      <span className="field-error">
                        {fieldErrors.title.join(
                          '; ',
                        )}
                      </span>
                    )}
                  </label>

                  <label className="field">
                    <span>Description</span>

                    <textarea
                      value={form.description}
                      onChange={update(
                        'description',
                      )}
                      rows={4}
                      maxLength={2000}
                    />

                    {fieldErrors.description && (
                      <span className="field-error">
                        {fieldErrors.description.join(
                          '; ',
                        )}
                      </span>
                    )}
                  </label>

                  <label className="field field-narrow">
                    <span>Priority</span>

                    <select
                      value={
                        form.taskPriority
                      }
                      onChange={update(
                        'taskPriority',
                      )}
                    >
                      {TASK_PRIORITIES.map(
                        (priority) => (
                          <option
                            key={priority}
                            value={priority}
                          >
                            {priority}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label className="field field-narrow">
                    <span>Due date</span>

                    <input
                      type="datetime-local"
                      value={
                        form.dueDate
                      }
                      onChange={update(
                        'dueDate',
                      )}
                    />
                  </label>

                  <div className="task-card-actions">
                    <button
                      type="submit"
                      disabled={busy}
                    >
                      {busy
                        ? 'Saving…'
                        : 'Save'}
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setEditing(false)
                        setActionError('')
                        setFieldErrors({})
                      }}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {membersError && (
                <p className="form-error">
                  {membersError}
                </p>
              )}

              <nav
                className="tabs"
                aria-label="Task discussion"
              >
                <button
                  type="button"
                  className={
                    'tab' +
                    (discussion ===
                    'comments'
                      ? ' active'
                      : '')
                  }
                  aria-pressed={
                    discussion ===
                    'comments'
                  }
                  onClick={() =>
                    openDiscussion(
                      'comments',
                    )
                  }
                >
                  Comments
                </button>

                <button
                  type="button"
                  className={
                    'tab' +
                    (discussion ===
                    'activity'
                      ? ' active'
                      : '')
                  }
                  aria-pressed={
                    discussion ===
                    'activity'
                  }
                  onClick={() =>
                    openDiscussion(
                      'activity',
                    )
                  }
                >
                  Activity
                </button>
              </nav>

              <div
                hidden={
                  discussion !==
                  'comments'
                }
              >
                <TaskComments
                  taskId={task.id}
                  currentUserId={
                    myUserId
                  }
                  projectId={
                    projectId
                  }
                  readOnly={isDone}
                />
              </div>

              {activitySeen && (
                <div
                  hidden={
                    discussion !==
                    'activity'
                  }
                >
                  <TaskActivityFeed
                    taskId={task.id}
                    projectId={
                      projectId
                    }
                  />
                </div>
              )}

              <TaskBlockers
                taskId={task.id}
                projectId={projectId}
                boards={boards}
                canManage={
                  canManageBlockers
                }
              />
            </div>

            <aside className="issue-side">
              <div className="panel">
                <div className="section-head">
                  <h2>Details</h2>
                </div>

                <dl className="kv">
                  <dt>Board</dt>

                  <dd>
                    {currentBoard ? (
                      <span
                        className={`badge badge-small ${statusClass(
                          currentBoard.name,
                        )}`}
                      >
                        {currentBoard.name}
                      </span>
                    ) : (
                      '—'
                    )}
                  </dd>

                  <dt>Priority</dt>

                  <dd>
                    <span
                      className={`badge badge-small ${priorityClass(
                        task.taskPriority,
                      )}`}
                    >
                      {task.taskPriority}
                    </span>
                  </dd>

                  <dt>Assignee</dt>

                  <dd className="byline">
                    <span
                      className="avatar"
                      aria-hidden="true"
                    >
                      {initials(
                        task.assigneeName,
                      )}
                    </span>

                    {task.assigneeName ||
                      'Unassigned'}
                  </dd>

                  <dt>Due</dt>

                  <dd
                    className={dueClass(
                      task.dueDate,
                      task.taskStatus,
                    )}
                  >
                    {formatDateTime(
                      task.dueDate,
                    )}
                  </dd>

                  <dt>Created by</dt>

                  <dd>
                    {task.createdByName}
                  </dd>

                  <dt>Created</dt>

                  <dd>
                    {formatDateTime(
                      task.createdAt,
                    )}
                  </dd>

                  <dt>Updated</dt>

                  <dd>
                    {formatDateTime(
                      task.updatedAt,
                    )}
                  </dd>

                  {canMoveTask && (
                    <>
                      <dt>Move to</dt>

                      <dd className="kv-select">
                        <select
                          value=""
                          disabled={busy}
                          onChange={(
                            event,
                          ) => {
                            if (
                              !event.target
                                .value
                            ) {
                              return
                            }

                            handleMove(
                              event.target
                                .value,
                            )
                          }}
                        >
                          <option value="">
                            Select board…
                          </option>

                          {boards
                            .filter(
                              (board) =>
                                board.id !==
                                  task.boardId &&
                                WORKFLOW_BOARDS.has(
                                  (
                                    board.name ||
                                    ''
                                  ).toUpperCase(),
                                ),
                            )
                            .map(
                              (board) => (
                                <option
                                  key={
                                    board.id
                                  }
                                  value={
                                    board.id
                                  }
                                >
                                  {board.name}
                                </option>
                              ),
                            )}
                        </select>
                      </dd>
                    </>
                  )}

                  {canManageAssignee && (
                    <>
                      <dt>Assign to</dt>

                      <dd className="kv-select">
                        <select
                          value={
                            task.assigneeId ||
                            ''
                          }
                          disabled={busy}
                          onChange={(
                            event,
                          ) => {
                            handleAssign(
                              event.target
                                .value,
                            )
                          }}
                        >
                          <option value="">
                            Select member…
                          </option>

                          {members.map(
                            (member) => (
                              <option
                                key={
                                  member.userId
                                }
                                value={
                                  member.userId
                                }
                              >
                                {member.name} (
                                {
                                  member.projectRole
                                }
                                )
                              </option>
                            ),
                          )}
                        </select>
                      </dd>
                    </>
                  )}
                </dl>

                {canManageAssignee &&
                  task.assigneeId && (
                    <div className="task-card-actions">
                      <button
                        type="button"
                        className="link-button"
                        onClick={
                          handleUnassign
                        }
                        disabled={busy}
                      >
                        {busy
                          ? 'Saving…'
                          : 'Unassign'}
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