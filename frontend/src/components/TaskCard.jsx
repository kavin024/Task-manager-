const STATUS_CLASS = {
  Backlog: "backlog",
  Pending: "pending",
  "In Progress": "in-progress",
  Completed: "completed",
  Archived: "archived",
}

function formatDate(value) {
  if (!value) return "N/A"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString()
}

function formatMinutes(value) {
  const minutes = Number(value) || 0
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours > 0) return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
  return `${minutes}m`
}

export const TaskCard = ({ task, onDelete, onEdit, onComplete, onView }) => {
  const isCompleted = task.status === "Completed"
  const dueTime = task.due_date ? new Date(task.due_date).getTime() : NaN
  const overdueDays =
    task.due_date && !isCompleted && !Number.isNaN(dueTime) && dueTime < Date.now()
      ? Math.ceil((Date.now() - dueTime) / 86400000)
      : 0
  const isOverdue = overdueDays > 0
  const priorityClass = `badge-${(task.priority || "medium").toLowerCase()}`
  const statusClass = `badge-${STATUS_CLASS[task.status] || "pending"}`
  const subtaskTotal = task.subtask_count ?? task.subtasks?.length ?? 0
  const subtaskDone = task.subtask_completed ?? task.subtasks?.filter((s) => s.completed).length ?? 0
  const tags = Array.isArray(task.tags) ? task.tags : []

  return (
    <article className={`task-card ${isOverdue ? "overdue" : ""} ${isCompleted ? "completed" : ""}`}>
      <div className="task-header">
        <h4 className="task-title">{task.title}</h4>
        <div className="task-badges">
          <span className={`badge ${statusClass}`}>{task.status}</span>
          <span className={`badge ${priorityClass}`}>{task.priority || "Medium"}</span>
          {task.project && (
            <span className="badge project-tag" style={{ backgroundColor: task.project.color, color: "#fff" }}>
              {task.project.name}
            </span>
          )}
          {isOverdue && <span className="badge badge-danger">Overdue</span>}
        </div>
      </div>

      {task.description && <p className="task-description">{task.description}</p>}

      <div className="task-meta">
        {task.due_date && (
          <span className={`due-date ${isOverdue ? "overdue" : ""}`}>
            📅 {formatDate(task.due_date)}
            {isOverdue && ` (${overdueDays}d overdue)`}
          </span>
        )}
        {task.estimated_minutes ? (
          <span className="estimated-time">⏱ {formatMinutes(task.estimated_minutes)}</span>
        ) : null}

        {tags.length > 0 && (
          <span className="tags">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className="tag" style={{ backgroundColor: tag.color, color: "#fff" }}>
                #{tag.name}
              </span>
            ))}
            {tags.length > 3 && <span className="tag-more">+{tags.length - 3}</span>}
          </span>
        )}

        {subtaskTotal > 0 && (
          <span className="subtasks-progress">
            <span className="progress-bar">
              <span
                className="progress-fill"
                style={{ width: `${Math.round((subtaskDone / subtaskTotal) * 100)}%` }}
              />
            </span>
            <span className="progress-text">
              {subtaskDone}/{subtaskTotal} subtasks
            </span>
          </span>
        )}

        <small className="created-at">Created {formatDate(task.created_at)}</small>
      </div>

      <div className="task-actions">
        <button onClick={() => onView?.(task)} className="btn btn-ghost btn-sm">
          Details
        </button>
        <button
          onClick={() => onComplete(task.id)}
          disabled={isCompleted}
          className={`btn btn-sm ${isCompleted ? "btn-ghost" : "btn-primary"}`}
        >
          {isCompleted ? "✓ Completed" : "Complete"}
        </button>
        <button onClick={() => onEdit(task.id, task)} className="btn btn-secondary btn-sm">
          Edit
        </button>
        <button onClick={() => onDelete(task.id)} className="btn btn-danger btn-sm">
          Delete
        </button>
      </div>
    </article>
  )
}

export default TaskCard