import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` permet d'héberger l'application n'importe où
// (GitHub Pages, sous-dossier d'un serveur, clé USB…).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
});
