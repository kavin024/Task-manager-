import { useEffect, useState } from "react"

const STATUSES = ["Backlog", "Pending", "In Progress", "Completed", "Archived"]
const PRIORITIES = ["Critical", "High", "Medium", "Low"]

const EMPTY = {
  title: "",
  description: "",
  status: "Pending",
  priority: "Medium",
  dueDate: "",
  projectId: "",
  estimatedMinutes: "",
}

function formFromTask(task) {
  if (!task) return EMPTY
  return {
    title: task.title || "",
    description: task.description || "",
    status: task.status || "Pending",
    priority: task.priority || "Medium",
    // Backend sends ISO 8601 (YYYY-MM-DDTHH:mm:ss) - slice off the time part.
    dueDate: task.due_date ? String(task.due_date).slice(0, 10) : "",
    projectId: task.project_id ? String(task.project_id) : "",
    estimatedMinutes: task.estimated_minutes != null ? String(task.estimated_minutes) : "",
  }
}

export const TaskForm = ({ onCreate, initialData, onSave, onCancel, projects = [] }) => {
  const isEditing = Boolean(initialData)
  const [form, setForm] = useState(() => formFromTask(initialData))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setForm(formFromTask(initialData))
    setError("")
  }, [initialData])

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) {
      setError("Task title is required")
      return
    }

    setSubmitting(true)
    setError("")
    try {
      const taskData = {
        title,
        description: form.description.trim(),
        status: form.status,
        priority: form.priority,
        due_date: form.dueDate ? `${form.dueDate}T09:00:00` : null,
        project_id: form.projectId ? Number(form.projectId) : null,
        estimated_minutes: form.estimatedMinutes === "" ? null : Number(form.estimatedMinutes),
      }
      if (isEditing) {
        await onSave?.(taskData)
      } else {
        await onCreate?.(taskData)
        setForm(EMPTY)
      }
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to save task. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    onCancel?.()
    setForm(EMPTY)
    setError("")
  }

  return (
    <div className="form-card">
      <h3>{isEditing ? "Edit Task" : "Add New Task"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            type="text"
            className={`input ${error && !form.title.trim() ? "input-error" : ""}`}
            value={form.title}
            onChange={update("title")}
            placeholder="Enter task title"
            required
          />
        </div>

        <div className="form-field" style={{ marginTop: "var(--space-4)" }}>
          <label htmlFor="task-description">Description</label>
          <textarea
            id="task-description"
            value={form.description}
            onChange={update("description")}
            placeholder="Enter task description"
            rows={3}
          />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="task-status">Status</label>
            <select id="task-status" value={form.status} onChange={update("status")}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="task-priority">Priority</label>
            <select id="task-priority" value={form.priority} onChange={update("priority")}>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="task-due">Due Date</label>
            <input id="task-due" type="date" value={form.dueDate} onChange={update("dueDate")} />
          </div>
          <div className="form-field">
            <label htmlFor="task-estimate">Estimated Minutes</label>
            <input
              id="task-estimate"
              type="number"
              min="0"
              step="5"
              value={form.estimatedMinutes}
              onChange={update("estimatedMinutes")}
              placeholder="e.g. 60"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="task-project">Project</label>
            <select id="task-project" value={form.projectId} onChange={update("projectId")}>
              <option value="">No Project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving..." : isEditing ? "Save Changes" : "Add Task"}
          </button>
          {isEditing && (
            <button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={submitting}>
              Cancel
            </button>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </div>
  )
}

export default TaskForm