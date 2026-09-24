import TaskCard from './TaskCard.jsx'

// A column only displays its board and tasks; creation happens once per project
// above the Kanban, so this component holds no form state.
// The backend takes a moved task's status from the destination board's name, so the
// columns named after the four statuses get their accent stripe; others stay neutral.
const COLUMN_STATUSES = new Set(['todo', 'in_progress', 'in_review', 'done'])

export default function BoardColumn({
  board,
  tasks,
  loading,
  error,
  members,
  boards,
  projectId,
  onTasksChanged,
  onMove,
  onAssign,
  canReorder,
  reordering,
  onReorder,
}) {
  const statusKey = (board.name || '').toLowerCase()
  const columnClass = COLUMN_STATUSES.has(statusKey)
    ? `kanban-col kanban-col-status-${statusKey}`
    : 'kanban-col';
  // `boards` is the project's boards already sorted by persisted position, so its
  // index is the visible order and the ends are the only disabled directions.
  const index = boards.findIndex((b) => b.id === board.id)
  const isFirst = index <= 0
  const isLast = index === boards.length - 1

  return (
    <section className={columnClass}>
      <div className="kanban-col-head">
        <h3>{board.name}</h3>
        <span className="kanban-col-count">{loading ? '—' : tasks.length}</span>
        {canReorder && (
          <div className="kanban-col-actions">
            <button
              type="button"
              className="btn-ghost btn-small"
              onClick={() => onReorder(board.id, 'left')}
              disabled={reordering || isFirst}
              aria-label={`Move ${board.name} left`}
            >
              ←
            </button>
            <button
              type="button"
              className="btn-ghost btn-small"
              onClick={() => onReorder(board.id, 'right')}
              disabled={reordering || isLast}
              aria-label={`Move ${board.name} right`}
            >
              →
            </button>
          </div>
        )}
      </div>

      <div className="kanban-col-body">
        {error && <p className="form-error">{error}</p>}
        {!error && loading && <p className="loading">Loading tasks…</p>}
        {!error && !loading && tasks.length === 0 && (
          <div className="col-empty">
            <p className="col-empty-title">Nothing here</p>
            <p className="col-empty-hint">Use Create Task above to add one here.</p>
          </div>
        )}
        {!error && !loading && tasks.length > 0 && (
          <ul className="task-list">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                boards={boards}
                members={members}
                projectId={projectId}
                onTasksChanged={onTasksChanged}
                onMove={onMove}
                onAssign={onAssign}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
