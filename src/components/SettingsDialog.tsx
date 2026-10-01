import { useState } from 'react';
import type { Settings } from '../types';
import { ZoteroClient } from '../zotero/api';

export function SettingsDialog({ settings, onSave, onClose }: { settings: Settings; onSave: (s: Settings) => void; onClose: () => void }) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
    settings.username ? { ok: true, msg: `Connecté en tant que ${settings.username}` } : null,
  );
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const info = await new ZoteroClient(apiKey.trim()).currentKey();
      const s = { ...settings, apiKey: apiKey.trim(), userId: String(info.userID), username: info.username };
      onSave(s);
      setStatus({ ok: true, msg: `Connecté en tant que ${info.username}. Clé enregistrée.` });
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h2>Connexion à Zotero</h2>
        <ol className="small">
          <li>
            Ouvrez{' '}
            <a href="https://www.zotero.org/settings/keys/new" target="_blank" rel="noreferrer">
              zotero.org › Paramètres › Clés API › Créer une clé
            </a>{' '}
            (connectez-vous avec votre compte Zotero).
          </li>
          <li>
            Cochez <strong>« Allow library access »</strong> et <strong>« Allow write access »</strong>. Pour une revue en
            équipe, cochez aussi l’accès en lecture/écriture aux <strong>groupes</strong>.
          </li>
          <li>Enregistrez la clé, copiez-la et collez-la ci-dessous.</li>
          <li>Dans Zotero (application de bureau), vérifiez que la <strong>synchronisation</strong> est activée.</li>
        </ol>
        <label className="field">
          <span>Clé API Zotero</span>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="ex. P9NiFoyLeZu2bZNvvuQPDWsd" />
        </label>
        {status && <div className={`notice ${status.ok ? '' : 'error'}`}>{status.msg}</div>}
        <p className="small muted">
          La clé est conservée uniquement dans ce navigateur et n’est envoyée qu’à api.zotero.org. Sur un ordinateur partagé,
          supprimez-la après usage.
        </p>
        <div className="row">
          <button className="btn primary" onClick={test} disabled={!apiKey.trim() || busy}>
            {busy ? 'Vérification…' : 'Vérifier et enregistrer'}
          </button>
          {settings.apiKey && (
            <button
              className="btn danger"
              onClick={() => {
                onSave({ ...settings, apiKey: '', userId: '', username: '' });
                setApiKey('');
                setStatus(null);
              }}
            >
              Oublier la clé
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
