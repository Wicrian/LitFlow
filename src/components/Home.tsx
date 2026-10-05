import { Palette } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Project, Settings } from '../types';
import { newProject } from '../lib/frameworks';
import { demoProject } from '../lib/demo';
import { importProjectJson } from '../lib/export';
import { RestoreDialog } from './RestoreDialog';

interface Props {
  projects: Project[];
  settings: Settings;
  onOpen: (p: Project) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
  onTheme: () => void;
}

export function Home({ projects, settings, onOpen, onDelete, onSettings, onTheme }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <main>
      <section className="hero row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
        <div className="eyebrow">Revue de littérature libre et gratuite</div>
        <h1>Bonjour 👋 Prêt·e à trier ?</h1>
        <p className="muted">
          LitFlow est directement connecté à votre bibliothèque Zotero. Vos titres, résumés et PDF restent dans Zotero :
          rien n’est importé, tout est synchronisé.
        </p>
        <p className="muted small">
          LitFlow ne supprime jamais vos références ni vos propres étiquettes ou collections : il ajoute seulement des
          collections, des étiquettes « LF: » et des notes pour trier et organiser.
        </p>
        </div>
        <button className="btn" onClick={onTheme}>
          <Palette size={16} /> Changer de style
        </button>
      </section>

      <div className="grid2">
        <section className="panel stack">
          <h2>Nouvelle revue</h2>
          <label className="field">
            <span>Nom du projet</span>
            <input
              type="text"
              value={name}
              placeholder="ex. Soutien par les pairs en santé mentale"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && onOpen(newProject(name.trim()))}
            />
          </label>
          <div className="row">
            <button className="btn primary" disabled={!name.trim()} onClick={() => onOpen(newProject(name.trim()))}>
              Créer le projet
            </button>
            <button className="btn" onClick={() => onOpen(demoProject())}>
              Essayer avec des données de démonstration
            </button>
          </div>
          {!settings.apiKey && (
            <div className="notice warn">
              Pour lier une revue à Zotero, <a href="#" onClick={(e) => (e.preventDefault(), onSettings())}>ajoutez d’abord votre clé API Zotero</a>.
              Vous pouvez aussi commencer sans Zotero et vous connecter plus tard.
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Comment ça marche ?</h2>
          <ol className="steps">
            <li>
              <strong>Reliez une collection Zotero</strong> : vos résultats de recherche, ou simplement vos lectures.
            </li>
            <li>
              <strong>Prenez ce dont vous avez besoin</strong>, les étapes se combinent librement&nbsp;:
              <ul>
                <li className="soon">
                  <strong>Rechercher</strong> (en test) : vos concepts et l’équation adaptée à chaque base de données ;
                </li>
                <li>
                  <strong>Trier</strong> : doublons, puis cartes à glisser (← exclure, → inclure, ↑ incertain), puis textes intégraux ;
                </li>
                <li>
                  <strong>Organiser</strong> : classer par catégories et marqueurs (sections de mémoire, concepts…), même sans avoir
                  trié, avec l’onglet «&nbsp;Toutes&nbsp;».
                </li>
              </ul>
            </li>
            <li>
              <strong>Tout se retrouve dans Zotero</strong> (collections, étiquettes, notes) et sur vos autres appareils.
            </li>
            <li>
              <strong>Exportez</strong> le diagramme PRISMA 2020 (FR/EN) ou un tableau CSV.
            </li>
          </ol>
        </section>
      </div>

      <section className="panel stack" style={{ marginTop: '1rem' }}>
        <div className="row">
          <h2 style={{ margin: 0 }}>Mes revues</h2>
          <span className="spacer" />
          {settings.apiKey && (
            <button className="btn small primary" onClick={() => setRestoring(true)}>
              Reprendre depuis Zotero
            </button>
          )}
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            Ouvrir une sauvegarde (.json)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                onOpen(await importProjectJson(f));
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </div>
        {error && <div className="notice error">{error}</div>}
        {projects.length === 0 && <p className="muted">Aucun projet pour l’instant.</p>}
        {projects.map((p) => {
          const n = Object.keys(p.records).length;
          return (
            <div key={p.id} className="project-card" onClick={() => onOpen(p)}>
              <div className="avatar">{p.name.trim().charAt(0).toUpperCase() || 'L'}</div>
              <div style={{ flex: 1 }}>
                <strong>{p.name}</strong>
                <div className="small muted">
                  {n} référence(s) · {p.library ? `Zotero : ${p.library.name}` : 'sans Zotero'} · modifié le{' '}
                  {new Date(p.updatedAt).toLocaleDateString('fr-CA')}
                </div>
              </div>
              <button
                className="btn small danger"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Supprimer le projet « ${p.name} » de cet ordinateur ?\n(Rien n’est supprimé dans Zotero.)`)) onDelete(p.id);
                }}
              >
                Supprimer
              </button>
            </div>
          );
        })}
        <p className="small muted">
          Les projets sont enregistrés dans ce navigateur. Les revues liées à Zotero y sont aussi sauvegardées
          automatiquement : « Reprendre depuis Zotero » les retrouve sur n’importe quel appareil.
        </p>
      </section>
      {restoring && <RestoreDialog settings={settings} localProjects={projects} onClose={() => setRestoring(false)} onOpen={onOpen} />}
    </main>
  );
}
