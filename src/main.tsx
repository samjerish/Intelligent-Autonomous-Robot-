import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import MobileApp from './MobileApp.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'

const isMobileRoute = window.location.pathname === '/mobile';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isMobileRoute ? <MobileApp /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
