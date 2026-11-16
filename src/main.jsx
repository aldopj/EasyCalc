import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// Disable accidental double-tap zoom and browser pinch/callout gestures in PWA UI
document.addEventListener(
  'dblclick',
  (e) => {
    e.preventDefault();
  },
  { passive: false }
);

document.addEventListener(
  'gesturestart',
  (e) => {
    e.preventDefault();
  },
  { passive: false }
);

// Prevent long-press browser context menu on buttons and UI chrome while preserving input copy/paste
document.addEventListener('contextmenu', (e) => {
  const target = e.target;
  if (target && typeof target.closest === 'function' && target.closest('input, textarea')) {
    return;
  }
  e.preventDefault();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
