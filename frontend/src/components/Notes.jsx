import { useCallback, useEffect, useMemo, useState } from "react"
import { useToast } from "../context/ToastContext"
import { API, getErrorMessage } from "../services/api"
import { ConfirmDialog } from "./ConfirmDialog"

export function Notes({ projects = [], dataVersion = 0 }) {
  const { success, error: showError } = useToast()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [search, setSearch] = useState("")
  const [projectFilter, setProjectFilter] = useState("all")
  const [viewMode, setViewMode] = useState("list")
  const [pendingDelete, setPendingDelete] = useState(null)

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await API.getNotes()
      setNotes(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load notes."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes, dataVersion])

  // Keep the note list honest when a project is deleted elsewhere.
  useEffect(() => {
    setNotes((prev) =>
      prev
        .map((note) =>
          note.project_id && !projects.some((project) => project.id === note.project_id)
            ? { ...note, project_id: null, project: null }
            : note
        )
    )
  }, [projects])

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase()
    return notes.filter((note) => {
      const matchesSearch =
        !query ||
        (note.title || "").toLowerCase().includes(query) ||
        (note.content || "").toLowerCase().includes(query)
      const matchesProject =
        projectFilter === "all" || (projectFilter === "none" ? !note.project_id : note.project_id === Number(projectFilter))
      return matchesSearch && matchesProject
    })
  }, [notes, search, projectFilter])

  const handleSave = async (noteData) => {
    setSaving(true)
    setFormError("")
    try {
      if (editing?.id) {
        const updated = await API.updateNote(editing.id, {
          title: noteData.title,
          content: noteData.content,
          project_id: noteData.project_id || null,
        })
        setNotes((prev) => prev.map((note) => (note.id === updated.id ? { ...note, ...updated } : note)))
        success("Note updated", `"${updated.title}" has been saved`)
      } else {
        const created = await API.createNote({
          title: noteData.title,
          content: noteData.content,
          project_id: noteData.project_id || null,
        })
        setNotes((prev) => [created, ...prev])
        success("Note created", `"${created.title}" has been saved`)
      }
      setEditing(null)
    } catch (err) {
      const message = getErrorMessage(err, "Unable to save note.")
      setFormError(message)
      showError("Unable to save note", message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await API.deleteNote(pendingDelete.id)
      setNotes((prev) => prev.filter((note) => note.id !== pendingDelete.id))
      success("Note deleted", `"${pendingDelete.title}" has been removed`)
    } catch (err) {
      showError("Unable to delete note", getErrorMessage(err))
    } finally {
      setPendingDelete(null)
    }
  }

  const isFiltered = Boolean(search.trim()) || projectFilter !== "all"

  return (
    <div className="notes-page">
      <div className="page-header">
        <div>
          <h1>Notes</h1>
          <p className="page-subtitle">Capture ideas, meeting notes and study material</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ id: null, title: "", content: "", project_id: null })}>
          + New Note
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={fetchNotes}>
            Retry
          </button>
        </div>
      )}

      <div className="toolbar">
        <div className="toolbar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="input"
            placeholder="Search notes..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search notes"
          />
        </div>
        <select
          className="input notes-project-filter"
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          aria-label="Filter notes by project"
        >
          <option value="all">All Projects</option>
          <option value="none">No Project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <div className="segmented" role="group" aria-label="Note layout">
          <button
            className={`segmented-item ${viewMode === "list" ? "active" : ""}`}
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
          >
            List
          </button>
          <button
            className={`segmented-item ${viewMode === "grid" ? "active" : ""}`}
            onClick={() => setViewMode("grid")}
            aria-pressed={viewMode === "grid"}
          >
            Grid
          </button>
        </div>
      </div>

      {editing && (
        <NoteForm
          note={editing}
          projects={projects}
          saving={saving}
          error={formError}
          onSave={handleSave}
          onCancel={() => {
            setEditing(null)
            setFormError("")
          }}
        />
      )}

      {loading ? (
        <div className="notes-skeleton">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="skeleton skeleton-card" style={{ height: 96 }} />
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">{isFiltered ? "No notes match your filters" : "No notes yet"}</p>
          <p className="empty-state-message">
            {isFiltered ? "Try a different search term or project." : "Capture your first idea to get started."}
          </p>
          {isFiltered ? (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSearch("")
                setProjectFilter("all")
              }}
            >
              Clear filters
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setEditing({ id: null, title: "", content: "", project_id: null })}>
              + New Note
            </button>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div className="notes-list">
          {filteredNotes.map((note) => (
            <NoteListItem key={note.id} note={note} onEdit={setEditing} onDelete={setPendingDelete} />
          ))}
        </div>
      ) : (
        <div className="notes-grid">
          {filteredNotes.map((note) => (
            <NoteCard key={note.id} note={note} onEdit={setEditing} onDelete={setPendingDelete} />
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Delete "${pendingDelete?.title ?? ""}"?`}
        message="This note will be permanently removed."
        confirmLabel="Delete Note"
        busy={saving}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

function formatUpdated(value) {
  if (!value) return "N/A"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString()
}

function NoteMeta({ note }) {
  const project = note.project || null
  return (
    <div className="note-meta">
      {project && (
        <span className="project-tag" style={{ backgroundColor: project.color, color: "#fff" }}>
          {project.name}
        </span>
      )}
      <span className="note-date">Updated {formatUpdated(note.updated_at)}</span>
    </div>
  )
}

function NoteListItem({ note, onEdit, onDelete }) {
  return (
    <article className="note-list-item">
      <div className="note-content">
        <h3 className="note-title">{note.title}</h3>
        <p className="note-preview">{note.content || "No content"}</p>
        <NoteMeta note={note} />
      </div>
      <div className="note-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(note)}>
          Edit
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => onDelete(note)}>
          Delete
        </button>
      </div>
    </article>
  )
}

function NoteCard({ note, onEdit, onDelete }) {
  return (
    <article className="note-card">
      <h3 className="note-title">{note.title}</h3>
      <p className="note-preview">{note.content || "No content"}</p>
      <NoteMeta note={note} />
      <div className="note-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(note)}>
          Edit
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => onDelete(note)}>
          Delete
        </button>
      </div>
    </article>
  )
}

function NoteForm({ note, projects, saving, error, onSave, onCancel }) {
  const isEditing = Boolean(note?.id)
  const [title, setTitle] = useState(note?.title || "")
  const [content, setContent] = useState(note?.content || "")
  const [projectId, setProjectId] = useState(note?.project_id ? String(note.project_id) : "")
  const [localError, setLocalError] = useState("")

  useEffect(() => {
    setTitle(note?.title || "")
    setContent(note?.content || "")
    setProjectId(note?.project_id ? String(note.project_id) : "")
    setLocalError("")
  }, [note])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!title.trim()) {
      setLocalError("Note title is required")
      return
    }
    setLocalError("")
    await onSave({ title: title.trim(), content, project_id: projectId ? Number(projectId) : null })
  }

  return (
    <div className="form-card note-form">
      <h3>{isEditing ? "Edit Note" : "New Note"}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="note-title">Title</label>
          <input
            id="note-title"
            type="text"
            className={`input ${localError || error ? "input-error" : ""}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Enter note title"
            required
          />
        </div>

        <div className="form-field" style={{ marginTop: "var(--space-4)" }}>
          <label htmlFor="note-content">Content</label>
          <textarea
            id="note-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write your note here..."
            rows={6}
          />
        </div>

        <div className="form-field" style={{ marginTop: "var(--space-4)" }}>
          <label htmlFor="note-project">Project</label>
          <select id="note-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">No Project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Note"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>

        {(localError || error) && <p className="form-error" role="alert">{localError || error}</p>}
      </form>
    </div>
  )
}

export default Notes