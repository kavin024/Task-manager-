import { useCallback, useEffect, useRef, useState } from "react"
import { useToast } from "../context/ToastContext"
import { API, getErrorMessage } from "../services/api"
import { ActivityTimeline } from "./ActivityTimeline"
import { ConfirmDialog } from "./ConfirmDialog"

export const TaskDrawer = ({ task, isOpen, onClose, onUpdate, onDelete, projects: projectsProp = [], onChanged }) => {
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [subtasks, setSubtasks] = useState([])
  const [tags, setTags] = useState([])
  const [allTags, setAllTags] = useState([])
  const [projects, setProjects] = useState(projectsProp)
  const [newSubtask, setNewSubtask] = useState("")
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState("#64748b")
  const [showSubtaskForm, setShowSubtaskForm] = useState(false)
  const [showTagForm, setShowTagForm] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!projectsProp.length) setProjects(projectsProp)
  }, [projectsProp])

  useEffect(() => {
    if (!isOpen || !task) return undefined
    fetchData()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, task])

  /** Re-read the full task so counters (subtasks/tags) stay correct upstream. */
  const refreshTask = useCallback(async () => {
    if (!task) return
    try {
      const fresh = await API.getTask(task.id)
      onChanged?.(fresh.id, fresh)
    } catch {
      /* the drawer keeps its local state; nothing critical is lost */
    }
  }, [task, onChanged])

  const fetchData = useCallback(async () => {
    if (!task) return
    try {
      const [subtasksRes, tagsRes] = await Promise.all([API.getSubtasks(task.id), API.getTags()])
      setSubtasks(Array.isArray(subtasksRes) ? subtasksRes : [])
      setAllTags(Array.isArray(tagsRes) ? tagsRes : [])
      setTags(Array.isArray(task.tags) ? task.tags : [])
      if (!projectsProp.length) {
        const projectsRes = await API.getProjects()
        setProjects(Array.isArray(projectsRes) ? projectsRes : [])
      }
    } catch (err) {
      showError("Failed to load task details", getErrorMessage(err))
    }
  }, [task, projectsProp.length, showError])

  const handleClose = () => closeRef.current?.()

  const handleUpdate = async (updates) => {
    setLoading(true)
    try {
      const updated = await API.updateTask(task.id, updates)
      onUpdate(updated)
      success("Task updated", "Changes saved successfully")
    } catch (err) {
      showError("Failed to update task", getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      await API.deleteTask(task.id)
      onDelete(task.id)
      success("Task deleted", "Task has been removed")
      setConfirmOpen(false)
      handleClose()
    } catch (err) {
      showError("Failed to delete task", getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async () => {
    setLoading(true)
    try {
      const updated = await API.updateTask(task.id, { status: "Completed" })
      onUpdate(updated)
      success("Task completed", "Task marked as done")
    } catch (err) {
      showError("Failed to complete task", getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSubtaskToggle = async (subtask) => {
    try {
      await API.updateSubtask(subtask.id, { completed: !subtask.completed })
      setSubtasks((prev) =>
        prev.map((item) => (item.id === subtask.id ? { ...item, completed: !item.completed } : item))
      )
      refreshTask()
    } catch (err) {
      showError("Failed to update subtask", getErrorMessage(err))
    }
  }

  const handleAddSubtask = async (event) => {
    event.preventDefault()
    if (!newSubtask.trim()) return
    try {
      const subtask = await API.createSubtask(task.id, { title: newSubtask.trim() })
      setSubtasks((prev) => [...prev, subtask])
      setNewSubtask("")
      setShowSubtaskForm(false)
      refreshTask()
      success("Subtask added", "New subtask created")
    } catch (err) {
      showError("Failed to add subtask", getErrorMessage(err))
    }
  }

  const handleDeleteSubtask = async (id) => {
    try {
      await API.deleteSubtask(id)
      setSubtasks((prev) => prev.filter((item) => item.id !== id))
      refreshTask()
      success("Subtask deleted", "Subtask removed")
    } catch (err) {
      showError("Failed to delete subtask", getErrorMessage(err))
    }
  }

  const assignExistingTag = async (tag) => {
    try {
      await API.addTagToTask(task.id, tag.id)
      setTags((prev) => (prev.some((item) => item.id === tag.id) ? prev : [...prev, tag]))
      success("Tag assigned", `#${tag.name} added to task`)
    } catch (err) {
      showError("Failed to assign tag", getErrorMessage(err))
    }
  }

  const handleAddTag = async () => {
    const name = newTagName.trim()
    if (!name) return
    try {
      const tag = await API.createTag({ name, color: newTagColor })
      await API.addTagToTask(task.id, tag.id)
      setTags((prev) => [...prev, tag])
      setAllTags((prev) => [...prev, tag])
      setNewTagName("")
      setShowTagForm(false)
      refreshTask()
      success("Tag added", `Tag "${tag.name}" created and assigned`)
    } catch (err) {
      if (err?.response?.status === 409) {
        const existing = allTags.find((tag) => tag.name.toLowerCase() === name.toLowerCase())
        if (existing) {
          setNewTagName("")
          setShowTagForm(false)
          await assignExistingTag(existing)
          return
        }
      }
      showError("Failed to add tag", getErrorMessage(err))
    }
  }

  const handleRemoveTag = async (tagId) => {
    try {
      await API.removeTagFromTask(task.id, tagId)
      setTags((prev) => prev.filter((tag) => tag.id !== tagId))
      refreshTask()
      success("Tag removed", "Tag removed from task")
    } catch (err) {
      showError("Failed to remove tag", getErrorMessage(err))
    }
  }

  const handleProjectChange = async (projectId) => {
    await handleUpdate({ project_id: projectId ? parseInt(projectId) : null })
  }

  const handleStatusChange = async (status) => {
    await handleUpdate({ status })
    if (status === "Completed") {
      fetchData()
    }
  }

  const handlePriorityChange = async (priority) => {
    await handleUpdate({ priority })
  }

  const handleDueDateChange = async (dueDate) => {
    await handleUpdate({ due_date: dueDate })
  }

  const handleEstimatedMinutesChange = async (minutes) => {
    await handleUpdate({ estimated_minutes: minutes ? parseInt(minutes) : null })
  }

  if (!isOpen) return null

  const isCompleted = task.status === "Completed"
  const isOverdue = task.due_date && !isCompleted && new Date(task.due_date) < new Date()
  const completedSubtasks = subtasks.filter(s => s.completed).length

  return (
    <div className="drawer-overlay" onClick={handleClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-row">
            <h2 className="drawer-title">{task.title}</h2>
            <div className="drawer-badges">
              <span className={`badge badge-${(task.status || "pending").toLowerCase().replace(" ", "-")}`}>{task.status}</span>
              <span className={`badge badge-${(task.priority || "medium").toLowerCase()}`}>{task.priority}</span>
            </div>
          </div>
          <button className="drawer-close" onClick={handleClose} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="drawer-content">
          <div className="drawer-main">
            <div className="drawer-section">
              <h3>Description</h3>
              <p>{task.description || "No description"}</p>
            </div>

            <div className="drawer-grid">
              <div className="field">
                <label>Status</label>
                <select value={task.status} onChange={e => handleStatusChange(e.target.value)}>
                  <option value="Backlog">Backlog</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={task.priority} onChange={e => handlePriorityChange(e.target.value)}>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="field">
                <label>Due Date</label>
                <input type="date" value={task.due_date ? task.due_date.split("T")[0] : ""} onChange={e => handleDueDateChange(e.target.value)} />
              </div>
              <div className="field">
                <label>Estimated Time (min)</label>
                <input type="number" value={task.estimated_minutes || ""} onChange={e => handleEstimatedMinutesChange(e.target.value)} min="0" />
              </div>
              <div className="field full-width">
                <label>Project</label>
                <select value={task.project_id || ""} onChange={e => handleProjectChange(e.target.value)}>
                  <option value="">No Project</option>
                  {projects.map(p => <option key={p.id} value={p.id} style={{ color: p.color }}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div className="drawer-section">
              <div className="section-header">
                <h3>Subtasks</h3>
                <button className="btn btn-primary btn-sm" onClick={() => setShowSubtaskForm(true)}>+ Add Subtask</button>
              </div>
              {showSubtaskForm && (
                <form onSubmit={e => { e.preventDefault(); handleAddSubtask(e) }} className="subtask-form">
                  <input type="text" value={newSubtask} onChange={e => setNewSubtask(e.target.value)} placeholder="Add a subtask..." autoFocus />
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary btn-sm">Add</button>
                    <button type="button" onClick={() => { setShowSubtaskForm(false); setNewSubtask("") }} className="btn btn-secondary btn-sm">Cancel</button>
                  </div>
                </form>
              )}
              <ul className="subtask-list">
                {subtasks.map(sub => (
                  <li key={sub.id} className={`subtask-item ${sub.completed ? "completed" : ""}`}>
                    <label className="subtask-label">
                      <input type="checkbox" checked={sub.completed} onChange={() => handleSubtaskToggle(sub)} />
                      <span className={sub.completed ? "completed" : ""}>{sub.title}</span>
                    </label>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteSubtask(sub.id)}>🗑</button>
                  </li>
                ))}
                {subtasks.length === 0 && <p className="empty-text">No subtasks yet. Add one to break down your task.</p>}
              </ul>
            </div>

            <div className="drawer-section">
              <div className="section-header">
                <h3>Tags</h3>
                <button className="btn btn-primary btn-sm" onClick={() => setShowTagForm(true)}>+ Add Tag</button>
              </div>
              {showTagForm && (
                <form onSubmit={e => { e.preventDefault(); handleAddTag() }} className="tag-form">
                  <input type="text" value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Tag name (e.g. urgent)" autoFocus />
                  <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} />
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary btn-sm">Add</button>
                    <button type="button" onClick={() => { setShowTagForm(false); setNewTagName("") }} className="btn btn-secondary btn-sm">Cancel</button>
                  </div>
                </form>
              )}
              <div className="tags-list">
                {allTags.length === 0 && <p className="empty-text">No tags yet. Create one above.</p>}
                {allTags.map(tag => {
                  const assigned = tags.some((item) => item.id === tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={`tag-chip ${assigned ? "assigned" : ""}`}
                      style={{ backgroundColor: tag.color, color: "#fff" }}
                      onClick={() => (assigned ? handleRemoveTag(tag.id) : assignExistingTag(tag))}
                      aria-pressed={assigned}
                    >
                      #{tag.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="drawer-section">
              <h3>Project</h3>
              {task.project && (
                <div className="project-info" style={{ borderLeftColor: task.project.color }}>
                  <strong>{task.project.name}</strong>
                  <p>{task.project.description || "No description"}</p>
                </div>
              )}
              {!task.project && <p className="empty-text">No project assigned. Select a project above.</p>}
            </div>
          </div>

<div className="drawer-sidebar">
              <div className="sidebar-section">
                <h4>Activity</h4>
                <ActivityTimeline taskId={task.id} limit={20} />
              </div>
              <div className="sidebar-section">
                <h4>Quick Actions</h4>
                <button
                  className="btn btn-primary btn-block"
                  onClick={handleComplete}
                  disabled={isCompleted || loading}
                >
                  {isCompleted ? "✓ Completed" : "✓ Mark Complete"}
                </button>
                <button
                  className="btn btn-danger btn-block"
                  onClick={() => setConfirmOpen(true)}
                  disabled={loading}
                >
                  🗑 Delete Task
                </button>
              </div>
              <div className="sidebar-section">
                <h4>Info</h4>
                <p>
                  <strong>Subtasks:</strong> {completedSubtasks}/{subtasks.length}
                </p>
                <p>
                  <strong>Created:</strong> {task.created_at ? new Date(task.created_at).toLocaleDateString() : "N/A"}
                </p>
                <p>
                  <strong>Updated:</strong> {task.updated_at ? new Date(task.updated_at).toLocaleDateString() : "N/A"}
                </p>
                {task.completed_at && (
                  <p>
                    <strong>Completed:</strong> {new Date(task.completed_at).toLocaleDateString()}
                  </p>
                )}
                {isOverdue && <p className="drawer-overdue">This task is overdue</p>}
              </div>
            </div>
          </div>
        </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={`Delete "${task.title}"?`}
        message="This task will be permanently removed."
        confirmLabel="Delete Task"
        busy={loading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}