import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import MobileApp from './MobileApp.tsx'

const pathname = window.location.pathname.toLowerCase();
const hash = window.location.hash.toLowerCase();
const search = window.location.search.toLowerCase();

// Check explicit desktop/mobile query or hash overrides
const forceDesktop = search.includes('desktop=true') || hash.includes('desktop') || search.includes('view=desktop');
const forceMobile = 
  pathname === '/mobile' ||
  pathname.startsWith('/mobile/') ||
  hash === '#/mobile' ||
  hash.includes('mobile') ||
  search.includes('mobile=true') ||
  search.includes('view=mobile');

// Automatically detect mobile devices (iPhone, iPad, Android, etc.) or small touchscreen viewports
const isMobileDevice = 
  typeof navigator !== 'undefined' && (
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '') ||
    (window.innerWidth <= 768 && window.matchMedia('(pointer: coarse)').matches)
  );

const shouldShowMobile = (forceMobile || isMobileDevice) && !forceDesktop;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shouldShowMobile ? <MobileApp /> : <App />}
  </StrictMode>,
)
