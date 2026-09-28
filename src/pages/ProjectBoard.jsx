import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import BoardColumn from '../components/BoardColumn.jsx'
import { fromDateTimeLocal } from '../utils/format.js'
import { useProjectEvents } from '../realtime/useProjectEvents.js'

const TABS = [
  { label: 'Overview', end: true },
  { label: 'Dashboard', path: 'dashboard' },
  { label: 'Board', path: 'board' },
]

const EMPTY_TASK = {
  title: '',
  description: '',
  dueDate: '',
  assigneeId: '',
}

const WORKFLOW = [
  { key: 'TODO', label: 'TODO' },
  { key: 'IN_PROGRESS', label: 'IN PROGRESS' },
  { key: 'IN_REVIEW', label: 'IN REVIEW' },
  { key: 'DONE', label: 'DONE' },
]

function sortBoards(boards) {
  return [...boards].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name),
  )
}

export default function ProjectBoard() {
  const { projectId } = useParams()

  const [project, setProject] = useState(null)
  const [boardsState, setBoardsState] = useState({
    id: null,
    data: null,
    error: '',
  })

  const [tasksReload, setTasksReload] = useState(0)
  const [tasksByBoard, setTasksByBoard] = useState({})
  const [members, setMembers] = useState([])
  const [membersError, setMembersError] = useState('')

  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState(EMPTY_TASK)
  const [taskFieldErrors, setTaskFieldErrors] = useState({})
  const [taskFormError, setTaskFormError] = useState('')
  const [taskSaving, setTaskSaving] = useState(false)

  const boardsReady =
    boardsState.id === projectId && !boardsState.error

  const boards =
    boardsReady && Array.isArray(boardsState.data)
      ? boardsState.data
      : []

  const boardsLoading = boardsState.id !== projectId

  const boardsError =
    boardsState.id === projectId
      ? boardsState.error
      : ''

  const sortedBoards = sortBoards(boards)

  const workflowBoards = WORKFLOW.map((workflow) => ({
    workflow,
    board:
      sortedBoards.find(
        (board) =>
          (board.name || '').toUpperCase() === workflow.key,
      ) || null,
  }))

  const missingWorkflow = workflowBoards.filter(
    ({ board }) => !board,
  )

  const todoBoard =
    workflowBoards.find(
      ({ workflow }) => workflow.key === 'TODO',
    )?.board || null

  const selectedBoardId = todoBoard?.id || ''

  useEffect(() => {
    let active = true

    apiFetch(`/api/projects/${projectId}`)
      .then((data) => {
        if (active) {
          setProject(data)
        }
      })
      .catch(() => {
        // Boards request handles the visible project error.
      })

    return () => {
      active = false
    }
  }, [projectId])

  useEffect(() => {
    let active = true

    apiFetch(`/api/projects/${projectId}/boards`)
      .then((data) => {
        if (active) {
          setBoardsState({
            id: projectId,
            data,
            error: '',
          })
        }
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setBoardsState({
            id: projectId,
            data: null,
            error:
              err.message || 'Failed to load boards.',
          })
        }
      })

    return () => {
      active = false
    }
  }, [projectId])

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

  useEffect(() => {
    if (!boardsReady) {
      return undefined
    }

    let active = true

    const orderedBoards = sortBoards(
      boardsState.data || [],
    )

    Promise.all(
      orderedBoards.map((board) =>
        apiFetch(`/api/boards/${board.id}/tasks`)
          .then((tasks) => [
            board.id,
            {
              loading: false,
              error: '',
              data: tasks,
            },
          ])
          .catch((err) => [
            board.id,
            {
              loading: false,
              error:
                err.message ||
                'Failed to load tasks.',
              data: [],
            },
          ]),
      ),
    ).then((entries) => {
      if (active) {
        setTasksByBoard(
          Object.fromEntries(entries),
        )
      }
    })

    return () => {
      active = false
    }
  }, [
    boardsState,
    boardsReady,
    tasksReload,
  ])

  const liveTimer = useRef(null)

  useEffect(() => {
    return () => {
      if (liveTimer.current) {
        clearTimeout(liveTimer.current)
      }
    }
  }, [])

  useProjectEvents(projectId, (event) => {
    if (!event.type.startsWith('TASK_')) {
      return
    }

    if (liveTimer.current) {
      return
    }

    liveTimer.current = setTimeout(() => {
      liveTimer.current = null
      setTasksReload((value) => value + 1)
    }, 400)
  })

  const updateTask =
    (key) =>
    (event) => {
      setTaskForm((form) => ({
        ...form,
        [key]: event.target.value,
      }))
    }

  const refreshTasks = () => {
    setTasksReload((value) => value + 1)
  }

  async function handleCreateTask(event) {
    event.preventDefault()

    if (taskSaving) {
      return
    }

    const boardId = selectedBoardId

    setTaskFormError('')

    const errors = {}

    if (!taskForm.title.trim()) {
      errors.title = ['Title is required']
    } else if (taskForm.title.length > 150) {
      errors.title = [
        'Title must be 150 characters or fewer',
      ]
    }

    if (!taskForm.description.trim()) {
      errors.description = [
        'Description is required',
      ]
    } else if (taskForm.description.length > 2000) {
      errors.description = [
        'Description must be 2000 characters or fewer',
      ]
    }

    if (!boardId) {
      errors.boardId = [
        'The TODO workflow column is not available for this project.',
      ]
    }

    if (Object.keys(errors).length > 0) {
      setTaskFieldErrors(errors)
      return
    }

    setTaskFieldErrors({})
    setTaskSaving(true)

    try {
      await apiFetch(
        `/api/boards/${boardId}/tasks`,
        {
          method: 'POST',
          body: {
            title: taskForm.title,
            description: taskForm.description,
            dueDate: fromDateTimeLocal(
              taskForm.dueDate,
            ),
            assigneeId:
              taskForm.assigneeId || null,
          },
        },
      )

      setTaskForm(EMPTY_TASK)
      setShowTaskForm(false)
      refreshTasks()
    } catch (err) {
      if (
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setTaskFieldErrors(err.fieldErrors)
      } else {
        setTaskFormError(
          err.message ||
            'Failed to create task.',
        )
      }
    } finally {
      setTaskSaving(false)
    }
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
          </>
        )}
      </p>

      <div className="page-hero">
        <div className="page-hero-main">
          <p className="page-hero-eyebrow">
            Board
          </p>

          <h1>
            {project
              ? project.name
              : 'Project'}
          </h1>

          <p className="page-hero-desc">
            {project?.description ||
              'Each board holds its tasks in TODO, IN_PROGRESS, IN_REVIEW and DONE.'}
          </p>
        </div>

        <div className="page-hero-actions">
          {boardsReady &&
            sortedBoards.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowTaskForm(
                    (value) => !value,
                  )
                  setTaskFormError('')
                  setTaskFieldErrors({})
                }}
              >
                {showTaskForm
                  ? 'Cancel'
                  : '+ Create Task'}
              </button>
            )}
        </div>
      </div>

      <nav
        className="tabs"
        aria-label="Project"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            className={({ isActive }) =>
              'tab' +
              (isActive
                ? ' active'
                : '')
            }
            to={`/projects/${projectId}${
              tab.path
                ? `/${tab.path}`
                : ''
            }`}
            end={tab.end}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {showTaskForm &&
        sortedBoards.length > 0 && (
          <form
            className="workspace-form workspace-form-flush"
            onSubmit={handleCreateTask}
            noValidate
          >
            <h2>Create Task</h2>

            {taskFormError && (
              <p className="form-error">
                {taskFormError}
              </p>
            )}

            <label className="field">
              <span>Title</span>

              <input
                value={taskForm.title}
                onChange={updateTask('title')}
                maxLength={150}
              />

              {taskFieldErrors.title && (
                <span className="field-error">
                  {taskFieldErrors.title.join(
                    '; ',
                  )}
                </span>
              )}
            </label>

            <label className="field">
              <span>Description</span>

              <textarea
                value={taskForm.description}
                onChange={updateTask(
                  'description',
                )}
                rows={3}
                maxLength={2000}
              />

              {taskFieldErrors.description && (
                <span className="field-error">
                  {taskFieldErrors.description.join(
                    '; ',
                  )}
                </span>
              )}
            </label>

            <div className="workflow-default">
              <span className="field-label">
                Workflow
              </span>

              <span className="badge badge-small status-todo">
                TODO
              </span>

              <p className="section-note">
                New tasks start in TODO. Move
                them through the workflow from
                the task detail page.
              </p>

              {taskFieldErrors.boardId && (
                <span className="field-error">
                  {taskFieldErrors.boardId.join(
                    '; ',
                  )}
                </span>
              )}
            </div>

            <label className="field">
              <span>Due date</span>

              <input
                type="datetime-local"
                value={taskForm.dueDate}
                onChange={updateTask(
                  'dueDate',
                )}
              />
            </label>

            <label className="field">
              <span>Assignee</span>

              <select
                value={taskForm.assigneeId}
                onChange={updateTask(
                  'assigneeId',
                )}
              >
                <option value="">
                  {members.length
                    ? 'Unassigned'
                    : 'No project members'}
                </option>

                {members.map((member) => (
                  <option
                    key={member.userId}
                    value={member.userId}
                  >
                    {member.name} (
                    {member.projectRole})
                  </option>
                ))}
              </select>
            </label>

            <div className="task-card-actions">
              <button
                type="submit"
                disabled={taskSaving}
              >
                {taskSaving
                  ? 'Creating…'
                  : 'Create Task'}
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowTaskForm(false)
                  setTaskForm(
                    EMPTY_TASK,
                  )
                  setTaskFormError('')
                  setTaskFieldErrors({})
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

      {boardsError && (
        <div className="form-error">
          <p>{boardsError}</p>

          <p>
            <Link
              to={`/projects/${projectId}`}
            >
              Back to project
            </Link>
          </p>
        </div>
      )}

      {membersError && (
        <p className="form-error">
          {membersError}
        </p>
      )}

      {boardsLoading &&
        !boardsError && (
          <p className="loading">
            Loading boards…
          </p>
        )}

      {!boardsLoading &&
        !boardsError &&
        missingWorkflow.length > 0 && (
          <div className="empty-block">
            <p className="empty-block-title">
              Workflow setup incomplete
            </p>

            <p className="empty-block-desc">
              This project needs the standard
              TODO, IN PROGRESS, IN REVIEW and
              DONE workflow columns.
            </p>

            <p className="section-note">
              Missing:{' '}
              {missingWorkflow
                .map(
                  ({ workflow }) =>
                    workflow.label,
                )
                .join(', ')}
            </p>
          </div>
        )}

      {!boardsLoading &&
        !boardsError &&
        missingWorkflow.length === 0 && (
          <div className="kanban">
            {workflowBoards.map(
              ({ board }) => {
                const entry =
                  tasksByBoard[
                    board.id
                  ]

                return (
                  <BoardColumn
                    key={board.id}
                    board={board}
                    projectId={projectId}
                    tasks={
                      entry?.data ?? []
                    }
                    loading={!entry}
                    error={
                      entry?.error ?? ''
                    }
                  />
                )
              },
            )}
          </div>
        )}
    </section>
  )
}