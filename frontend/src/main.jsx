import { createRoot } from "react-dom/client"
import { ThemeProvider } from "./context/ThemeContext"
import { ToastProvider } from "./context/ToastContext"
import { ToastContainer } from "./components/ToastContainer"
import { App } from "./App.jsx"
import "./styles/tokens.css"
import "./styles/components.css"
import "./styles/layout.css"
import "./index.css"

createRoot(document.getElementById("root")).render(
  <ThemeProvider>
    <ToastProvider>
      <App />
      <ToastContainer />
    </ToastProvider>
  </ThemeProvider>
)