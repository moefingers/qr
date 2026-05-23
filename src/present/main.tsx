import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';

// Phase 3 wires up the real presenter. This stub keeps the entry
// resolvable so Vite's two-input build works during earlier phases.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ padding: 'var(--space-6)' }}>
      <h1>Present (coming soon)</h1>
      <p>Fullscreen presenter route — under construction.</p>
    </div>
  </StrictMode>,
);
