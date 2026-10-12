import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { API, getToken, setToken, setUnauthorizedHandler } from "../services/api"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // `initializing` stays true until we've checked for an existing session, so
  // the app never flashes the login screen for an already signed-in user.
  const [initializing, setInitializing] = useState(true)

  const applySession = useCallback((session) => {
    if (session?.token) setToken(session.token)
    setUser(session?.user || null)
  }, [])

  const login = useCallback(
    async (email, password) => {
      const session = await API.login({ email, password })
      applySession(session)
      return session.user
    },
    [applySession]
  )

  const register = useCallback(
    async (name, email, password) => {
      const session = await API.register({ name, email, password })
      applySession(session)
      return session.user
    },
    [applySession]
  )

  const logout = useCallback(async () => {
    try {
      await API.logout()
    } catch {
      setToken(null)
    }
    setUser(null)
  }, [])

  // The API layer calls this when a token is rejected, so an expired session
  // drops the user back to the login screen automatically.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      setUser(null)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    let active = true
    const bootstrap = async () => {
      if (!getToken()) {
        setInitializing(false)
        return
      }
      try {
        const data = await API.me()
        if (active) setUser(data.user)
      } catch {
        if (active) {
          setToken(null)
          setUser(null)
        }
      } finally {
        if (active) setInitializing(false)
      }
    }
    bootstrap()
    return () => {
      active = false
    }
  }, [])

  const value = useMemo(
    () => ({ user, initializing, login, register, logout }),
    [user, initializing, login, register, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export default AuthProvider
