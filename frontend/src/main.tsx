import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import DemoApp from './demo/DemoApp.tsx'

function RootApp() {
  const [isDemoRoute, setIsDemoRoute] = useState(window.location.pathname === '/demo');

  useEffect(() => {
    const handlePopState = () => {
      setIsDemoRoute(window.location.pathname === '/demo');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Also handle direct navigation by checking pathname on mount
  useEffect(() => {
    setIsDemoRoute(window.location.pathname === '/demo');
  }, []);

  return isDemoRoute ? (
    <DemoApp createRouter initMSW route="/dashboard/demo-task-1" />
  ) : (
    <App />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
