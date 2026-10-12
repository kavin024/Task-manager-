import { useState } from "react"
import { useAuth } from "../context/AuthContext"
import { getErrorMessage } from "../services/api"

export function AuthScreen() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const isRegister = mode === "register"

  const switchMode = (next) => {
    setMode(next)
    setError("")
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError("")

    if (isRegister && !name.trim()) {
      setError("Please enter your name.")
      return
    }
    if (!email.trim() || !password) {
      setError("Email and password are required.")
      return
    }
    if (isRegister && password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }

    setSubmitting(true)
    try {
      if (isRegister) {
        await register(name.trim(), email.trim(), password)
      } else {
        await login(email.trim(), password)
      }
    } catch (err) {
      setError(getErrorMessage(err, "Unable to sign in. Please try again."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <div className="auth-brand">
          <span className="auth-brand-icon" aria-hidden="true">⚡</span>
          <span className="auth-brand-text">NEXUS</span>
        </div>
        <p className="auth-tagline">Your tasks, focus, and notes in one place.</p>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={!isRegister}
            className={`auth-tab ${!isRegister ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isRegister}
            className={`auth-tab ${isRegister ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Create account
          </button>
        </div>

        {error && (
          <div className="alert alert-error auth-alert" role="alert">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {isRegister && (
            <div className="form-field">
              <label htmlFor="auth-name">Name</label>
              <input
                id="auth-name"
                className="input input-lg"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                maxLength={100}
              />
            </div>
          )}

          <div className="form-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="input input-lg"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="input input-lg"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isRegister ? "At least 8 characters" : "Your password"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
            />
          </div>

          <button className="btn btn-primary btn-lg auth-submit" type="submit" disabled={submitting}>
            {submitting ? (
              <span className="auth-spinner" aria-label="Working" />
            ) : isRegister ? (
              "Create account"
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="auth-help">
          {isRegister
            ? "You can enable daily email reminders after signing up."
            : "New here? Create an account to get started."}
        </p>
      </div>
    </div>
  )
}

export default AuthScreen
