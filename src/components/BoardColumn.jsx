import TaskCard from './TaskCard.jsx'

const COLUMN_STATUSES = new Set([
  'todo',
  'in_progress',
  'in_review',
  'done',
])

export default function BoardColumn({
  board,
  tasks,
  loading,
  error,
  projectId,
}) {
  const statusKey = (board.name || '').toLowerCase()

  const columnClass = COLUMN_STATUSES.has(statusKey)
    ? `kanban-col kanban-col-status-${statusKey}`
    : 'kanban-col'

  return (
    <section className={columnClass}>
      <div className="kanban-col-head">
        <h3>{board.name}</h3>
        <span className="kanban-col-count">
          {loading ? '—' : tasks.length}
        </span>
      </div>

      <div className="kanban-col-body">
        {error && (
          <p className="form-error">
            {error}
          </p>
        )}

        {!error && loading && (
          <p className="loading">
            Loading tasks…
          </p>
        )}

        {!error && !loading && tasks.length === 0 && (
          <div className="col-empty">
            <p className="col-empty-title">
              Nothing here
            </p>

            <p className="col-empty-hint">
              {statusKey === 'todo'
                ? 'Create a task above to add it to TODO.'
                : 'Move tasks here from another workflow stage.'}
            </p>
          </div>
        )}

        {!error && !loading && tasks.length > 0 && (
          <ul className="task-list">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                projectId={projectId}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}