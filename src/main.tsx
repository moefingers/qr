import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { QrEditor } from './components/qr/qr-editor';
import { QrPresenter } from './components/qr/qr-presenter';
import './index.css';

// Hash-router. The whole app is one HTML file; the URL hash picks
// which view to render:
//   #         → editor (default)
//   #present  → fullscreen presenter (anything starting with #present
//               counts so e.g. #present?id=foo also works for save
//               selection, parsed by the presenter itself).
//
// useSyncExternalStore keeps the rendered view in sync with the hash
// so the back-link and Present button just need to set
// `location.hash` and React re-renders the right component.

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

function getHash() {
  if (typeof window === 'undefined') return '';
  return window.location.hash;
}

function getServerHash() {
  return '';
}

// eslint-disable-next-line react-refresh/only-export-components
function Root() {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  const isPresent = hash.startsWith('#present');
  return isPresent ? <QrPresenter /> : <QrEditor />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
