import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App, loadPublicDemo } from './App';
import './styles.css';

async function boot() {
  const root = document.getElementById('root');
  if (!root) return;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const prerendered = root.hasChildNodes();
  // /demo is lazy-loaded; resolve the chunk before hydrating so the tree matches the prerendered HTML.
  if (prerendered && path === '/demo') await loadPublicDemo();
  const app = (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  if (prerendered) hydrateRoot(root, app);
  else createRoot(root).render(app);
}

void boot();

if (typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
