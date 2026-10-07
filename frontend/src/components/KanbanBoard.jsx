import { useMemo, useState } from "react"
import { useToast } from "../context/ToastContext"
import { API, getErrorMessage } from "../services/api"

const COLUMNS = [
  { id: "Backlog", title: "Backlog", color: "#64748b" },
  { id: "Pending", title: "Pending", color: "#3b82f6" },
  { id: "In Progress", title: "In Progress", color: "#f59e0b" },
  { id: "Completed", title: "Completed", color: "#10b981" },
]

function isOverdue(task) {
  return Boolean(task.due_date) && task.status !== "Completed" && new Date(task.due_date).getTime() < Date.now()
}

export function KanbanBoard({ tasks, projects = [], onUpdate, onView }) {
  const { success, error: showError } = useToast()
  const [draggedTask, setDraggedTask] = useState(null)
  const [draggingOver, setDraggingOver] = useState(null)
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [busyId, setBusyId] = useState(null)

  const taskList = Array.isArray(tasks) ? tasks : []

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase()
    return taskList.filter((task) => {
      const matchesSearch =
        !query ||
        (task.title || "").toLowerCase().includes(query) ||
        (task.description || "").toLowerCase().includes(query)
      const matchesProject =
        filter === "all" || (filter === "none" ? !task.project_id : task.project_id === Number(filter))
      const isBoardStatus = COLUMNS.some((column) => column.id === task.status)
      return matchesSearch && matchesProject && isBoardStatus
    })
  }, [taskList, search, filter])

  const grouped = useMemo(() => {
    const map = {}
    COLUMNS.forEach((column) => {
      map[column.id] = visibleTasks.filter((task) => task.status === column.id)
    })
    return map
  }, [visibleTasks])

  const moveTask = async (task, status) => {
    if (!task || task.status === status) return
    setBusyId(task.id)
    try {
      const updated = await API.updateTask(task.id, { status })
      onUpdate(updated.id, updated)
      success("Task moved", `"${task.title}" moved to ${status}`)
    } catch (err) {
      showError("Failed to move task", getErrorMessage(err))
    } finally {
      setBusyId(null)
      setDraggedTask(null)
    }
  }

  const handleDragStart = (event, task) => {
    setDraggedTask(task)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", String(task.id))
  }

  const handleDragOver = (event, columnId) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDraggingOver(columnId)
  }

  const handleDragLeave = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const inside =
      event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom
    if (!inside) setDraggingOver(null)
  }

  const handleDrop = (event, columnId) => {
    event.preventDefault()
    setDraggingOver(null)
    moveTask(draggedTask, columnId)
  }

  return (
    <div className="kanban-board">
      <div className="page-header">
        <div>
          <h1>Kanban</h1>
          <p className="page-subtitle">Drag tasks between columns to update their status</p>
        </div>
        <div className="header-controls">
          <div className="toolbar-search toolbar-search-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              className="input"
              placeholder="Search tasks..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search kanban tasks"
            />
          </div>
          <select
            className="input kanban-project-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter by project"
          >
            <option value="all">All Projects</option>
            <option value="none">Unassigned</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visibleTasks.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Nothing to show</p>
          <p className="empty-state-message">
            {taskList.length === 0
              ? "Create your first task to fill the board."
              : "No tasks match the current search or project filter."}
          </p>
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
        <div className="kanban-columns" role="list">
          {COLUMNS.map((column) => {
            const columnTasks = grouped[column.id] || []
            const isOver = draggingOver === column.id && draggedTask && draggedTask.status !== column.id

            return (
              <section
                key={column.id}
                className={`kanban-column ${isOver ? "drag-over" : ""}`}
                onDragOver={(event) => handleDragOver(event, column.id)}
                onDragLeave={handleDragLeave}
                onDrop={(event) => handleDrop(event, column.id)}
                aria-label={`${column.title} column, ${columnTasks.length} tasks`}
              >
                <header className="kanban-column-header" style={{ borderTopColor: column.color }}>
                  <div className="column-title-row">
                    <h3 className="column-title">{column.title}</h3>
                    <span className="column-count">{columnTasks.length}</span>
                  </div>
                </header>

                <div className="kanban-tasks">
                  {columnTasks.map((task) => (
                    <KanbanTaskCard
                      key={task.id}
                      task={task}
                      busy={busyId === task.id}
                      columns={COLUMNS}
                      onDragStart={handleDragStart}
                      onDragEnd={() => setDraggedTask(null)}
                      onView={onView}
                      onMove={(status) => moveTask(task, status)}
                    />
                  ))}
                  {columnTasks.length === 0 && <div className="kanban-empty">Drop tasks here</div>}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function KanbanTaskCard({ task, busy, columns, onDragStart, onDragEnd, onView, onMove }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const overdue = isOverdue(task)
  const projectColor = task.project?.color || "#64748b"

  return (
    <article
      className={`kanban-card ${task.status === "Completed" ? "completed" : ""} ${overdue ? "overdue" : ""} ${
        busy ? "is-busy" : ""
      }`}
      draggable={!busy}
      onDragStart={(event) => onDragStart(event, task)}
      onDragEnd={onDragEnd}
    >
      <button className="kanban-card-main" onClick={() => onView?.(task)} title="Open task details">
        <div className="card-header">
          <h4 className="card-title">{task.title}</h4>
          <span className={`badge badge-${(task.priority || "medium").toLowerCase()}`}>
            {task.priority || "Medium"}
          </span>
        </div>
        {task.description && <p className="card-description">{task.description}</p>}
        <div className="card-meta">
          {task.due_date && (
            <span className={`due-date ${overdue ? "overdue" : ""}`}>
              📅 {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
          {task.estimated_minutes ? <span className="estimated-time">⏱ {task.estimated_minutes}m</span> : null}
          {task.project && (
            <span className="project-tag" style={{ backgroundColor: projectColor, color: "#fff" }}>
              {task.project.name}
            </span>
          )}
          {task.subtask_count > 0 && (
            <span className="subtask-count">
              ☑ {task.subtask_completed}/{task.subtask_count}
            </span>
          )}
        </div>
        {(task.tags?.length || 0) > 0 && (
          <div className="card-tags">
            {task.tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className="tag" style={{ backgroundColor: tag.color, color: "#fff" }}>
                #{tag.name}
              </span>
            ))}
          </div>
        )}
      </button>

      <div className="kanban-card-footer">
        <button className="btn btn-ghost btn-sm" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
          Move to ▾
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onView?.(task)}>
          Open
        </button>
        {menuOpen && (
          <div className="dropdown-menu kanban-move-menu">
            {columns
              .filter((column) => column.id !== task.status)
              .map((column) => (
                <button
                  key={column.id}
                  className="dropdown-item"
                  onClick={() => {
                    setMenuOpen(false)
                    onMove(column.id)
                  }}
                >
                  <span className="move-dot" style={{ backgroundColor: column.color }} />
                  {column.title}
                </button>
              ))}
          </div>
        )}
      </div>
    </article>
  )
}

export default KanbanBoard