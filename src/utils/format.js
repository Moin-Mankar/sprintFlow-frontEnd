/* Display-only helpers: they reshape text the backend already sent and never
   change what is fetched, sent or navigated to. */

// "Implement OAuth" -> "Sep 28" when the year matches, otherwise includes it.
export function formatDay(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return `${formatDay(value)}, ${d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

// Initials from a real name so a person gets a stable identity mark.
export function initials(value) {
  if (!value) return '—'
  const words = String(value).trim().split(/[\s@._-]+/).filter(Boolean)
  if (words.length === 0) return '—'
  const first = words[0][0] ?? ''
  const second = words.length > 1 ? words[words.length - 1][0] : words[0][1] ?? ''
  return (first + second).toUpperCase()
}

// Enum values come straight from TaskStatus / TaskPriority on the wire.
export function statusClass(value) {
  return value ? `badge-status-${String(value).toLowerCase()}` : ''
}

export function priorityClass(value) {
  return value ? `badge-priority-${String(value).toLowerCase()}` : ''
}

// Rail colour on a Kanban card. Kept separate from the badge classes so a card
// container never inherits pill padding, background or text colour.
export function prioClass(value) {
  return value ? `prio-${String(value).toLowerCase()}` : ''
}

// Shading only, from the values already on the task: the backend treats a due date
// before now on a task that is not DONE as overdue. Nothing here changes what is sent.
export function dueClass(value, status) {
  if (!value || status === 'DONE') return ''
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return ''
  const now = Date.now()
  if (time < now) return 'due-overdue'
  if (time - now < 7 * 24 * 60 * 60 * 1000) return 'due-soon'
  return ''
}

// Backend LocalDateTime looks like "2026-10-01T09:30:00";
// <input type="datetime-local"> needs "2026-10-01T09:30".
export function toDateTimeLocal(value) {
  if (!value) return ''
  const s = String(value).replace(' ', 'T')
  return s.length >= 16 ? s.slice(0, 16) : s
}

export function fromDateTimeLocal(value) {
  if (!value) return null
  return value.length === 16 ? `${value}:00` : value
}

