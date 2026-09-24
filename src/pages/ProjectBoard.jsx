import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { useAuth } from '../auth/context.js'
import BoardColumn from '../components/BoardColumn.jsx'
import { fromDateTimeLocal } from '../utils/format.js'
import { useProjectEvents } from '../realtime/useProjectEvents.js'

const TABS = [
  { label: 'Overview', end: true },
  { label: 'Dashboard', path: 'dashboard' },
  { label: 'Board', path: 'board' },
]

// CreateTaskRequest: { title @NotBlank ≤150, description @NotBlank ≤2000,
//                      dueDate?, assigneeId? } — priority/status are set by the
// backend on create (MEDIUM / TODO) and only change through a task update.
// boardId is frontend-only form state: it selects the endpoint, never the body.
const EMPTY_TASK = { title: '', description: '', dueDate: '', assigneeId: '', boardId: '' }

function sortBoards(boards) {
  return [...boards].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name)
  )
}

// CreateBoardRequest: { name @NotBlank ≤100, position @NotNull Integer }. Positions
// are 0-based, so the next board continues the server ordering without asking the
// user. The backend exposes no board update/delete endpoints, so none is offered here.
export default function ProjectBoard() {
  const { projectId } = useParams()
  const { email } = useAuth()
  const [project, setProject] = useState(null)
  const [boardsState, setBoardsState] = useState({ id: null, data: null, error: '' })
  const [boardsReload, setBoardsReload] = useState(0)
  const [tasksReload, setTasksReload] = useState(0)
  const [tasksByBoard, setTasksByBoard] = useState({})
  const [members, setMembers] = useState([])
  const [membersError, setMembersError] = useState('')
  const [actionError, setActionError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState(EMPTY_TASK)
  const [taskFieldErrors, setTaskFieldErrors] = useState({})
  const [taskFormError, setTaskFormError] = useState('')
  const [taskSaving, setTaskSaving] = useState(false)

  const [reordering, setReordering] = useState(false)
  const reorderInFlight = useRef(false)

  const boardsReady = boardsState.id === projectId && !boardsState.error
  const boards = boardsReady && Array.isArray(boardsState.data) ? boardsState.data : []
  const boardsLoading = boardsState.id !== projectId
  const boardsError = boardsState.id === projectId ? boardsState.error : ''
  const sortedBoards = sortBoards(boards)
  const selectedBoardId = taskForm.boardId || sortedBoards[0]?.id || ''
  const nextBoardPosition = boards.length
    ? Math.max(...boards.map((b) => b.position)) + 1
    : 0
  // ReorderBoardsRequest wants the complete board id list, and the backend gate is
  // OWNER/MANAGER. The project members list is the only role source the frontend has:
  // AuthContext exposes an email rather than a user id, so members are matched on it.
  const myMember = members.find(
    (m) => m.email && email && m.email.toLowerCase() === email.toLowerCase(),
  )
  const canReorderBoards =
    myMember?.projectRole === 'OWNER' || myMember?.projectRole === 'MANAGER'

  useEffect(() => {
    let active = true
    apiFetch(`/api/projects/${projectId}`)
      .then((data) => {
        if (active) setProject(data)
      })
      .catch(() => {
        // The boards request below reports the real status for an unreadable project.
      })
    return () => {
      active = false
    }
  }, [projectId])

  useEffect(() => {
    let active = true
    apiFetch(`/api/projects/${projectId}/boards`)
      .then((data) => {
        if (active) setBoardsState({ id: projectId, data, error: '' })
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setBoardsState({
            id: projectId,
            data: null,
            error: err.message || 'Failed to load boards.',
          })
        }
      })
    return () => {
      active = false
    }
  }, [projectId, boardsReload])

  // Project members feed the assignee pickers; AssignTaskRequest wants a user UUID.
  useEffect(() => {
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

  // Tasks are always re-read from the server: the backend, not the client, decides
  // which board and status a task ends up on after a move.
  useEffect(() => {
    if (!boardsReady) return undefined
    let active = true
    const ordered = sortBoards(boardsState.data || [])
    Promise.all(
      ordered.map((board) =>
        apiFetch(`/api/boards/${board.id}/tasks`)
          .then((tasks) => [board.id, { loading: false, error: '', data: tasks }])
          .catch((err) => [
            board.id,
            { loading: false, error: err.message || 'Failed to load tasks.', data: [] },
          ])
      )
    ).then((entries) => {
      if (active) setTasksByBoard(Object.fromEntries(entries))
    })
    return () => {
      active = false
    }
  }, [boardsState, boardsReady, tasksReload])

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const updateTask = (key) => (e) => setTaskForm((f) => ({ ...f, [key]: e.target.value }))
  const refreshBoards = () => setBoardsReload((n) => n + 1)
  const refreshTasks = () => setTasksReload((n) => n + 1)
  // Create/update/unassign report their own errors inside the card or column, so a
  // successful one also dismisses the banner left over by a failed move.
  const handleTasksChanged = () => {
    setActionError('')
    refreshTasks()
  }

  // Real-time: TASK_* events only say which project changed, so the board re-reads
  // the server instead of editing local state. The short timer both coalesces
  // bursts of events and lets the publishing transaction commit.
  const liveTimer = useRef(null)
  useEffect(
    () => () => {
      if (liveTimer.current) clearTimeout(liveTimer.current)
    },
    [],
  )

  useProjectEvents(projectId, (event) => {
    if (!event.type.startsWith('TASK_')) return
    if (liveTimer.current) return
    liveTimer.current = setTimeout(() => {
      liveTimer.current = null
      handleTasksChanged()
    }, 400)
  })

  async function handleCreateBoard(e) {
    e.preventDefault()
    if (saving) return
    setFormError('')
    const errors = {}
    if (!form.name.trim()) errors.name = ['Board name is required']
    else if (form.name.length > 100) errors.name = ['Name must be 100 characters or fewer']
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setSaving(true)
    try {
      await apiFetch(`/api/projects/${projectId}/boards`, {
        method: 'POST',
        body: { name: form.name, position: nextBoardPosition },
      })
      setForm({ name: '' })
      setShowForm(false)
      refreshBoards()
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors)
      } else {
        setFormError(err.message || 'Failed to create board.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault()
    if (taskSaving) return
    const boardId = selectedBoardId
    setTaskFormError('')
    const errors = {}
    if (!taskForm.title.trim()) errors.title = ['Title is required']
    else if (taskForm.title.length > 150)
      errors.title = ['Title must be 150 characters or fewer']
    if (!taskForm.description.trim()) errors.description = ['Description is required']
    else if (taskForm.description.length > 2000)
      errors.description = ['Description must be 2000 characters or fewer']
    if (!boardId) errors.boardId = ['Choose a board']
    if (Object.keys(errors).length > 0) {
      setTaskFieldErrors(errors)
      return
    }
    setTaskFieldErrors({})
    setTaskSaving(true)
    try {
      await apiFetch(`/api/boards/${boardId}/tasks`, {
        method: 'POST',
        body: {
          title: taskForm.title,
          description: taskForm.description,
          dueDate: fromDateTimeLocal(taskForm.dueDate),
          assigneeId: taskForm.assigneeId || null,
        },
      })
      setTaskForm(EMPTY_TASK)
      setShowTaskForm(false)
      handleTasksChanged()
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setTaskFieldErrors(err.fieldErrors)
      } else {
        setTaskFormError(err.message || 'Failed to create task.')
      }
    } finally {
      setTaskSaving(false)
    }
  }

  async function handleMove(task, boardId) {
    setActionError('')
    try {
      await apiFetch(`/api/boards/${task.boardId}/tasks/${task.id}/move`, {
        method: 'PUT',
        body: { boardId },
      })
    } catch (err) {
      setActionError(err.message || 'Failed to move task.')
    } finally {
      refreshTasks()
    }
  }

  async function handleAssign(task, assigneeId) {
    setActionError('')
    try {
      await apiFetch(`/api/boards/${task.boardId}/tasks/${task.id}/assignee`, {
        method: 'PUT',
        body: { assigneeId },
      })
    } catch (err) {
      setActionError(err.message || 'Failed to assign task.')
    } finally {
      refreshTasks()
    }
  }

  // The order is only ever read back from the server: this handler sends the full
  // swapped list and then reloads the boards, so a rejected or partially applied
  // reorder can never leave the client showing an order that was never persisted.
  // The ref is the real duplicate guard — `reordering` only reaches the DOM as a
  // `disabled` attribute after a render, which two activations in one tick beat.
  async function handleReorder(boardId, direction) {
    if (reorderInFlight.current) return
    const current = sortedBoards.map((b) => b.id)
    const from = current.indexOf(boardId)
    const to = direction === 'left' ? from - 1 : from + 1
    if (from < 0 || to < 0 || to >= current.length) return
    const next = [...current]
    const tmp = next[from]
    next[from] = next[to]
    next[to] = tmp
    reorderInFlight.current = true
    setReordering(true)
    setActionError('')
    try {
      await apiFetch(`/api/projects/${projectId}/boards/reorder`, {
        method: 'PUT',
        body: { boardIds: next },
      })
      refreshBoards()
    } catch (err) {
      setActionError(err.message || 'Failed to reorder boards.')
    } finally {
      reorderInFlight.current = false
      setReordering(false)
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

      <div className="page-hero">
        <div className="page-hero-main">
          <p className="page-hero-eyebrow">Board</p>
          <h1>{project ? project.name : 'Project'}</h1>
          <p className="page-hero-desc">
            {project?.description || 'Each board holds its tasks in TODO, IN_PROGRESS, IN_REVIEW and DONE.'}
          </p>
        </div>
        <div className="page-hero-actions">
          {boardsReady && sortedBoards.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setShowTaskForm((v) => !v)
                setTaskFormError('')
                setTaskFieldErrors({})
              }}
            >
              {showTaskForm ? 'Cancel' : '+ Create Task'}
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowForm((v) => !v)
              setFormError('')
              setFieldErrors({})
            }}
          >
            {showForm ? 'Cancel' : 'Create board'}
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

      {showTaskForm && sortedBoards.length > 0 && (
        <form
          className="workspace-form workspace-form-flush"
          onSubmit={handleCreateTask}
          noValidate
        >
          <h2>Create Task</h2>
          {taskFormError && <p className="form-error">{taskFormError}</p>}
          <label className="field">
            <span>Title</span>
            <input value={taskForm.title} onChange={updateTask('title')} maxLength={150} />
            {taskFieldErrors.title && (
              <span className="field-error">{taskFieldErrors.title.join('; ')}</span>
            )}
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              value={taskForm.description}
              onChange={updateTask('description')}
              rows={3}
              maxLength={2000}
            />
            {taskFieldErrors.description && (
              <span className="field-error">{taskFieldErrors.description.join('; ')}</span>
            )}
          </label>
          <label className="field">
            <span>Board</span>
            <select value={selectedBoardId} onChange={updateTask('boardId')}>
              {sortedBoards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
            {taskFieldErrors.boardId && (
              <span className="field-error">{taskFieldErrors.boardId.join('; ')}</span>
            )}
          </label>
          <label className="field">
            <span>Due date</span>
            <input
              type="datetime-local"
              value={taskForm.dueDate}
              onChange={updateTask('dueDate')}
            />
            {taskFieldErrors.dueDate && (
              <span className="field-error">{taskFieldErrors.dueDate.join('; ')}</span>
            )}
          </label>
          <label className="field">
            <span>Assignee</span>
            <select value={taskForm.assigneeId} onChange={updateTask('assigneeId')}>
              <option value="">{members.length ? 'Unassigned' : 'No project members'}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} ({m.projectRole})
                </option>
              ))}
            </select>
            {taskFieldErrors.assigneeId && (
              <span className="field-error">{taskFieldErrors.assigneeId.join('; ')}</span>
            )}
          </label>
          <div className="task-card-actions">
            <button type="submit" disabled={taskSaving}>
              {taskSaving ? 'Creating…' : 'Create Task'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowTaskForm(false)
                setTaskForm(EMPTY_TASK)
                setTaskFormError('')
                setTaskFieldErrors({})
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {showForm && (
        <form
          className="workspace-form workspace-form-flush"
          onSubmit={handleCreateBoard}
          noValidate
        >
          <h2>New board</h2>
          {formError && <p className="form-error">{formError}</p>}
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={update('name')} maxLength={100} />
            {fieldErrors.name && (
              <span className="field-error">{fieldErrors.name.join('; ')}</span>
            )}
          </label>
          <p className="section-note">
            The board is added after the existing ones. Moving a task adopts the destination
            board&apos;s name as its status, so only TODO, IN_PROGRESS, IN_REVIEW and DONE accept
            moves.
          </p>
          <div className="task-card-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {boardsError && (
        <div className="form-error">
          <p>{boardsError}</p>
          <p>
            <Link to={`/projects/${projectId}`}>Back to project</Link>
          </p>
        </div>
      )}

      {membersError && <p className="form-error">{membersError}</p>}
      {actionError && <p className="form-error">{actionError}</p>}

      {boardsLoading && !boardsError && <p className="loading">Loading boards…</p>}
      {!boardsLoading && !boardsError && sortedBoards.length === 0 && (
        <div className="empty-block">
          <p className="empty-block-title">No boards yet</p>
          <p className="empty-block-desc">
            A board is where tasks live and move. Create one to start planning this project.
          </p>
          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v)
              setFormError('')
              setFieldErrors({})
            }}
          >
            Create board
          </button>
        </div>
      )}

      {!boardsLoading && !boardsError && sortedBoards.length > 0 && (
        <div className="kanban">
          {sortedBoards.map((board) => {
            const entry = tasksByBoard[board.id]
            return (
              <BoardColumn
                key={board.id}
                board={board}
                boards={sortedBoards}
                members={members}
                projectId={projectId}
                tasks={entry?.data ?? []}
                loading={!entry}
                error={entry?.error ?? ''}
                onTasksChanged={handleTasksChanged}
                onMove={handleMove}
                onAssign={handleAssign}
                canReorder={canReorderBoards && sortedBoards.length > 1}
                reordering={reordering}
                onReorder={handleReorder}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
