import axios from "axios"

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api"
const TOKEN_KEY = "nexus-token"

/** Read the raw bearer token from localStorage (safe in private mode). */
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/** Persist or clear the raw bearer token. */
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable - session simply won't survive a reload */
  }
}

const client = axios.create({ baseURL: API_BASE_URL })

// Attach the bearer token to every request.
client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// A stale/expired token is a 401 on a request that carried a token. Let the
// auth layer sign the user out; a 401 from /auth/login (no token) is ignored.
let unauthorizedHandler = null
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && getToken() && unauthorizedHandler) {
      unauthorizedHandler()
    }
    return Promise.reject(error)
  }
)

export const API = {
  // Health
  health: async () => {
    const response = await client.get("/health")
    return response.data
  },

  // Auth
  register: async (payload) => {
    const response = await client.post("/auth/register", payload)
    return response.data
  },

  login: async (payload) => {
    const response = await client.post("/auth/login", payload)
    return response.data
  },

  logout: async () => {
    try {
      const response = await client.post("/auth/logout")
      return response.data
    } finally {
      setToken(null)
    }
  },

  me: async () => {
    const response = await client.get("/auth/me")
    return response.data
  },

  getPreferences: async () => {
    const response = await client.get("/auth/preferences")
    return response.data
  },

  updatePreferences: async (preferences) => {
    const response = await client.put("/auth/preferences", preferences)
    return response.data
  },

  getReminderHistory: async (params = {}) => {
    const response = await client.get("/reminders/history", { params })
    return response.data
  },

  // Tasks
  getTasks: async () => {
    const response = await client.get("/tasks")
    return response.data
  },

  getTask: async (id) => {
    const response = await client.get(`/tasks/${id}`)
    return response.data
  },

  createTask: async (task) => {
    const response = await client.post("/tasks", task)
    return response.data
  },

  updateTask: async (id, task) => {
    const response = await client.put(`/tasks/${id}`, task)
    return response.data
  },

  deleteTask: async (id) => {
    const response = await client.delete(`/tasks/${id}`)
    return response.data
  },

  // Projects
  getProjects: async () => {
    const response = await client.get("/projects")
    return response.data
  },

  getProject: async (id) => {
    const response = await client.get(`/projects/${id}`)
    return response.data
  },

  createProject: async (project) => {
    const response = await client.post("/projects", project)
    return response.data
  },

  updateProject: async (id, project) => {
    const response = await client.put(`/projects/${id}`, project)
    return response.data
  },

  deleteProject: async (id) => {
    const response = await client.delete(`/projects/${id}`)
    return response.data
  },

  // Subtasks
  getSubtasks: async (taskId) => {
    const response = await client.get(`/tasks/${taskId}/subtasks`)
    return response.data
  },

  createSubtask: async (taskId, subtask) => {
    const response = await client.post(`/tasks/${taskId}/subtasks`, subtask)
    return response.data
  },

  updateSubtask: async (id, subtask) => {
    const response = await client.put(`/subtasks/${id}`, subtask)
    return response.data
  },

  deleteSubtask: async (id) => {
    const response = await client.delete(`/subtasks/${id}`)
    return response.data
  },

  // Tags
  getTags: async () => {
    const response = await client.get("/tags")
    return response.data
  },

  createTag: async (tag) => {
    const response = await client.post("/tags", tag)
    return response.data
  },

  addTagToTask: async (taskId, tagId) => {
    const response = await client.post(`/tasks/${taskId}/tags`, { tag_id: tagId })
    return response.data
  },

  removeTagFromTask: async (taskId, tagId) => {
    const response = await client.delete(`/tasks/${taskId}/tags/${tagId}`)
    return response.data
  },

  // Focus Sessions
  getFocusSessions: async (params = {}) => {
    const response = await client.get("/focus/sessions", { params })
    return response.data
  },

  getFocusStats: async () => {
    const response = await client.get("/focus/stats")
    return response.data
  },

  createFocusSession: async (session) => {
    const response = await client.post("/focus/sessions", session)
    return response.data
  },

  updateFocusSession: async (id, session) => {
    const response = await client.put(`/focus/sessions/${id}`, session)
    return response.data
  },

  deleteFocusSession: async (id) => {
    const response = await client.delete(`/focus/sessions/${id}`)
    return response.data
  },

  // Analytics - `range` is whitelisted server side (7d | 30d | 90d | 1y | all)
  getAnalyticsOverview: async (range) => {
    const response = await client.get("/analytics/overview", { params: { range } })
    return response.data
  },

  getProductivityTrends: async (range) => {
    const response = await client.get("/analytics/productivity", { params: { range } })
    return response.data
  },

  getProjectAnalytics: async (range) => {
    const response = await client.get("/analytics/projects", { params: { range } })
    return response.data
  },

  getPriorityDistribution: async (range) => {
    const response = await client.get("/analytics/priority-distribution", { params: { range } })
    return response.data
  },

  // Notes
  getNotes: async (params = {}) => {
    const response = await client.get("/notes", { params })
    return response.data
  },

  getNote: async (id) => {
    const response = await client.get(`/notes/${id}`)
    return response.data
  },

  createNote: async (note) => {
    const response = await client.post("/notes", note)
    return response.data
  },

  updateNote: async (id, note) => {
    const response = await client.put(`/notes/${id}`, note)
    return response.data
  },

  deleteNote: async (id) => {
    const response = await client.delete(`/notes/${id}`)
    return response.data
  },

  // Activity Logs
  getActivityLogs: async (params = {}) => {
    const response = await client.get("/activity", { params })
    return response.data
  },

  // Global Search
  search: async (query) => {
    const response = await client.get("/search", { params: { q: query } })
    return response.data
  },
}

/** Turn an axios failure into a readable message for toasts. */
export function getErrorMessage(error, fallback = "Something went wrong") {
  const data = error?.response?.data
  if (data?.details) {
    const first = Object.values(data.details)[0]
    if (first) return String(first)
  }
  if (data?.error) return String(data.error)
  if (error?.code === "ERR_NETWORK") return "Cannot reach the API. Is the backend running on port 5000?"
  return error?.message || fallback
}

export default API