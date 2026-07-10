import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './styles/animations.css'
import App from './App.tsx'
import { ToastProvider } from './components/ui/Toast'
import { getSettings } from './lib/storage'

// Apply persisted theme synchronously so there's no flash of the wrong accent.
const boot = getSettings()
document.documentElement.setAttribute('data-accent', boot.accent)
document.documentElement.setAttribute('data-reduce-motion', String(boot.reduceMotion))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
