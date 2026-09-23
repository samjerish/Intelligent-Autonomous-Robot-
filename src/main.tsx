import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import MobileApp from './MobileApp.tsx'

const pathname = window.location.pathname.toLowerCase();
const hash = window.location.hash.toLowerCase();
const search = window.location.search.toLowerCase();

const isMobileRoute = 
  pathname === '/mobile' ||
  pathname.startsWith('/mobile/') ||
  hash === '#/mobile' ||
  hash.includes('mobile') ||
  search.includes('mobile=true') ||
  search.includes('view=mobile');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isMobileRoute ? <MobileApp /> : <App />}
  </StrictMode>,
)
