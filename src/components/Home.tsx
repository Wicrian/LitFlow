import { useRef, useState } from 'react';
import type { Project, Settings } from '../types';
import { newProject } from '../lib/frameworks';
import { demoProject } from '../lib/demo';
import { importProjectJson } from '../lib/export';

interface Props {
  projects: Project[];
  settings: Settings;
  onOpen: (p: Project) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
}

export function Home({ projects, settings, onOpen, onDelete, onSettings }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">Revue de littérature libre et gratuite</div>
        <h1>Bonjour 👋 Prêt·e à trier ?</h1>
        <p className="muted">
          LitFlow est directement connecté à votre bibliothèque Zotero : vos titres, résumés et accents restent intacts,
          rien n’est réimporté, tout est synchronisé.
        </p>
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
            <li>Dans Zotero, rangez vos résultats de recherche dans une collection, avec une sous-collection par base de données (PubMed, Cairn, Érudit…).</li>
            <li>Dans LitFlow, choisissez cette collection : les références sont lues directement dans Zotero.</li>
            <li>Vérifiez les doublons, puis triez titres et résumés en glissant les cartes (← exclure, → inclure, ↑ incertain).</li>
            <li>Chaque décision crée collections, étiquettes et notes dans Zotero, sous « LitFlow – nom du projet ».</li>
            <li>Évaluez les textes intégraux, puis exportez le diagramme PRISMA 2020.</li>
          </ol>
        </section>
      </div>

      <section className="panel stack" style={{ marginTop: '1rem' }}>
        <div className="row">
          <h2 style={{ margin: 0 }}>Mes revues</h2>
          <span className="spacer" />
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
          Les projets sont enregistrés dans ce navigateur. Pensez à exporter une sauvegarde (onglet Références) pour changer
          d’ordinateur ou partager avec un·e collègue.
        </p>
      </section>
    </main>
  );
}
