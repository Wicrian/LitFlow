import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

import { applyTheme, loadTheme } from './lib/theme';

// Ambiance de couleurs choisie par la personne (gardée dans ce navigateur).
applyTheme(loadTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
