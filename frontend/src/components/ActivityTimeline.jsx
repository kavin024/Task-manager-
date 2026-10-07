import { useState, useEffect, useMemo } from "react"
import { API } from "../services/api"

export function ActivityTimeline({ taskId, projectId, limit = 50 }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("All")

  useEffect(() => {
    fetchLogs()
  }, [taskId, projectId, limit])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = { limit }
      if (taskId) params.task_id = taskId
      if (projectId) params.project_id = projectId
      const data = await API.getActivityLogs(params)
      setLogs(data)
      setLoading(false)
    } catch (err) {
      console.error("Failed to load activity:", err)
      setLoading(false)
    }
  }

  const filteredLogs = useMemo(() => {
    if (filter === "All") return logs
    return logs.filter(log => log.action === filter)
  }, [logs, filter])

  const actionTypes = useMemo(() => {
    const types = new Set(logs.map(log => log.action))
    return Array.from(types).sort()
  }, [logs])

  if (loading) {
    return (
      <div className="activity-timeline">
        <div className="skeleton skeleton-text" />
        <div className="skeleton skeleton-text" />
        <div className="skeleton skeleton-text" />
      </div>
    )
  }

  const getActionIcon = (action) => {
    const icons = {
      "created": "➕",
      "updated": "✏️",
      "completed": "✅",
      "deleted": "🗑️",
      "moved": "↔️",
      "tag_added": "🏷️",
      "tag_removed": "🏷️",
      "subtask_added": "📋",
      "subtask_completed": "☑️",
      "comment_added": "💬",
      "assigned": "👤",
    }
    return icons[action] || "📝"
  }

  if (filteredLogs.length === 0) {
    return (
      <div className="activity-timeline">
        <div className="empty-state" style={{ padding: "var(--space-6)" }}>
          <p className="empty-state-message">No activity recorded yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="activity-timeline">
      <div className="panel-header panel-header-compact">
        <h4>Activity Timeline</h4>
        <select
          className="input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: "150px" }}
          aria-label="Filter activity by action"
        >
          <option value="All">All Actions</option>
          {actionTypes.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      </div>

      <div className="timeline">
        {filteredLogs.map((log) => (
          <div key={log.id} className="timeline-item">
            <span className="timeline-marker" style={{ backgroundColor: getActionColor(log.action) }} />
            <div className="timeline-content">
              <div className="timeline-meta">
                <span className="action-badge">
                  <span aria-hidden="true">{getActionIcon(log.action)}</span>{" "}
                  {log.action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
                <span className="timeline-time">{new Date(log.created_at).toLocaleString()}</span>
              </div>
              <p className="timeline-description">{log.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const ACTION_COLORS = {
  created: "var(--success)",
  updated: "var(--accent-primary)",
  completed: "var(--success)",
  deleted: "var(--danger)",
  moved: "var(--warning)",
  tag_added: "var(--purple, #a855f7)",
  tag_removed: "var(--danger)",
  subtask_added: "var(--accent-primary)",
  subtask_completed: "var(--success)",
  comment_added: "var(--cyan, #06b6d4)",
  assigned: "var(--orange, #f97316)",
}

function getActionColor(action) {
  return ACTION_COLORS[action] || "var(--text-secondary)"
}

export default ActivityTimeline