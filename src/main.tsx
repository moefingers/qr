import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QrEditor } from './components/qr/qr-editor';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QrEditor />
  </StrictMode>,
);
