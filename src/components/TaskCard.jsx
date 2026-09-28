import { Link } from 'react-router-dom'
import {
  dueClass,
  formatDay,
  initials,
  prioClass,
  priorityClass,
} from '../utils/format.js'

export default function TaskCard({ task, projectId }) {
  const isDone = task.taskStatus === 'DONE'

  return (
    <li className={`task-card ${prioClass(task.taskPriority)}${isDone ? ' task-card-done' : ''}`}>
      <Link
        className="task-card-inner"
        to={`/tasks/${task.id}`}
        state={{
          boardId: task.boardId,
          projectId,
        }}
        style={{
          display: 'block',
          color: 'inherit',
          textDecoration: 'none',
        }}
      >
        <div className="task-card-head">
          <span className="task-card-title">
            {task.title}
          </span>

          <span className={`badge badge-small ${priorityClass(task.taskPriority)}`}>
            {task.taskPriority}
          </span>
        </div>

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

          {isDone && <span>Completed</span>}
        </p>
      </Link>
    </li>
  )
}