import { createRoot } from "react-dom/client"
import { ThemeProvider } from "./context/ThemeContext"
import { ToastProvider } from "./context/ToastContext"
import { AuthProvider } from "./context/AuthContext"
import { ToastContainer } from "./components/ToastContainer"
import { App } from "./App.jsx"
import "./styles/tokens.css"
import "./styles/components.css"
import "./styles/layout.css"
import "./styles/auth.css"
import "./index.css"

createRoot(document.getElementById("root")).render(
  <ThemeProvider>
    <ToastProvider>
      <AuthProvider>
        <App />
        <ToastContainer />
      </AuthProvider>
    </ToastProvider>
  </ThemeProvider>
)