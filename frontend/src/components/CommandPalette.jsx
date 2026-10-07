import { useEffect, useMemo, useRef, useState } from "react"

const ACTIONS = [
  { id: "new-task", label: "Create Task", description: "Add a new task", icon: "➕", category: "Tasks", keywords: ["new", "create", "add", "task"] },
  { id: "new-note", label: "Create Note", description: "Add a new note", icon: "📝", category: "Notes", keywords: ["new", "create", "add", "note"] },
  { id: "new-project", label: "Create Project", description: "Add a new project", icon: "📁", category: "Projects", keywords: ["new", "create", "add", "project"] },
  { id: "focus", label: "Start Focus Session", description: "Begin a Pomodoro timer", icon: "⏱️", category: "Focus", keywords: ["focus", "pomodoro", "timer", "start"] },
  { id: "dashboard", label: "Open Dashboard", description: "Go to dashboard", icon: "🏠", category: "Navigation", keywords: ["dashboard", "home", "overview"] },
  { id: "tasks", label: "Open Tasks", description: "View all tasks", icon: "📋", category: "Navigation", keywords: ["tasks", "list", "view"] },
  { id: "kanban", label: "Open Kanban", description: "View Kanban board", icon: "📊", category: "Navigation", keywords: ["kanban", "board", "view"] },
  { id: "calendar", label: "Open Calendar", description: "View calendar", icon: "📅", category: "Navigation", keywords: ["calendar", "schedule", "view"] },
  { id: "projects", label: "Open Projects", description: "View projects", icon: "📁", category: "Navigation", keywords: ["projects", "workspaces", "view"] },
  { id: "analytics", label: "Open Analytics", description: "View analytics", icon: "📈", category: "Navigation", keywords: ["analytics", "stats", "charts"] },
  { id: "notes", label: "Open Notes", description: "View notes", icon: "📝", category: "Navigation", keywords: ["notes", "view"] },
  { id: "focus-mode", label: "Open Focus Mode", description: "Open focus timer", icon: "⏱️", category: "Navigation", keywords: ["focus", "pomodoro", "timer"] },
  { id: "settings", label: "Open Settings", description: "Open settings", icon: "⚙️", category: "Navigation", keywords: ["settings", "preferences", "config"] },
  { id: "theme-dark", label: "Switch to Dark Mode", description: "Set theme to dark", icon: "🌙", category: "Theme", keywords: ["dark", "theme", "dark mode"] },
  { id: "theme-light", label: "Switch to Light Mode", description: "Set theme to light", icon: "☀️", category: "Theme", keywords: ["light", "theme", "light mode"] },
  { id: "theme-system", label: "Use System Theme", description: "Follow system theme", icon: "💻", category: "Theme", keywords: ["system", "theme", "auto"] },
]

export function CommandPalette({ isOpen, onClose, onNavigate, currentPage, theme, setTheme }) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const filteredActions = useMemo(() => {
    if (!query) return ACTIONS.slice(0, 8)
    const q = query.toLowerCase()
    return ACTIONS.filter(action =>
      action.label.toLowerCase().includes(q) ||
      action.description.toLowerCase().includes(q) ||
      action.keywords.some(k => k.includes(q))
    ).slice(0, 10)
  }, [query])

  useEffect(() => {
    if (!isOpen) return undefined
    setQuery("")
    setSelectedIndex(0)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, Math.max(filteredActions.length - 1, 0)))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (filteredActions[selectedIndex]) {
          executeAction(filteredActions[selectedIndex])
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, selectedIndex, filteredActions, onClose])

  function executeAction(action) {
    const NAVIGATION_TARGETS = {
      "new-task": "tasks",
      "new-note": "notes",
      "new-project": "projects",
      focus: "focus",
      dashboard: "dashboard",
      tasks: "tasks",
      kanban: "kanban",
      calendar: "calendar",
      analytics: "analytics",
      notes: "notes",
      projects: "projects",
      "focus-mode": "focus",
      settings: "settings",
    }
    const THEME_TARGETS = {
      "theme-dark": "dark",
      "theme-light": "light",
      "theme-system": "system",
    }

    if (THEME_TARGETS[action.id]) {
      setTheme?.(THEME_TARGETS[action.id])
    } else if (NAVIGATION_TARGETS[action.id]) {
      onNavigate?.(NAVIGATION_TARGETS[action.id])
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command Palette">
        <div className="command-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "var(--space-3)" }}>
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="command-input"
            placeholder="Type a command or search..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
            autoComplete="off"
            aria-label="Command search"
          />
          <kbd className="command-hint">⌘K</kbd>
        </div>

        <div className="command-list" ref={listRef} role="listbox" aria-label="Commands">
          {filteredActions.length === 0 ? (
            <div className="command-empty">
              No commands found for "{query}"
            </div>
          ) : (
            filteredActions.map((action, index) => (
              <div
                key={action.id}
                className={`command-item ${index === selectedIndex ? "selected" : ""}`}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => executeAction(action)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="command-icon">{action.icon}</div>
                <div className="command-info">
                  <span className="command-label">{action.label}</span>
                  <span className="command-description">{action.description}</span>
                </div>
                <span className="command-category">{action.category}</span>
                <span className="command-shortcut">{action.id === "new-task" ? "⌘N" : action.id === "focus" ? "⌘F" : ""}</span>
</div>
          )))}
        </div>

        <div className="command-footer">
          <kbd>↑</kbd> <kbd>↓</kbd> Navigate &nbsp;
          <kbd>⏎</kbd> Select &nbsp;
          <kbd>Esc</kbd> Close
        </div>
      </div>
    </div>
  )
}

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0
      const modifier = isMac ? e.metaKey : e.ctrlKey
      if (modifier && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setIsOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return { isOpen, setIsOpen }
}

export default CommandPalette