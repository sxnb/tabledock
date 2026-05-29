import './assets/main.css'

import { createRoot } from 'react-dom/client'
import App from './App'

// StrictMode is intentionally omitted: its double-invoked mount effects would
// fire our connection/IPC side effects twice in development.
createRoot(document.getElementById('root')!).render(<App />)
