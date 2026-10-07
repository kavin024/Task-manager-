import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppShell } from "./components/AppShell"
import { TaskForm } from "./components/TaskForm"
import { TaskList } from "./components/TaskList"
import { TaskDrawer } from "./components/TaskDrawer"
import { KanbanBoard } from "./components/KanbanBoard"
import { Calendar } from "./components/Calendar"
import { FocusMode } from "./components/FocusMode"
import { Analytics } from "./components/Analytics"
import { Projects } from "./components/Projects"
import { Notes } from "./components/Notes"
import { CommandPalette, useCommandPalette } from "./components/CommandPalette"
import { API, getErrorMessage } from "./services/api"
import { useToast } from "./context/ToastContext"
import { useTheme } from "./context/ThemeContext"

const TASK_FILTERS = ["All", "Backlog", "Pending", "In Progress", "Completed", "Archived"]

/** Only send the columns the tasks table actually owns. */
function pickTaskPayload(source = {}) {
  return {
    title: source.title,
    description: source.description ?? "",
    status: source.status,
    priority: source.priority,
    due_date: source.due_date || null,
    project_id: source.project_id ? Number(source.project_id) : null,
    estimated_minutes:
      source.estimated_minutes === "" || source.estimated_minutes == null
        ? null
        : Number(source.estimated_minutes),
  }
}

function isOverdue(task) {
  return Boolean(task.due_date) && task.status !== "Completed" && new Date(task.due_date).getTime() < Date.now()
}

function Dashboard({
  tasks,
  projects,
  loading,
  error,
  onCreate,
  onEdit,
  onComplete,
  onDelete,
  onView,
  onRetry,
  filter,
  setFilter,
  search,
  setSearch,
  editing,
  setEditing,
}) {
  const { success, error: showError } = useToast()

  const handleCreate = async (taskData) => {
    try {
      const created = await API.createTask(pickTaskPayload(taskData))
      onCreate(created)
      success("Task created", `"${created.title}" has been added`)
    } catch (err) {
      showError("Unable to create task", getErrorMessage(err))
      throw err
    }
  }

  const handleEdit = async (id, updatedTask) => {
    try {
      const updated = await API.updateTask(id, pickTaskPayload(updatedTask))
      onEdit(id, updated)
      success("Task updated", `"${updated.title}" has been saved`)
    } catch (err) {
      showError("Unable to update task", getErrorMessage(err))
      throw err
    }
  }

  const handleComplete = async (id) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    try {
      const updated = await API.updateTask(id, { ...pickTaskPayload(task), status: "Completed" })
      onComplete(id, updated)
      success("Task completed", `"${task.title}" marked as done`)
    } catch (err) {
      showError("Unable to complete task", getErrorMessage(err))
    }
  }

  const handleDelete = async (id) => {
    const task = tasks.find((t) => t.id === id)
    try {
      await API.deleteTask(id)
      onDelete(id)
      success("Task deleted", `"${task?.title ?? "Task"}" has been removed`)
    } catch (err) {
      showError("Unable to delete task", getErrorMessage(err))
    }
  }

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tasks.filter((task) => {
      const matchesSearch =
        !query ||
        (task.title || "").toLowerCase().includes(query) ||
        (task.description || "").toLowerCase().includes(query)
      const matchesFilter = filter === "All" || task.status === filter
      return matchesSearch && matchesFilter
    })
  }, [tasks, search, filter])

  const stats = useMemo(
    () => ({
      total: tasks.length,
      pending: tasks.filter((t) => t.status === "Pending").length,
      inProgress: tasks.filter((t) => t.status === "In Progress").length,
      completed: tasks.filter((t) => t.status === "Completed").length,
      overdue: tasks.filter(isOverdue).length,
    }),
    [tasks]
  )

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 17) return "Good afternoon"
    if (hour < 21) return "Good evening"
    return "Good night"
  }, [])

  const statCards = [
    { label: "Total Tasks", value: stats.total, tone: "primary" },
    { label: "Pending", value: stats.pending, tone: "pending" },
    { label: "In Progress", value: stats.inProgress, tone: "in-progress" },
    { label: "Completed", value: stats.completed, tone: "completed" },
    { label: "Overdue", value: stats.overdue, tone: "overdue" },
  ]

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>{greeting}</h1>
          <p className="page-subtitle">Here's what's happening with your productivity today.</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setEditing(null)
            document.getElementById("task-form")?.scrollIntoView({ behavior: "smooth", block: "center" })
          }}
        >
          + Add Task
        </button>
      </div>

      <div className="stats-grid stats-grid-compact">
        {statCards.map((stat) => (
          <div key={stat.label} className={`stat-card stat-card-${stat.tone}`}>
            <div className="stat-content">
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      <div className="dashboard-section">
        <div className="section-header">
          <h2>Your Tasks</h2>
          <div className="section-actions">
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
                aria-label="Search tasks"
              />
            </div>
            <div className="segmented" role="group" aria-label="Filter tasks by status">
              {TASK_FILTERS.map((option) => (
                <button
                  key={option}
                  className={`segmented-item ${filter === option ? "active" : ""}`}
                  onClick={() => setFilter(option)}
                  aria-pressed={filter === option}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div id="task-form">
          {editing ? (
            <TaskForm
              initialData={editing}
              onSave={(updated) => handleEdit(editing.id, updated)}
              onCancel={() => setEditing(null)}
              projects={projects}
            />
          ) : (
            <TaskForm onCreate={handleCreate} projects={projects} />
          )}
        </div>

        <TaskList
          tasks={filteredTasks}
          onDelete={handleDelete}
          onEdit={(id, task) => setEditing(task)}
          onComplete={handleComplete}
          onView={onView}
          loading={loading}
          error={error}
          isFiltered={Boolean(search.trim()) || filter !== "All"}
          onResetFilters={() => {
            setSearch("")
            setFilter("All")
          }}
        />
      </div>
    </div>
  )
}

function PlaceholderPage({ title, description, icon }) {
  return (
    <div className="placeholder-page">
      <div className="placeholder-icon" aria-hidden="true">
        {icon}
      </div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  )
}

export function App() {
  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dataVersion, setDataVersion] = useState(0)
  const [filter, setFilter] = useState("All")
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState(null)
  const [currentPage, setCurrentPage] = useState("dashboard")
  const [drawerTask, setDrawerTask] = useState(null)
  const { setTheme } = useTheme()
  const mainRef = useRef(null)

  const bumpDataVersion = useCallback(() => setDataVersion((version) => version + 1), [])

  /** Project counters are server-owned - re-read them after task mutations. */
  const refreshProjects = useCallback(async () => {
    try {
      const fresh = await API.getProjects()
      setProjects(Array.isArray(fresh) ? fresh : [])
    } catch {
      /* keep the previous snapshot; the visible error state covers hard failures */
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [tasksData, projectsData] = await Promise.all([API.getTasks(), API.getProjects()])
      setTasks(Array.isArray(tasksData) ? tasksData : [])
      setProjects(Array.isArray(projectsData) ? projectsData : [])
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load data."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleNavigate = useCallback((page) => {
    setCurrentPage(page)
    setEditing(null)
    setDrawerTask(null)
  }, [])

  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 })
    window.scrollTo({ top: 0, behavior: "auto" })
  }, [currentPage])

  const { isOpen: paletteOpen, setIsOpen: setPaletteOpen } = useCommandPalette()

  // ---- Tasks ------------------------------------------------------------
  const handleCreateTask = useCallback(
    (created) => {
      setTasks((prev) => [created, ...prev])
      bumpDataVersion()
      refreshProjects()
    },
    [bumpDataVersion, refreshProjects]
  )

  const handleUpdateTask = useCallback(
    (id, updated) => {
      setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...updated } : task)))
      setEditing((prev) => (prev && prev.id === id ? { ...prev, ...updated } : prev))
      setDrawerTask((prev) => (prev && prev.id === id ? { ...prev, ...updated } : prev))
      bumpDataVersion()
      refreshProjects()
    },
    [bumpDataVersion, refreshProjects]
  )

  const handleDeleteTask = useCallback(
    (id) => {
      setTasks((prev) => prev.filter((task) => task.id !== id))
      setEditing((prev) => (prev && prev.id === id ? null : prev))
      setDrawerTask((prev) => (prev && prev.id === id ? null : prev))
      bumpDataVersion()
      refreshProjects()
    },
    [bumpDataVersion, refreshProjects]
  )

  // ---- Projects ---------------------------------------------------------
  const handleCreateProject = useCallback(
    async (payload) => {
      const created = await API.createProject(payload)
      setProjects((prev) => [created, ...prev.filter((p) => p.id !== created.id)])
      bumpDataVersion()
      return created
    },
    [bumpDataVersion]
  )

  const handleUpdateProject = useCallback(
    async (id, payload) => {
      const updated = await API.updateProject(id, payload)
      setProjects((prev) => prev.map((project) => (project.id === id ? { ...project, ...updated } : project)))
      bumpDataVersion()
      return updated
    },
    [bumpDataVersion]
  )

  const handleDeleteProject = useCallback(
    async (id) => {
      await API.deleteProject(id)
      setProjects((prev) => prev.filter((project) => project.id !== id))
      // Tasks and notes survive; they simply become unassigned.
      setTasks((prev) =>
        prev.map((task) => (task.project_id === id ? { ...task, project_id: null, project: null } : task))
      )
      bumpDataVersion()
    },
    [bumpDataVersion]
  )

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
      case "tasks":
        return (
          <Dashboard
            tasks={tasks}
            loading={loading}
            error={error}
            onCreate={handleCreateTask}
            onEdit={handleUpdateTask}
            onComplete={handleUpdateTask}
            onDelete={handleDeleteTask}
            onView={setDrawerTask}
            onRetry={loadData}
            filter={filter}
            setFilter={setFilter}
            search={search}
            setSearch={setSearch}
            editing={editing}
            setEditing={setEditing}
            projects={projects}
          />
        )
      case "kanban":
        return <KanbanBoard tasks={tasks} projects={projects} onUpdate={handleUpdateTask} onView={setDrawerTask} />
      case "calendar":
        return <Calendar tasks={tasks} projects={projects} onView={setDrawerTask} onCreate={handleCreateTask} />
      case "projects":
        return (
          <Projects
            projects={projects}
            tasks={tasks}
            loading={loading}
            error={error}
            onCreate={handleCreateProject}
            onUpdate={handleUpdateProject}
            onDelete={handleDeleteProject}
            onOpenTask={setDrawerTask}
          />
        )
      case "focus":
        return <FocusMode tasks={tasks} />
      case "analytics":
        return <Analytics dataVersion={dataVersion} />
      case "notes":
        return <Notes projects={projects} dataVersion={dataVersion} />
      case "settings":
        return <PlaceholderPage title="Settings" description="Configure your preferences" icon="⚙" />
      default:
        return <PlaceholderPage title="Page Not Found" description="This page doesn't exist yet" icon="🔍" />
    }
  }

  return (
    <AppShell
      currentPage={currentPage}
      onNavigate={handleNavigate}
      mainRef={mainRef}
      onOpenSearch={() => setPaletteOpen(true)}
    >
      {renderPage()}

      {/* Rendered at app level so any page (Kanban, Calendar, Projects, ...) can open a task */}
      <TaskDrawer
        task={drawerTask}
        isOpen={Boolean(drawerTask)}
        onClose={() => setDrawerTask(null)}
        onUpdate={(updated) => {
          setDrawerTask(null)
          handleUpdateTask(updated.id, updated)
        }}
        onDelete={(id) => {
          setDrawerTask(null)
          handleDeleteTask(id)
        }}
        projects={projects}
        onChanged={handleUpdateTask}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={handleNavigate}
        theme="dark"
        setTheme={setTheme}
      />
    </AppShell>
  )
}

export default App