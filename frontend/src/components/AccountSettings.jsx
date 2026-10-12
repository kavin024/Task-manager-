import { useCallback, useEffect, useState } from "react"
import { API, getErrorMessage } from "../services/api"
import { useAuth } from "../context/AuthContext"
import { useToast } from "../context/ToastContext"

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function formatDate(value) {
  if (!value) return "—"
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export function AccountSettings() {
  const { user } = useAuth()
  const { success, error: showError } = useToast()

  const [loadingPrefs, setLoadingPrefs] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [scheduleLabel, setScheduleLabel] = useState("Daily at 6:00 AM IST")
  const [reminderEmail, setReminderEmail] = useState("")

  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const loadPreferences = useCallback(async () => {
    setLoadingPrefs(true)
    try {
      const prefs = await API.getPreferences()
      setEnabled(Boolean(prefs.enabled))
      setScheduleLabel(prefs.schedule_label || "Daily at 6:00 AM IST")
      setReminderEmail(prefs.reminder_email || user?.email || "")
    } catch (err) {
      showError("Unable to load preferences", getErrorMessage(err))
    } finally {
      setLoadingPrefs(false)
    }
  }, [showError, user])

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const rows = await API.getReminderHistory({ limit: 20 })
      setHistory(Array.isArray(rows) ? rows : [])
    } catch (err) {
      showError("Unable to load reminder history", getErrorMessage(err))
    } finally {
      setLoadingHistory(false)
    }
  }, [showError])

  useEffect(() => {
    loadPreferences()
    loadHistory()
  }, [loadPreferences, loadHistory])

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const updated = await API.updatePreferences({
        enabled,
        reminder_email: reminderEmail.trim(),
      })
      setEnabled(Boolean(updated.enabled))
      setScheduleLabel(updated.schedule_label || scheduleLabel)
      setReminderEmail(updated.reminder_email || reminderEmail)
      success("Preferences saved", "Your reminder settings have been updated.")
    } catch (err) {
      showError("Unable to save preferences", getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1>Account &amp; Reminders</h1>
          <p className="page-subtitle">Manage your profile and daily email reminders.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="card settings-card">
          <div className="card-header">
            <h2 className="card-title">Profile</h2>
          </div>
          <div className="settings-profile">
            <div className="avatar">{initials(user?.name)}</div>
            <div className="settings-profile-info">
              <div className="settings-profile-name">{user?.name}</div>
              <div className="settings-profile-email">{user?.email}</div>
            </div>
          </div>
        </section>

        <section className="card settings-card">
          <div className="card-header">
            <h2 className="card-title">Daily email reminder</h2>
            <p className="card-description">
              We email a short summary of your pending and upcoming tasks once a day.
            </p>
          </div>

          <form className="settings-form" onSubmit={handleSave}>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                disabled={loadingPrefs}
              />
              <span className="settings-toggle-track" aria-hidden="true">
                <span className="settings-toggle-thumb" />
              </span>
              <span className="settings-toggle-label">Enable daily reminders</span>
            </label>

            <div className="form-field">
              <label>Schedule</label>
              <p className="settings-schedule">{scheduleLabel}</p>
              <p className="settings-muted">
                Reminders are sent once a day at 6:00 AM IST. The send time and timezone are fixed.
              </p>
            </div>

            <div className="form-field">
              <label htmlFor="remind-email">Send reminders to</label>
              <input
                id="remind-email"
                className="input"
                type="email"
                value={reminderEmail}
                onChange={(event) => setReminderEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={loadingPrefs || !enabled}
              />
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving || loadingPrefs}>
                {saving ? "Saving…" : "Save preferences"}
              </button>
            </div>
          </form>
        </section>

        <section className="card settings-card settings-card-wide">
          <div className="card-header">
            <h2 className="card-title">Recent reminder emails</h2>
          </div>

          {loadingHistory ? (
            <p className="settings-muted">Loading…</p>
          ) : history.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">✉️</div>
              <p className="empty-state-message">No reminder emails sent yet.</p>
            </div>
          ) : (
            <ul className="reminder-history" role="list">
              {history.map((row) => (
                <li key={row.id} className="reminder-history-item">
                  <div className="reminder-history-main">
                    <span className="reminder-history-date">{formatDate(row.reminder_date)}</span>
                    <span className={`badge ${row.status === "sent" ? "badge-success" : "badge-danger"}`}>
                      {row.status === "sent" ? "Sent" : "Failed"}
                    </span>
                  </div>
                  {row.summary && (
                    <div className="reminder-history-summary">
                      {row.summary.pending != null && <span>{row.summary.pending} pending</span>}
                      {row.summary.overdue != null && <span>{row.summary.overdue} overdue</span>}
                      {row.summary.due_today != null && <span>{row.summary.due_today} due today</span>}
                    </div>
                  )}
                  {row.error_message && (
                    <div className="reminder-history-error">{row.error_message}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

export default AccountSettings
