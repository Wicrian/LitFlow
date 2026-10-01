import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Thème de couleurs (d'autres thèmes pourront être ajoutés dans styles.css).
document.documentElement.dataset.theme = 'innovation';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
