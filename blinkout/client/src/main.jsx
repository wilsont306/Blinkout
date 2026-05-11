import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import ResultCrashFallback from './components/ResultCrashFallback.jsx'

const root = ReactDOM.createRoot(document.getElementById('root'))

function renderCrashFallback() {
  root.render(<ResultCrashFallback />)
}

window.addEventListener('error', event => {
  console.error('[BlinkOut window error]', event.error || event.message)
  renderCrashFallback()
})

window.addEventListener('unhandledrejection', event => {
  console.error('[BlinkOut unhandled rejection]', event.reason)
  renderCrashFallback()
})

root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
)
