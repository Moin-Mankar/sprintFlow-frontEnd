import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import {
  dueClass,
  formatDay,
  fromDateTimeLocal,
  initials,
  priorityClass,
  statusClass,
  toDateTimeLocal,
} from '../utils/format.js'

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

// TaskStatus/TaskPriority are stored with @Enumerated(STRING), so sorting on them is
// alphabetical over the enum text, not by severity or workflow order.
const SORT_FIELDS = [
  { value: 'createdAt', label: 'Created' },
  { value: 'updatedAt', label: 'Updated' },
  { value: 'title', label: 'Title' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'taskPriority', label: 'Priority (A–Z)' },
  { value: 'taskStatus', label: 'Status (A–Z)' },
]
const PAGE_SIZES = ['10', '20', '50']
const DEFAULT_SORT = 'createdAt'
const DEFAULT_DIR = 'desc'
const DEFAULT_SIZE = '10'

// Search is board-scoped: GET /api/boards/{boardId}/tasks/search with optional
// status, priority, assigneeId, title, dueDateFrom, dueDateTo plus
// page (0-based) / size / sort=field,direction. Everything below drives that one
// request; results are never filtered, sorted or sliced in the browser.
export default function TaskSearch() {
  const [params, setParams] = useSearchParams()
  const workspaceId = params.get('ws') || ''
  const projectId = params.get('prj') || ''
  const boardId = params.get('board') || ''

  const [workspaces, setWorkspaces] = useState([])
  const [projectsState, setProjectsState] = useState({ id: null, data: [] })
  const [boardsState, setBoardsState] = useState({ id: null, data: [] })
  const [membersState, setMembersState] = useState({ id: null, data: [] })
  const [contextError, setContextError] = useState('')
  const [results, setResults] = useState({ key: null, data: null, error: '' })
  const [text, setText] = useState({
    title: params.get('title') || '',
    from: toDateTimeLocal(params.get('from')),
    to: toDateTimeLocal(params.get('to')),
  })

  // Context lists are keyed by the id they were loaded for, so a change of workspace or
  // project shows nothing stale instead of the previous selection's options.
  const projects = projectsState.id === workspaceId ? projectsState.data : []
  const boards = boardsState.id === projectId ? boardsState.data : []
  const members = membersState.id === projectId ? membersState.data : []

  const query = buildQuery(params)
  const searchKey = boardId ? `/api/boards/${boardId}/tasks/search?${query}` : null
  const loading = Boolean(searchKey) && results.key !== searchKey
  const page = results.data
  const activeBoard = boards.find((b) => b.id === boardId)
  const projectName = projects.find((p) => p.id === projectId)?.name

  useEffect(() => {
    let active = true
    apiFetch('/api/workspaces')
      .then((data) => {
        if (active) setWorkspaces(data)
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setWorkspaces([])
          setContextError(err.message || 'Failed to load workspaces.')
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!workspaceId) return undefined
    let active = true
    apiFetch(`/api/workspaces/${workspaceId}/projects`)
      .then((data) => {
        if (active) setProjectsState({ id: workspaceId, data })
      })
      .catch(() => {
        if (active) setProjectsState({ id: workspaceId, data: [] })
      })
    return () => {
      active = false
    }
  }, [workspaceId])

  useEffect(() => {
    if (!projectId) return undefined
    let active = true
    apiFetch(`/api/projects/${projectId}/boards`)
      .then((data) => {
        if (active) setBoardsState({ id: projectId, data })
      })
      .catch(() => {
        if (active) setBoardsState({ id: projectId, data: [] })
      })
    // AssignTaskRequest/search both want a user UUID, and the project members list is
    // the only directory the backend exposes.
    apiFetch(`/api/projects/${projectId}/members`)
      .then((data) => {
        if (active) setMembersState({ id: projectId, data })
      })
      .catch(() => {
        if (active) setMembersState({ id: projectId, data: [] })
      })
    return () => {
      active = false
    }
  }, [projectId])

  useEffect(() => {
    if (!searchKey) {
      return undefined
    }
    let active = true
    apiFetch(searchKey)
      .then((data) => {
        if (active) setResults({ key: searchKey, data, error: '' })
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setResults({ key: searchKey, data: null, error: err.message || 'Search failed.' })
        }
      })
    return () => {
      active = false
    }
  }, [searchKey])

  // Any filter/context change restarts the search from the backend's first page.
  function patch(next) {
    const updated = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) updated.set(key, value)
      else updated.delete(key)
    }
    updated.delete('page')
    setParams(updated)
  }

  function handleTextSubmit(e) {
    e.preventDefault()
    patch({
      title: text.title.trim(),
      from: fromDateTimeLocal(text.from),
      to: fromDateTimeLocal(text.to),
    })
  }

  function handleClear() {
    setText({ title: '', from: '', to: '' })
    const cleared = new URLSearchParams()
    if (workspaceId) cleared.set('ws', workspaceId)
    if (projectId) cleared.set('prj', projectId)
    if (boardId) cleared.set('board', boardId)
    setParams(cleared)
  }

  function goPage(next) {
    const updated = new URLSearchParams(params)
    if (next <= 0) updated.delete('page')
    else updated.set('page', String(next))
    setParams(updated)
  }

  const selectClass = 'field field-narrow'

  return (
    <section>
      <div className="page-hero">
        <div className="page-hero-main">
          <p className="page-hero-eyebrow">Search</p>
          <h1>Task search</h1>
          <p className="page-hero-desc">
            The backend searches one board at a time, so pick a workspace, project and board
            first. Every filter, sort and page change is sent to the server.
          </p>
        </div>
        {boardId && activeBoard && (
          <div className="page-hero-actions">
            <span className="badge">
              {activeBoard.name}
              {projectName ? ` · ${projectName}` : ''}
            </span>
          </div>
        )}
      </div>

      {contextError && <p className="form-error">{contextError}</p>}

      <div className="toolbar">
        <label className={selectClass}>
          <span>Workspace</span>
          <select
            value={workspaceId}
            onChange={(e) =>
              patch({ ws: e.target.value, prj: '', board: '', assignee: '' })
            }
          >
            <option value="">Select workspace…</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        <label className={selectClass}>
          <span>Project</span>
          <select
            value={projectId}
            disabled={!workspaceId}
            onChange={(e) => patch({ prj: e.target.value, board: '', assignee: '' })}
          >
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className={selectClass}>
          <span>Board</span>
          <select
            value={boardId}
            disabled={!projectId}
            onChange={(e) => patch({ board: e.target.value })}
          >
            <option value="">Select board…</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!boardId && (
        <div className="empty-block">
          <p className="empty-block-title">No board selected</p>
          <p className="empty-block-desc">
            Pick a workspace, then a project, then the board whose tasks you want to search.
          </p>
        </div>
      )}

      {boardId && (
        <div className="stack">
          <form className="panel task-form" onSubmit={handleTextSubmit}>
            <label className="field">
              <span>Title contains</span>
              <input
                value={text.title}
                onChange={(e) => setText((t) => ({ ...t, title: e.target.value }))}
                maxLength={150}
              />
            </label>
            <div className="task-card-actions">
              <label className="field field-narrow">
                <span>Due from</span>
                <input
                  type="datetime-local"
                  value={text.from}
                  onChange={(e) => setText((t) => ({ ...t, from: e.target.value }))}
                />
              </label>
              <label className="field field-narrow">
                <span>Due to</span>
                <input
                  type="datetime-local"
                  value={text.to}
                  onChange={(e) => setText((t) => ({ ...t, to: e.target.value }))}
                />
              </label>
            </div>
            <div className="task-card-actions">
              <button type="submit">{loading ? 'Searching…' : 'Search'}</button>
              <button type="button" className="btn-secondary" onClick={handleClear}>
                Clear filters
              </button>
            </div>
            <p className="muted">
              Title search is case-insensitive and matches part of the title. A due-date filter
              only returns tasks that have a due date.
            </p>
          </form>

          <div className="toolbar">
            <label className={selectClass}>
              <span>Status</span>
              <select
                value={params.get('status') || ''}
                onChange={(e) => patch({ status: e.target.value })}
              >
                <option value="">Any</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className={selectClass}>
              <span>Priority</span>
              <select
                value={params.get('priority') || ''}
                onChange={(e) => patch({ priority: e.target.value })}
              >
                <option value="">Any</option>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <label className={selectClass}>
              <span>Assignee</span>
              <select
                value={params.get('assignee') || ''}
                onChange={(e) => patch({ assignee: e.target.value })}
              >
                <option value="">Any</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} ({m.projectRole})
                  </option>
                ))}
              </select>
            </label>

            <label className={selectClass}>
              <span>Sort by</span>
              <select
                value={params.get('sort') || DEFAULT_SORT}
                onChange={(e) => patch({ sort: e.target.value })}
              >
                {SORT_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={selectClass}>
              <span>Direction</span>
              <select
                value={params.get('dir') || DEFAULT_DIR}
                onChange={(e) => patch({ dir: e.target.value })}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>

            <label className={selectClass}>
              <span>Per page</span>
              <select
                value={params.get('size') || DEFAULT_SIZE}
                onChange={(e) => patch({ size: e.target.value })}
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading && <p className="loading">Searching…</p>}
          {!loading && results.error && <p className="form-error">{results.error}</p>}

          {!loading && !results.error && page && (
            <>
              {page.content.length === 0 ? (
                <div className="empty-block">
                  <p className="empty-block-title">No matching tasks</p>
                  <p className="empty-block-desc">
                    This board has no tasks for the filters currently set on the server.
                  </p>
                </div>
              ) : (
                <div className="panel panel-flat">
                  <p className="toolbar-summary panel-pad">
                    {page.totalElements} result{page.totalElements === 1 ? '' : 's'} · page{' '}
                    {page.number + 1} of {Math.max(page.totalPages, 1)} · {page.size} per page
                  </p>
                  <ul className="row-list">
                    {page.content.map((task) => (
                      <li key={task.id}>
                        <div className="row">
                          <div className="row-main">
                            <p className="row-title">
                              <Link
                                className="task-card-link"
                                to={`/tasks/${task.id}`}
                                state={{ boardId: task.boardId, projectId }}
                              >
                                {task.title}
                              </Link>
                            </p>
                            <p className="row-desc">{task.description}</p>
                            <p className="row-meta">
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
                              <span>Board: {activeBoard ? activeBoard.name : task.boardId}</span>
                              <span>by {task.createdByName}</span>
                              <span>Updated {formatDay(task.updatedAt)}</span>
                            </p>
                          </div>
                          <div className="row-side">
                            <span className={`badge badge-small ${statusClass(task.taskStatus)}`}>
                              {task.taskStatus}
                            </span>
                            <span
                              className={`badge badge-small ${priorityClass(task.taskPriority)}`}
                            >
                              {task.taskPriority}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="task-card-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page.first || page.number === 0}
                  onClick={() => goPage(page.number - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page.last || page.number + 1 >= page.totalPages}
                  onClick={() => goPage(page.number + 1)}
                >
                  Next
                </button>
                <span className="muted">
                  Showing {page.numberOfElements} of {page.totalElements}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

// Frontend URL names map onto the exact backend parameter names.
function buildQuery(params) {
  const query = new URLSearchParams()
  const title = (params.get('title') || '').trim()
  const status = params.get('status') || ''
  const priority = params.get('priority') || ''
  const assignee = params.get('assignee') || ''
  const from = params.get('from') || ''
  const to = params.get('to') || ''

  if (title) query.set('title', title)
  if (status) query.set('status', status)
  if (priority) query.set('priority', priority)
  if (assignee) query.set('assigneeId', assignee)
  if (from) query.set('dueDateFrom', from)
  if (to) query.set('dueDateTo', to)
  query.set('page', params.get('page') || '0')
  query.set('size', params.get('size') || DEFAULT_SIZE)
  query.set('sort', `${params.get('sort') || DEFAULT_SORT},${params.get('dir') || DEFAULT_DIR}`)
  return query.toString()
}
