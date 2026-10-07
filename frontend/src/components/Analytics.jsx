import { useCallback, useEffect, useMemo, useState } from "react"
import { API } from "../services/api"
import { BarChart, DonutChart, LineChart, StackedMatrix, StatCard, CHART_COLORS } from "./Charts"

const TIME_RANGES = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "1y", label: "1 year" },
]

const PRIORITIES = ["Critical", "High", "Medium", "Low"]
const STATUSES = ["Backlog", "Pending", "In Progress", "Completed", "Archived"]
const PRIORITY_COLORS = {
  Critical: CHART_COLORS.danger,
  High: CHART_COLORS.orange,
  Medium: CHART_COLORS.warning,
  Low: CHART_COLORS.slate,
}
const STATUS_COLORS = {
  Backlog: CHART_COLORS.slate,
  Pending: "#3b82f6",
  "In Progress": CHART_COLORS.warning,
  Completed: CHART_COLORS.success,
  Archived: CHART_COLORS.purple,
}

const toNum = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const percent = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0)

const EMPTY = {
  title: "No task data yet",
  hint: "Create your first task to start seeing productivity insights.",
}

export function Analytics({ dataVersion = 0 }) {
  const [range, setRange] = useState("30d")
  const [overview, setOverview] = useState(null)
  const [productivity, setProductivity] = useState(null)
  const [projectAnalytics, setProjectAnalytics] = useState([])
  const [priorityDist, setPriorityDist] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAnalytics = useCallback(async (activeRange) => {
    setLoading(true)
    setError(null)
    try {
      const [overviewRes, productivityRes, projectRes, priorityRes] = await Promise.all([
        API.getAnalyticsOverview(activeRange),
        API.getProductivityTrends(activeRange),
        API.getProjectAnalytics(activeRange),
        API.getPriorityDistribution(activeRange),
      ])
      setOverview(overviewRes || null)
      setProductivity(productivityRes || null)
      setProjectAnalytics(Array.isArray(projectRes?.projects) ? projectRes.projects : [])
      setPriorityDist(priorityRes || null)
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to load analytics.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalytics(range)
  }, [range, dataVersion, fetchAnalytics])

  const rangeLabel = TIME_RANGES.find((option) => option.id === range)?.label ?? "30 days"

  const totals = useMemo(
    () => ({
      total: toNum(overview?.total_tasks),
      completed: toNum(overview?.completed_tasks),
      completionRate: toNum(overview?.completion_rate),
      overdue: toNum(overview?.overdue_count),
      createdThisWeek: toNum(overview?.created_this_week),
      completedThisWeek: toNum(overview?.completed_this_week),
    }),
    [overview]
  )

  const hasAnyTask = totals.total > 0

  // ---- Chart payloads ---------------------------------------------------
  const activityData = useMemo(() => {
    const buckets = Array.isArray(productivity?.buckets) ? productivity.buckets : []
    return buckets.map((bucket) => ({
      date: bucket.date,
      label: bucket.label,
      completed: toNum(bucket.completed),
      created: toNum(bucket.created),
    }))
  }, [productivity])

  const priorityData = useMemo(() => {
    const rows = Array.isArray(priorityDist?.by_priority) ? priorityDist.by_priority : []
    const counts = rows.reduce((acc, row) => {
      acc[row.priority] = toNum(row.count)
      return acc
    }, {})
    return PRIORITIES.filter((priority) => counts[priority] > 0).map((priority) => ({
      label: priority,
      value: counts[priority],
      color: PRIORITY_COLORS[priority],
    }))
  }, [priorityDist])

  const priorityStatusMatrix = useMemo(() => {
    const rows = Array.isArray(priorityDist?.by_priority_status) ? priorityDist.by_priority_status : []
    const counts = {}
    rows.forEach((row) => {
      if (!counts[row.priority]) {
        counts[row.priority] = { label: row.priority }
        STATUSES.forEach((status) => {
          counts[row.priority][status] = 0
        })
      }
      counts[row.priority][row.status] = toNum(row.count)
    })
    return PRIORITIES.map((priority) => counts[priority] || { label: priority, ...emptyStatusRow() })
  }, [priorityDist])

  const priorityStatusChart = useMemo(() => {
    return priorityStatusMatrix
      .map((row) => ({
        priority: row.label,
        Backlog: toNum(row.Backlog),
        Pending: toNum(row.Pending),
        "In Progress": toNum(row["In Progress"]),
        Completed: toNum(row.Completed),
        Archived: toNum(row.Archived),
      }))
      .filter(
        (row) => STATUSES.reduce((sum, status) => sum + toNum(row[status]), 0) > 0
      )
  }, [priorityStatusMatrix])

  const statusData = useMemo(() => {
    const rows = Array.isArray(overview?.by_status) ? overview.by_status : []
    const counts = rows.reduce((acc, row) => {
      acc[row.status] = toNum(row.count)
      return acc
    }, {})
    return STATUSES.filter((status) => counts[status] > 0).map((status) => ({
      label: status,
      value: counts[status],
      color: STATUS_COLORS[status],
    }))
  }, [overview])

  const completionData = useMemo(
    () => [
      { label: "Completed", value: totals.completed, color: CHART_COLORS.success },
      {
        label: "Remaining",
        value: Math.max(totals.total - totals.completed, 0),
        color: CHART_COLORS.slate,
      },
    ],
    [totals]
  )

  const sortedProjects = useMemo(
    () =>
      [...projectAnalytics].sort((a, b) => {
        const diff = toNum(b.total_tasks) - toNum(a.total_tasks)
        return diff !== 0 ? diff : String(a.name).localeCompare(String(b.name))
      }),
    [projectAnalytics]
  )

  if (loading && !overview) {
    return (
      <div className="analytics">
        <div className="page-header">
          <div>
            <h1>Analytics</h1>
            <p className="page-subtitle">Understand your productivity and task performance</p>
          </div>
        </div>
        <div className="stats-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton skeleton-card" style={{ height: 92 }} />
          ))}
        </div>
        <div className="charts-grid">
          <div className="skeleton skeleton-chart" />
          <div className="skeleton skeleton-chart" />
        </div>
      </div>
    )
  }

  return (
    <div className="analytics">
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <p className="page-subtitle">Understand your productivity and task performance</p>
        </div>
        <div className="header-controls">
          <div className="segmented" role="group" aria-label="Select time range">
            {TIME_RANGES.map((option) => (
              <button
                key={option.id}
                className={`segmented-item ${range === option.id ? "active" : ""}`}
                onClick={() => setRange(option.id)}
                aria-pressed={range === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchAnalytics(range)}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => fetchAnalytics(range)}>
            Retry
          </button>
        </div>
      )}

      {!hasAnyTask ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M4 19V5" />
              <path d="M8 16v-5" />
              <path d="M12 16V8" />
              <path d="M16 16v-3" />
              <path d="M20 19H4" />
            </svg>
          </div>
          <p className="empty-state-title">{EMPTY.title}</p>
          <p className="empty-state-message">{EMPTY.hint}</p>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <StatCard label="Total Tasks" value={totals.total} icon="📋" color={CHART_COLORS.primary} />
            <StatCard label="Completed Tasks" value={totals.completed} icon="✅" color={CHART_COLORS.success} />
            <StatCard label="Completion Rate" value={`${totals.completionRate}%`} icon="📈" color={CHART_COLORS.cyan} />
            <StatCard
              label="Overdue Tasks"
              value={totals.overdue}
              icon="⚠️"
              color={totals.overdue > 0 ? CHART_COLORS.danger : CHART_COLORS.slate}
            />
            <StatCard label="Created This Week" value={totals.createdThisWeek} icon="🆕" color={CHART_COLORS.purple} />
            <StatCard label="Completed This Week" value={totals.completedThisWeek} icon="🏁" color={CHART_COLORS.success} />
          </div>

          <div className="charts-grid">
            <div className="chart-card chart-card-wide">
              <div className="chart-header">
                <div>
                  <h3>Tasks Created vs Completed</h3>
                  <p className="chart-subtitle">Last {rangeLabel}</p>
                </div>
                <div className="chart-summary">
                  <span className="chart-summary-item" style={{ color: CHART_COLORS.primary }}>
                    +{toNum(productivity?.total_created)} created
                  </span>
                  <span className="chart-summary-item" style={{ color: CHART_COLORS.success }}>
                    {toNum(productivity?.total_completed)} completed
                  </span>
                </div>
              </div>
              <LineChart
                data={activityData}
                xKey="label"
                yKeys={["created", "completed"]}
                colors={[CHART_COLORS.primary, CHART_COLORS.success]}
                height={300}
                emptyMessage="No activity in this period"
                emptyHint="Create or complete tasks to see the trend line."
              />
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <h3>Completion Rate</h3>
                  <p className="chart-subtitle">All tasks</p>
                </div>
              </div>
              <DonutChart
                data={completionData}
                colors={[CHART_COLORS.success, CHART_COLORS.slate]}
                centerLabel="Tasks"
                height={240}
                emptyMessage="Nothing completed yet"
                emptyHint="Finish a task to light up this chart."
              />
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <h3>Priority Distribution</h3>
                  <p className="chart-subtitle">Last {rangeLabel}</p>
                </div>
              </div>
              <DonutChart
                data={priorityData}
                colors={[CHART_COLORS.danger, CHART_COLORS.orange, CHART_COLORS.warning, CHART_COLORS.slate]}
                centerLabel="Tasks"
                height={240}
                emptyMessage="No priorities in this period"
                emptyHint="Widen the time range or add tasks."
              />
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <h3>Tasks by Status</h3>
                  <p className="chart-subtitle">All tasks</p>
                </div>
              </div>
              <DonutChart
                data={statusData}
                colors={STATUSES.map((status) => STATUS_COLORS[status])}
                centerLabel="Tasks"
                height={240}
                emptyMessage="No tasks yet"
              />
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <div>
                <h3>Status × Priority</h3>
                <p className="chart-subtitle">How work is distributed across your workflow</p>
              </div>
            </div>
            <StackedMatrix
              rows={priorityStatusMatrix}
              keys={STATUSES}
              colors={STATUSES.map((status) => STATUS_COLORS[status])}
              emptyMessage="No priority data yet"
            />
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <div>
                <h3>Priority by Status</h3>
                <p className="chart-subtitle">Grouped counts for every priority</p>
              </div>
            </div>
            <BarChart
              data={priorityStatusChart}
              xKey="priority"
              yKeys={STATUSES}
              colors={STATUSES.map((status) => STATUS_COLORS[status])}
              height={280}
              emptyMessage="No priority data yet"
            />
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <div>
                <h3>Project Performance</h3>
                <p className="chart-subtitle">
                  Lifetime progress with activity in the last {rangeLabel}
                </p>
              </div>
            </div>

            {sortedProjects.length === 0 ? (
              <div className="empty-state" style={{ padding: "var(--space-8)" }}>
                <p className="empty-state-title">No projects yet</p>
                <p className="empty-state-message">Create a project to track per-project performance.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Project</th>
                      <th scope="col" className="num">Tasks</th>
                      <th scope="col" className="num">Completed</th>
                      <th scope="col" className="num">In Progress</th>
                      <th scope="col" className="num">Pending</th>
                      <th scope="col" className="num">Overdue</th>
                      <th scope="col">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProjects.map((project) => {
                      const total = toNum(project.total_tasks)
                      const completed = toNum(project.completed_tasks)
                      const progress = Math.min(Math.max(toNum(project.progress), 0), 100)
                      const color = project.color || CHART_COLORS.primary
                      const periodCreated = toNum(project.period_created)
                      const periodCompleted = toNum(project.period_completed)
                      return (
                        <tr key={project.id}>
                          <th scope="row" className="cell-project">
                            <span className="project-color-dot" style={{ backgroundColor: color }} aria-hidden="true" />
                            <span className="cell-project-name">{project.name}</span>
                          </th>
                          <td className="num">{total}</td>
                          <td className="num num-success">{completed}</td>
                          <td className="num">{toNum(project.in_progress_tasks)}</td>
                          <td className="num">{toNum(project.pending_tasks)}</td>
                          <td className={`num ${toNum(project.overdue_tasks) > 0 ? "num-danger" : ""}`}>
                            {toNum(project.overdue_tasks)}
                          </td>
                          <td>
                            <div className="table-progress">
                              <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%`, backgroundColor: color }} />
                              </div>
                              <span className="table-progress-value">{progress}%</span>
                            </div>
                            {periodCreated > 0 && (
                              <small className="table-note">
                                +{periodCreated} created / {periodCompleted} completed in range
                              </small>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function emptyStatusRow() {
  return STATUSES.reduce((acc, status) => {
    acc[status] = 0
    return acc
  }, {})
}

export default Analytics