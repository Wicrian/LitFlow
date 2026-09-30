import { useState } from 'react';
import type { Progress } from '../ai/client';

export interface AiRunState {
  running: boolean;
  message: string;
  error: string;
  run: (fn: (onProgress: Progress) => Promise<void>) => Promise<void>;
}

/** Suivi d'une analyse IA : téléchargement du modèle, puis analyse des textes. */
export function useAiProgress(): AiRunState {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const run = async (fn: (onProgress: Progress) => Promise<void>) => {
    setRunning(true);
    setError('');
    setMessage('Préparation de l’IA…');
    try {
      await fn(({ phase, done, total }) =>
        setMessage(
          phase === 'download'
            ? `Téléchargement du modèle (une seule fois) : ${Math.round(done / 1e6)} / ${Math.round(total / 1e6)} Mo`
            : `Analyse des textes : ${done} / ${total}`,
        ),
      );
      setMessage('');
    } catch (e) {
      setError(
        `L’IA n’a pas pu démarrer : ${e instanceof Error ? e.message : String(e)}. ` +
          'Vérifiez votre connexion Internet pour le premier téléchargement, ou essayez un navigateur récent (Chrome, Edge, Firefox).',
      );
      setMessage('');
    } finally {
      setRunning(false);
    }
  };
  return { running, message, error, run };
}

export function AiProgressText({ state }: { state: AiRunState }) {
  if (state.error) return <div className="notice error">{state.error}</div>;
  if (state.message) return <div className="small muted">⏳ {state.message}</div>;
  return null;
}
