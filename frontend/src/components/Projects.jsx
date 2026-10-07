import { useEffect, useMemo, useRef, useState } from "react"
import { useToast } from "../context/ToastContext"
import { ConfirmDialog } from "./ConfirmDialog"

const PROJECT_COLORS = [
  "#00d4ff",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#f97316",
  "#06b6d4",
  "#8b5cf6",
  "#64748b",
]

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "empty", label: "No Tasks" },
]

function toCount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDate(value) {
  if (!value) return "Unknown"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function emptyForm() {
  return { name: "", description: "", color: PROJECT_COLORS[0] }
}

/**
 * Workspace > Projects
 *
 * Pure presentation: every mutation is delegated to App.jsx, which owns the
 * shared task/project state and calls the existing /api/projects endpoints.
 */
export function Projects({ projects, tasks, loading, error, onCreate, onUpdate, onDelete, onOpenTask }) {
  const { success, error: showError } = useToast()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [detailId, setDetailId] = useState(null)

  const nameRef = useRef(null)

  useEffect(() => {
    if (form) {
      setFormError("")
      window.requestAnimationFrame(() => nameRef.current?.focus())
    }
  }, [form])

  // Close an open detail view when the project disappears (deleted elsewhere)
  useEffect(() => {
    if (detailId && !projects.some((p) => p.id === detailId)) setDetailId(null)
  }, [projects, detailId])

  const projectList = Array.isArray(projects) ? projects : []
  const taskList = Array.isArray(tasks) ? tasks : []

  const stats = useMemo(() => {
    const totals = projectList.reduce(
      (acc, project) => {
        const taskCount = toCount(project.task_count)
        const completed = toCount(project.completed_count)
        acc.total += 1
        acc.tasks += taskCount
        acc.completed += completed
        if (taskCount > 0 && completed < taskCount) acc.active += 1
        return acc
      },
      { total: 0, active: 0, tasks: 0, completed: 0 }
    )
    return [
      { label: "Total Projects", value: totals.total, tone: "primary" },
      { label: "Active Projects", value: totals.active, tone: "warning" },
      { label: "Total Tasks", value: totals.tasks, tone: "success" },
      { label: "Completed Tasks", value: totals.completed, tone: "purple" },
    ]
  }, [projectList])

  const countsByFilter = useMemo(() => {
    const counts = { all: projectList.length, active: 0, completed: 0, empty: 0 }
    projectList.forEach((project) => {
      const taskCount = toCount(project.task_count)
      const completed = toCount(project.completed_count)
      if (taskCount === 0) counts.empty += 1
      else if (completed >= taskCount) counts.completed += 1
      else counts.active += 1
    })
    return counts
  }, [projectList])

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase()
    return projectList.filter((project) => {
      const matchesSearch =
        !query ||
        (project.name || "").toLowerCase().includes(query) ||
        (project.description || "").toLowerCase().includes(query)

      let matchesFilter = true
      const taskCount = toCount(project.task_count)
      const completed = toCount(project.completed_count)
      if (filter === "active") matchesFilter = taskCount > 0 && completed < taskCount
      else if (filter === "completed") matchesFilter = taskCount > 0 && completed >= taskCount
      else if (filter === "empty") matchesFilter = taskCount === 0

      return matchesSearch && matchesFilter
    })
  }, [projectList, search, filter])

  const detailProject = detailId ? projectList.find((p) => p.id === detailId) || null : null
  const detailTasks = useMemo(
    () => (detailProject ? taskList.filter((task) => task.project_id === detailProject.id) : []),
    [detailProject, taskList]
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form) return
    const name = form.name.trim()
    if (!name) {
      setFormError("Project name is required")
      nameRef.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        name,
        description: form.description.trim(),
        color: form.color || PROJECT_COLORS[0],
      }
      if (form.id) {
        await onUpdate(form.id, payload)
        success("Project updated", `"${name}" has been saved`)
      } else {
        await onCreate(payload)
        success("Project created", `"${name}" is ready for tasks`)
      }
      setForm(null)
    } catch (err) {
      setFormError(err?.response?.data?.error || "Unable to save project. Please try again.")
      showError("Project not saved", err?.message || "Unknown error")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    const name = pendingDelete.name
    try {
      await onDelete(pendingDelete.id)
      success("Project deleted", `"${name}" was removed - its tasks are now unassigned`)
    } catch (err) {
      showError("Unable to delete project", err?.message || "Unknown error")
    } finally {
      setPendingDelete(null)
    }
  }

  const renderSkeleton = () => (
    <div className="projects-skeleton">
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="page-subtitle">Organize your tasks into focused workspaces</p>
        </div>
      </div>
      <div className="stats-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-card" style={{ height: 92 }} />
        ))}
      </div>
      <div className="projects-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-card" style={{ height: 220 }} />
        ))}
      </div>
    </div>
  )

  if (loading) return renderSkeleton()

  return (
    <div className="projects-page">
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="page-subtitle">Organize your tasks into focused workspaces</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm(emptyForm())}>
          <span aria-hidden="true">+</span> New Project
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="stats-grid stats-grid-compact">
        {stats.map((stat) => (
          <div key={stat.label} className={`stat-card stat-card-${stat.tone}`}>
            <div className="stat-content">
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="input"
            placeholder="Search projects..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search projects"
          />
        </div>
        <div className="segmented" role="group" aria-label="Filter projects">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              className={`segmented-item ${filter === option.id ? "active" : ""}`}
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
            >
              {option.label}
              <span className="segmented-count">{countsByFilter[option.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {projectList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </div>
          <p className="empty-state-title">No projects yet</p>
          <p className="empty-state-message">Create your first project to group related tasks together.</p>
          <button className="btn btn-primary" onClick={() => setForm(emptyForm())}>
            + New Project
          </button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No projects match your filters</p>
          <p className="empty-state-message">Try a different search term or switch back to the All filter.</p>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSearch("")
              setFilter("all")
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => setDetailId(project.id)}
              onEdit={() => setForm({ id: project.id, name: project.name, description: project.description || "", color: project.color || PROJECT_COLORS[0] })}
              onDelete={() => setPendingDelete(project)}
            />
          ))}
        </div>
      )}

      {form && (
        <ProjectModal
          form={form}
          error={formError}
          submitting={submitting}
          nameRef={nameRef}
          onChange={setForm}
          onSubmit={handleSubmit}
          onClose={() => setForm(null)}
        />
      )}

      {detailProject && (
        <ProjectDetail
          project={detailProject}
          tasks={detailTasks}
          onClose={() => setDetailId(null)}
          onEdit={() =>
            setForm({
              id: detailProject.id,
              name: detailProject.name,
              description: detailProject.description || "",
              color: detailProject.color || PROJECT_COLORS[0],
            })
          }
          onOpenTask={onOpenTask}
        />
      )}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Delete "${pendingDelete?.name ?? ""}"?`}
        message="Tasks assigned to this project will not be deleted. They will become unassigned."
        confirmLabel="Delete Project"
        busy={submitting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

function ProjectCard({ project, onOpen, onEdit, onDelete }) {
  const taskCount = toCount(project.task_count)
  const completed = toCount(project.completed_count)
  const remaining = Math.max(taskCount - completed, 0)
  const overdue = toCount(project.overdue_count)
  const progress = Math.min(Math.max(toCount(project.progress), 0), 100)
  const color = project.color || PROJECT_COLORS[0]

  return (
    <article className="project-card" style={{ "--project-color": color }}>
      <div className="project-card-head">
        <span className="project-color-dot" style={{ backgroundColor: color }} aria-hidden="true" />
        <h3 className="project-card-name" title={project.name}>
          {project.name}
        </h3>
        <span className={`badge ${taskCount === 0 ? "badge-neutral" : completed >= taskCount ? "badge-success" : "badge-info"}`}>
          {taskCount === 0 ? "No tasks" : completed >= taskCount ? "Completed" : "Active"}
        </span>
      </div>

      <p className="project-card-description">{project.description || "No description"}</p>

      <div className="project-card-metrics">
        <span>
          <strong>{taskCount}</strong> Tasks
        </span>
        <span>
          <strong>{completed}</strong> Completed
        </span>
        {overdue > 0 && <span className="project-metric-overdue">{overdue} Overdue</span>}
      </div>

      <div className="project-progress">
        <div className="progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${progress}%`, backgroundColor: color }} />
        </div>
        <span className="project-progress-value">{progress}%</span>
      </div>

      <div className="project-card-foot">
        <span className="project-created">Created {formatDate(project.created_at)}</span>
        <div className="project-card-actions">
          <button className="btn btn-ghost btn-sm" onClick={onOpen}>
            Open
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onEdit}>
            Edit
          </button>
          <button className="btn btn-danger btn-sm" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {remaining > 0 && <span className="sr-only">{remaining} tasks remaining</span>}
    </article>
  )
}

function ProjectModal({ form, error, submitting, nameRef, onChange, onSubmit, onClose }) {
  const isEditing = !!form.id

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
      >
        <div className="modal-header">
          <h3 className="modal-title" id="project-modal-title">
            {isEditing ? "Edit Project" : "New Project"}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="modal-body">
            <div className="form-field">
              <label htmlFor="project-name">Project Name *</label>
              <input
                id="project-name"
                ref={nameRef}
                type="text"
                className={`input ${error ? "input-error" : ""}`}
                value={form.name}
                maxLength={255}
                onChange={(event) => onChange({ ...form, name: event.target.value })}
                placeholder="e.g. AI Resume Matcher"
                required
              />
            </div>

            <div className="form-field" style={{ marginTop: "var(--space-4)" }}>
              <label htmlFor="project-description">Description</label>
              <textarea
                id="project-description"
                value={form.description}
                maxLength={2000}
                onChange={(event) => onChange({ ...form, description: event.target.value })}
                placeholder="What is this project about?"
                rows={3}
              />
            </div>

            <fieldset className="color-picker">
              <legend>Color</legend>
              <div className="color-swatches">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${form.color === color ? "active" : ""}`}
                    style={{ backgroundColor: color }}
                    onClick={() => onChange({ ...form, color })}
                    aria-label={`Use color ${color}`}
                    aria-pressed={form.color === color}
                  />
                ))}
                <label className="color-custom" title="Custom color">
                  <input
                    type="color"
                    value={form.color || PROJECT_COLORS[0]}
                    onChange={(event) => onChange({ ...form, color: event.target.value })}
                    aria-label="Pick a custom color"
                  />
                  <span aria-hidden="true">🎨</span>
                </label>
              </div>
            </fieldset>

            {error && <p className="form-error" role="alert">{error}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Saving..." : isEditing ? "Save Changes" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProjectDetail({ project, tasks, onClose, onEdit, onOpenTask }) {
  const color = project.color || PROJECT_COLORS[0]
  const taskCount = toCount(project.task_count)
  const completed = toCount(project.completed_count)
  const progress = Math.min(Math.max(toCount(project.progress), 0), 100)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-detail-title"
      >
        <div className="modal-header">
          <div className="modal-title-row">
            <span className="project-color-dot" style={{ backgroundColor: color }} aria-hidden="true" />
            <h3 className="modal-title" id="project-detail-title">
              {project.name}
            </h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <p className="project-detail-description">{project.description || "No description"}</p>

          <div className="project-detail-stats">
            <div>
              <span className="project-detail-stat-value">{taskCount}</span>
              <span className="project-detail-stat-label">Tasks</span>
            </div>
            <div>
              <span className="project-detail-stat-value">{completed}</span>
              <span className="project-detail-stat-label">Completed</span>
            </div>
            <div>
              <span className="project-detail-stat-value">{Math.max(taskCount - completed, 0)}</span>
              <span className="project-detail-stat-label">Remaining</span>
            </div>
            <div>
              <span className="project-detail-stat-value">{toCount(project.overdue_count)}</span>
              <span className="project-detail-stat-label">Overdue</span>
            </div>
          </div>

          <div className="project-progress" style={{ marginBottom: "var(--space-5)" }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%`, backgroundColor: color }} />
            </div>
            <span className="project-progress-value">{progress}%</span>
          </div>

          <h4 className="detail-section-title">Tasks in this project</h4>
          {tasks.length === 0 ? (
            <div className="empty-state" style={{ padding: "var(--space-6)" }}>
              <p className="empty-state-message">
                No tasks are assigned to this project yet. Assign one from the task editor or the task drawer.
              </p>
            </div>
          ) : (
            <ul className="project-task-list">
              {tasks.map((task) => {
                const isDone = task.status === "Completed"
                const isOverdue =
                  task.due_date && !isDone && new Date(task.due_date).getTime() < Date.now()
                return (
                  <li key={task.id}>
                    <button className="project-task" onClick={() => onOpenTask?.(task)}>
                      <span className={`project-task-status ${isDone ? "done" : ""}`} aria-hidden="true">
                        {isDone ? "✓" : "•"}
                      </span>
                      <span className={`project-task-title ${isDone ? "done" : ""}`}>{task.title}</span>
                      <span className={`badge badge-${(task.priority || "medium").toLowerCase()}`}>
                        {task.priority || "Medium"}
                      </span>
                      <span className={`badge badge-${(task.status || "pending").toLowerCase().replace(/\s+/g, "-")}`}>
                        {task.status || "Pending"}
                      </span>
                      {isOverdue && <span className="badge badge-danger">Overdue</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <p className="project-detail-meta">Created {formatDate(project.created_at)}</p>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={onEdit}>
            Edit Project
          </button>
        </div>
      </div>
    </div>
  )
}

export default Projects