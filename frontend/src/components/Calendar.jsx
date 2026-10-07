import { useCallback, useEffect, useMemo, useState } from "react"
import { useToast } from "../context/ToastContext"
import { API, getErrorMessage } from "../services/api"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** Local-time YYYY-MM-DD key. Never use toISOString(): it shifts by the UTC offset. */
function toDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatLongDate(date) {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
}

function buildMonthGrid(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const gridStart = addDays(first, -first.getDay())
  const weeks = []
  for (let week = 0; week < 6; week += 1) {
    const days = []
    for (let day = 0; day < 7; day += 1) {
      days.push(addDays(gridStart, week * 7 + day))
    }
    weeks.push(days)
  }
  // Drop trailing weeks that only repeat the previous month
  while (weeks.length > 4 && weeks[weeks.length - 1].every((date) => date.getMonth() !== anchor.getMonth())) {
    weeks.pop()
  }
  return weeks
}

function buildWeekGrid(anchor) {
  const start = addDays(startOfDay(anchor), -anchor.getDay())
  return [Array.from({ length: 7 }, (_, index) => addDays(start, index))]
}

const STATUS_DOT = {
  Backlog: "var(--status-backlog)",
  Pending: "var(--status-pending)",
  "In Progress": "var(--status-in-progress)",
  Completed: "var(--status-completed)",
  Archived: "var(--status-archived)",
}

export function Calendar({ tasks, projects = [], onView, onCreate }) {
  const { success, error: showError } = useToast()
  const today = useMemo(() => startOfDay(new Date()), [])
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [view, setView] = useState("month")
  const [selectedKey, setSelectedKey] = useState(() => toDateKey(startOfDay(new Date())))
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: "", description: "", priority: "Medium", projectId: "" })
  const [formError, setFormError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const taskList = Array.isArray(tasks) ? tasks : []

  const tasksByDate = useMemo(() => {
    const map = {}
    taskList.forEach((task) => {
      if (!task.due_date) return
      const date = new Date(task.due_date)
      if (Number.isNaN(date.getTime())) return
      const key = toDateKey(date)
      if (!map[key]) map[key] = []
      map[key].push(task)
    })
    Object.values(map).forEach((list) =>
      list.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    )
    return map
  }, [taskList])

  const weeks = useMemo(
    () => (view === "week" ? buildWeekGrid(anchor) : buildMonthGrid(anchor)),
    [anchor, view]
  )

  const selectedDate = useMemo(() => fromDateKey(selectedKey), [selectedKey])
  const selectedTasks = useMemo(() => tasksByDate[selectedKey] || [], [tasksByDate, selectedKey])

  const scheduledCount = useMemo(
    () => taskList.filter((task) => task.due_date).length,
    [taskList]
  )
  const overdueCount = useMemo(
    () =>
      taskList.filter(
        (task) => task.due_date && task.status !== "Completed" && new Date(task.due_date).getTime() < Date.now()
      ).length,
    [taskList]
  )
  const unscheduledCount = taskList.length - scheduledCount

  const shiftPeriod = useCallback(
    (direction) => {
      setAnchor((current) =>
        view === "week"
          ? addDays(current, direction * 7)
          : new Date(current.getFullYear(), current.getMonth() + direction, 1)
      )
    },
    [view]
  )

  const goToday = useCallback(() => {
    const now = startOfDay(new Date())
    setAnchor(now)
    setSelectedKey(toDateKey(now))
  }, [])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === "ArrowLeft") shiftPeriod(-1)
      if (event.key === "ArrowRight") shiftPeriod(1)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [shiftPeriod])

  const openForm = (key) => {
    setSelectedKey(key)
    setForm({ title: "", description: "", priority: "Medium", projectId: "" })
    setFormError("")
    setShowForm(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) {
      setFormError("Title is required")
      return
    }

    setSubmitting(true)
    try {
      const created = await API.createTask({
        title,
        description: form.description.trim(),
        status: "Pending",
        priority: form.priority,
        due_date: `${selectedKey}T09:00:00`,
        project_id: form.projectId ? Number(form.projectId) : null,
      })
      onCreate?.(created)
      success("Event created", `"${title}" scheduled for ${formatLongDate(selectedDate)}`)
      setShowForm(false)
    } catch (err) {
      const message = getErrorMessage(err, "Unable to create event")
      setFormError(message)
      showError("Failed to create event", message)
    } finally {
      setSubmitting(false)
    }
  }

  const periodTitle =
    view === "week"
      ? `${MONTHS[anchor.getMonth()]} ${anchor.getDate()}, ${anchor.getFullYear()}`
      : `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`

  return (
    <div className="calendar-page">
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p className="page-subtitle">Plan deadlines and see how your month is shaping up</p>
        </div>
        <button className="btn btn-primary" onClick={() => openForm(selectedKey)}>
          + Add Event
        </button>
      </div>

      <div className="calendar-stats">
        <span className="calendar-stat">
          <strong>{scheduledCount}</strong> scheduled
        </span>
        <span className={`calendar-stat ${overdueCount > 0 ? "is-danger" : ""}`}>
          <strong>{overdueCount}</strong> overdue
        </span>
        <span className="calendar-stat">
          <strong>{unscheduledCount}</strong> without a date
        </span>
      </div>

      <div className="calendar card">
        <div className="calendar-header">
          <div className="calendar-title">
            <button className="btn btn-ghost btn-icon" onClick={() => shiftPeriod(-1)} aria-label="Previous period">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2>{periodTitle}</h2>
            <button className="btn btn-ghost btn-icon" onClick={() => shiftPeriod(1)} aria-label="Next period">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={goToday}>
              Today
            </button>
          </div>

          <div className="calendar-controls">
            <select
              className="input calendar-month-select"
              value={anchor.getMonth()}
              onChange={(event) =>
                setAnchor(new Date(anchor.getFullYear(), Number(event.target.value), 1))
              }
              aria-label="Select month"
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index}>
                  {month}
                </option>
              ))}
            </select>
            <select
              className="input calendar-year-select"
              value={anchor.getFullYear()}
              onChange={(event) => setAnchor(new Date(Number(event.target.value), anchor.getMonth(), 1))}
              aria-label="Select year"
            >
              {Array.from({ length: 7 }, (_, index) => anchor.getFullYear() - 3 + index).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <div className="segmented" role="group" aria-label="Calendar view">
              <button
                className={`segmented-item ${view === "month" ? "active" : ""}`}
                onClick={() => setView("month")}
                aria-pressed={view === "month"}
              >
                Month
              </button>
              <button
                className={`segmented-item ${view === "week" ? "active" : ""}`}
                onClick={() => setView("week")}
                aria-pressed={view === "week"}
              >
                Week
              </button>
            </div>
          </div>
        </div>

        <div className={`calendar-grid ${view === "week" ? "is-week" : ""}`}>
          <div className="calendar-weekdays">
            {WEEKDAYS.map((day) => (
              <div key={day} className="weekday-header">
                {day}
              </div>
            ))}
          </div>

          <div className="calendar-weeks">
            {weeks.map((week, weekIndex) => (
              <div className="calendar-week" key={`week-${weekIndex}`}>
                {week.map((date) => {
                  const key = toDateKey(date)
                  const dayTasks = tasksByDate[key] || []
                  const isToday = sameDay(date, today)
                  const isSelected = key === selectedKey
                  const isOutside = date.getMonth() !== anchor.getMonth()

                  return (
                    <div
                      key={key}
                      className={`calendar-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${
                        isOutside ? "other-month" : ""
                      } ${dayTasks.length > 0 ? "has-events" : ""}`}
                      onClick={() => setSelectedKey(key)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          setSelectedKey(key)
                        }
                      }}
                      aria-label={`${formatLongDate(date)}, ${dayTasks.length} task${dayTasks.length === 1 ? "" : "s"}`}
                    >
                      <div className="calendar-day-head">
                        <span className="day-number">{date.getDate()}</span>
                        {dayTasks.length > 0 && <span className="day-count">{dayTasks.length}</span>}
                      </div>

                      <div className="calendar-day-body">
                        {dayTasks.slice(0, 3).map((task) => (
                          <button
                            key={task.id}
                            className={`calendar-event ${task.status === "Completed" ? "is-done" : ""}`}
                            style={{
                              borderLeftColor: task.project?.color || STATUS_DOT[task.status] || "var(--accent-primary)",
                            }}
                            onClick={(event) => {
                              event.stopPropagation()
                              onView?.(task)
                            }}
                            title={task.title}
                          >
                            <span className="event-time">
                              {new Date(task.due_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="event-title">{task.title}</span>
                          </button>
                        ))}
                        {dayTasks.length > 3 && <span className="calendar-more">+{dayTasks.length - 3} more</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card calendar-day-panel">
        <div className="panel-header">
          <h3>{formatLongDate(selectedDate)}</h3>
          <button className="btn btn-primary btn-sm" onClick={() => openForm(selectedKey)}>
            + Add Event
          </button>
        </div>

        {selectedTasks.length === 0 ? (
          <div className="empty-state" style={{ padding: "var(--space-6)" }}>
            <p className="empty-state-title">Nothing scheduled</p>
            <p className="empty-state-message">No tasks are due on this day.</p>
            <button className="btn btn-secondary btn-sm" onClick={() => openForm(selectedKey)}>
              Schedule a task
            </button>
          </div>
        ) : (
          <ul className="calendar-task-list">
            {selectedTasks.map((task) => (
              <li key={task.id}>
                <button className="calendar-task-row" onClick={() => onView?.(task)}>
                  <span className="calendar-task-dot" style={{ backgroundColor: STATUS_DOT[task.status] }} />
                  <span className="calendar-task-main">
                    <span className="calendar-task-title">{task.title}</span>
                    {task.description && <span className="calendar-task-desc">{task.description}</span>}
                  </span>
                  {task.project && (
                    <span className="project-tag" style={{ backgroundColor: task.project.color, color: "#fff" }}>
                      {task.project.name}
                    </span>
                  )}
                  <span className={`badge badge-${(task.priority || "medium").toLowerCase()}`}>
                    {task.priority || "Medium"}
                  </span>
                  <span className={`badge badge-${(task.status || "pending").toLowerCase().replace(/\s+/g, "-")}`}>
                    {task.status || "Pending"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)} role="presentation">
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-title"
          >
            <div className="modal-header">
              <h3 className="modal-title" id="calendar-event-title">
                New Event
              </h3>
              <button className="modal-close" onClick={() => setShowForm(false)} aria-label="Close dialog">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <p className="modal-hint">{formatLongDate(selectedDate)}</p>

                <div className="form-field">
                  <label htmlFor="event-title">Title *</label>
                  <input
                    id="event-title"
                    type="text"
                    className={`input ${formError ? "input-error" : ""}`}
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    placeholder="What needs to happen?"
                    required
                    autoFocus
                  />
                </div>

                <div className="form-field" style={{ marginTop: "var(--space-4)" }}>
                  <label htmlFor="event-description">Description</label>
                  <textarea
                    id="event-description"
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    rows={2}
                    placeholder="Optional details"
                  />
                </div>

                <div className="form-row" style={{ marginTop: "var(--space-4)", marginBottom: 0 }}>
                  <div className="form-field">
                    <label htmlFor="event-priority">Priority</label>
                    <select
                      id="event-priority"
                      value={form.priority}
                      onChange={(event) => setForm({ ...form, priority: event.target.value })}
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="event-project">Project</label>
                    <select
                      id="event-project"
                      value={form.projectId}
                      onChange={(event) => setForm({ ...form, projectId: event.target.value })}
                    >
                      <option value="">No Project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {formError && <p className="form-error" role="alert">{formError}</p>}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Create Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Calendar