import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useToast } from "../context/ToastContext"
import { API, getErrorMessage } from "../services/api"
import { ConfirmDialog } from "./ConfirmDialog"

const DEFAULT_DURATION_MINUTES = 25
const DURATION_PRESETS = [15, 25, 50, 90]

function formatClock(totalSeconds) {
  const safe = Math.max(Math.round(totalSeconds), 0)
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function formatMinutes(minutes) {
  const value = Number(minutes) || 0
  const hours = Math.floor(value / 60)
  const rest = Math.round(value % 60)
  if (hours > 0) return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
  return `${Math.round(value)}m`
}

function toDateTime(value) {
  if (!value) return "N/A"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString()
}

export function FocusMode({ tasks }) {
  const { success, error: showError } = useToast()
  const taskList = Array.isArray(tasks) ? tasks : []

  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION_MINUTES)
  const [timeLeft, setTimeLeft] = useState(DEFAULT_DURATION_MINUTES * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState("")
  const [sessions, setSessions] = useState([])
  const [stats, setStats] = useState({ total_minutes: 0, today_minutes: 0, week_minutes: 0, session_count: 0, by_task: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  const durationSeconds = durationMinutes * 60
  // Guards the "complete exactly once" path even if effects re-run.
  const completionRef = useRef(false)

  const loadSessions = useCallback(async () => {
    try {
      const [sessionData, statsData] = await Promise.all([
        API.getFocusSessions({ limit: 50 }),
        API.getFocusStats(),
      ])
      setSessions(Array.isArray(sessionData) ? sessionData : [])
      setStats(statsData || { total_minutes: 0, today_minutes: 0, week_minutes: 0, session_count: 0, by_task: [] })
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load focus data."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const selectedTask = useMemo(
    () => taskList.find((task) => String(task.id) === String(selectedTaskId)) || null,
    [taskList, selectedTaskId]
  )

  const focusableTasks = useMemo(
    () => taskList.filter((task) => task.status !== "Completed" && task.status !== "Archived"),
    [taskList]
  )

  /**
   * Persist exactly one session for a finished timer.
   * A single POST with completed:true - no follow-up PUT, so a retry or a
   * React 18 double-invoked effect can never create two records.
   */
  const completeSession = useCallback(async () => {
    if (completionRef.current) return
    completionRef.current = true
    setSaving(true)
    const minutes = durationMinutes
    try {
      const created = await API.createFocusSession({
        task_id: selectedTaskId ? Number(selectedTaskId) : null,
        duration_minutes: minutes,
        completed: true,
      })
      setSessions((prev) => (prev.some((session) => session.id === created.id) ? prev : [created, ...prev]))
      success(
        "Focus session complete",
        `${minutes} min${selectedTask ? ` on "${selectedTask.title}"` : ""}`
      )
      loadSessions()
    } catch (err) {
      completionRef.current = false
      showError("Failed to save session", getErrorMessage(err))
    } finally {
      setSaving(false)
      setIsRunning(false)
      setTimeLeft(durationSeconds)
    }
  }, [durationMinutes, durationSeconds, loadSessions, selectedTask, selectedTaskId, showError, success])

  // Timer: a single interval that never mutates state inside an updater.
  useEffect(() => {
    if (!isRunning) return undefined

    const interval = window.setInterval(() => {
      setTimeLeft((current) => (current > 0 ? current - 1 : 0))
    }, 1000)

    return () => window.clearInterval(interval)
  }, [isRunning])

  useEffect(() => {
    if (isRunning && timeLeft === 0) completeSession()
  }, [isRunning, timeLeft, completeSession])

  const elapsedSeconds = Math.max(durationSeconds - timeLeft, 0)
  const progress = durationSeconds > 0 ? Math.min(elapsedSeconds / durationSeconds, 1) : 0
  const circumference = 2 * Math.PI * 90

  const handleStart = () => {
    if (isRunning) return
    if (timeLeft <= 0) setTimeLeft(durationSeconds)
    completionRef.current = false
    setIsRunning(true)
  }

  const handlePause = () => setIsRunning(false)

  const handleReset = () => {
    setIsRunning(false)
    completionRef.current = false
    setTimeLeft(durationSeconds)
  }

  const handleDurationChange = (minutes) => {
    setDurationMinutes(minutes)
    if (!isRunning) setTimeLeft(minutes * 60)
    completionRef.current = false
  }

  const handleDeleteSession = async () => {
    if (!pendingDelete) return
    try {
      await API.deleteFocusSession(pendingDelete.id)
      setSessions((prev) => prev.filter((session) => session.id !== pendingDelete.id))
      success("Session removed", "Focus history updated")
    } catch (err) {
      showError("Unable to delete session", getErrorMessage(err))
    } finally {
      setPendingDelete(null)
    }
  }

  const statsCards = [
    { label: "Focused today", value: formatMinutes(stats.today_minutes), tone: "primary" },
    { label: "This week", value: formatMinutes(stats.week_minutes), tone: "success" },
    { label: "All time", value: formatMinutes(stats.total_minutes), tone: "purple" },
    { label: "Sessions", value: stats.session_count ?? 0, tone: "warning" },
  ]

  return (
    <div className="focus-page">
      <div className="page-header">
        <div>
          <h1>Focus Mode</h1>
          <p className="page-subtitle">Deep work sessions with a Pomodoro timer</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={loadSessions}>
            Retry
          </button>
        </div>
      )}

      <div className="focus-layout">
        <div className="card focus-timer-card">
          <div className="timer-display">
            <div className="progress-ring">
              <svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label={`${formatClock(timeLeft)} remaining`}>
                <circle cx="100" cy="100" r="90" fill="none" stroke="var(--surface-border)" strokeWidth="8" />
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  transform="rotate(-90 100 100)"
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              </svg>
              <div className="timer-overlay">
                <span className="timer-time">{formatClock(timeLeft)}</span>
                <span className="timer-status">{isRunning ? "Focusing" : timeLeft === 0 ? "Done" : "Ready"}</span>
              </div>
            </div>
          </div>

          <div className="timer-controls">
            <button className="btn btn-primary btn-lg" onClick={handleStart} disabled={isRunning || saving}>
              ▶ {isRunning ? "Running" : "Start"}
            </button>
            <button className="btn btn-secondary btn-lg" onClick={handlePause} disabled={!isRunning}>
              ⏸ Pause
            </button>
            <button className="btn btn-ghost btn-lg" onClick={handleReset} disabled={saving}>
              ↻ Reset
            </button>
          </div>

          <div className="duration-selector">
            <span className="duration-label">Session Duration</span>
            <div className="duration-buttons" role="group" aria-label="Session duration">
              {DURATION_PRESETS.map((minutes) => (
                <button
                  key={minutes}
                  className={`btn btn-sm ${durationMinutes === minutes ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => handleDurationChange(minutes)}
                  aria-pressed={durationMinutes === minutes}
                >
                  {minutes} min
                </button>
              ))}
            </div>
          </div>

          <div className="focus-task-selector">
            <label htmlFor="focus-task">Focus Task</label>
            <select
              id="focus-task"
              className="input"
              value={selectedTaskId}
              onChange={(event) => setSelectedTaskId(event.target.value)}
            >
              <option value="">No specific task (general focus)</option>
              {focusableTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
            {selectedTask && (
              <div className="selected-task-info">
                <span className={`badge badge-${(selectedTask.priority || "medium").toLowerCase()}`}>
                  {selectedTask.priority || "Medium"}
                </span>
                {selectedTask.due_date && (
                  <span className="due-date">Due {new Date(selectedTask.due_date).toLocaleDateString()}</span>
                )}
                {selectedTask.project && (
                  <span className="project-tag" style={{ backgroundColor: selectedTask.project.color, color: "#fff" }}>
                    {selectedTask.project.name}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="focus-sidebar">
          <div className="card focus-panel">
            <h3>Today's Focus</h3>
            {loading ? (
              <div className="skeleton skeleton-title" style={{ marginBottom: "var(--space-4)" }} />
            ) : (
              <>
                <div className="focus-stat-big">{formatMinutes(stats.today_minutes)}</div>
                <div className="focus-stat-grid">
                  {statsCards.map((card) => (
                    <div key={card.label} className="focus-stat">
                      <span className="focus-stat-value">{card.value}</span>
                      <span className="focus-stat-label">{card.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card focus-panel">
            <h3>Recent Sessions</h3>
            {loading ? (
              <>
                <div className="skeleton skeleton-text" />
                <div className="skeleton skeleton-text" />
              </>
            ) : sessions.length === 0 ? (
              <p className="empty-text">No sessions yet. Finish your first timer to build history.</p>
            ) : (
              <ul className="session-list">
                {sessions.slice(0, 8).map((session) => (
                  <li key={session.id} className="session-item">
                    <div className="session-info">
                      <span className="session-task">{session.task_title || "General Focus"}</span>
                      <span className="session-time">
                        {formatMinutes(session.duration_minutes)} · {toDateTime(session.started_at)}
                      </span>
                    </div>
                    <span className={`session-status ${session.completed ? "completed" : "pending"}`}>
                      {session.completed ? "✓" : "⏳"}
                    </span>
                    <button
                      className="session-delete"
                      onClick={() => setPendingDelete(session)}
                      aria-label={`Delete session from ${toDateTime(session.started_at)}`}
                    >
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card focus-panel">
            <h3>Focus by Task</h3>
            {loading ? (
              <div className="skeleton skeleton-text" />
            ) : stats.by_task?.length > 0 ? (
              <ul className="project-focus-list">
                {stats.by_task.slice(0, 6).map((item, index) => (
                  <li key={`${item.title ?? "general"}-${index}`} className="project-focus-item">
                    <span className="project-name">{item.title || "General Focus"}</span>
                    <span className="project-minutes">{formatMinutes(item.minutes)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-text">No focus data recorded yet.</p>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title="Delete this focus session?"
        message={
          pendingDelete
            ? `${formatMinutes(pendingDelete.duration_minutes)} recorded on ${toDateTime(pendingDelete.started_at)} will be removed from your history.`
            : ""
        }
        confirmLabel="Delete Session"
        busy={saving}
        onConfirm={handleDeleteSession}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

export default FocusMode