import './assets/main.css'

import { createRoot } from 'react-dom/client'
import App from './App'

// Flag macOS so the renderer can make room for the (hidden-title-bar) traffic
// lights and mark the title-bar region draggable.
if (navigator.platform.toUpperCase().includes('MAC')) {
  document.documentElement.classList.add('is-mac')
}

// StrictMode is intentionally omitted: its double-invoked mount effects would
// fire our connection/IPC side effects twice in development.
createRoot(document.getElementById('root')!).render(<App />)
