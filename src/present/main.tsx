import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QrPresenter } from './qr-presenter';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QrPresenter />
  </StrictMode>,
);
