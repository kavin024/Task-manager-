import { useCallback, useEffect } from "react"

export const ConfirmDialog = ({
  isOpen,
  title = "Are you sure?",
  message = "",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy = false,
  variant = "danger",
  onConfirm,
  onCancel,
}) => {
  const handleKeyDown = useCallback(
    (event) => {
      if (!isOpen || busy) return
      if (event.key === "Escape") onCancel?.()
      if (event.key === "Enter") onConfirm?.()
    },
    [isOpen, busy, onConfirm, onCancel]
  )

  // All hooks run unconditionally: no early return before them.
  useEffect(() => {
    if (!isOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onCancel} role="presentation">
      <div
        className="modal modal-sm"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={message ? "confirm-dialog-message" : undefined}
      >
        <div className="modal-header">
          <h3 className="modal-title" id="confirm-dialog-title">
            {title}
          </h3>
        </div>
        {message && (
          <div className="modal-body">
            <p id="confirm-dialog-message">{message}</p>
          </div>
        )}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${variant === "danger" ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog