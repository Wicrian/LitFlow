import { useEffect, useState } from 'react';
import type { SourceKind, ZoteroLibrary } from '../types';
import { useProject } from '../store';
import { ZoteroClient, type ZCollection } from '../zotero/api';
import { mergeImport } from '../zotero/mapping';
import { importFromZotero } from '../zotero/sync';
import { reconcileFromZotero } from '../zotero/pull';

const KINDS: [SourceKind, string][] = [
  ['database', 'Base de données'],
  ['register', 'Registre'],
  ['other', 'Autre méthode (citations, sites web, littérature grise…)'],
];

export function ImportView({ onSettings, onDone }: { onSettings: () => void; onDone: () => void }) {
  const { project: p, update, settings, client, markDirty, syncNow } = useProject();
  const [libraries, setLibraries] = useState<ZoteroLibrary[]>([]);
  const [collections, setCollections] = useState<ZCollection[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const baseClient = settings.apiKey ? new ZoteroClient(settings.apiKey) : null;

  useEffect(() => {
    if (!baseClient || !settings.userId) return;
    baseClient
      .groups(settings.userId)
      .then((groups) =>
        setLibraries([
          { type: 'user', id: settings.userId, name: `Ma bibliothèque (${settings.username})` },
          ...groups.map((g) => ({ type: 'group' as const, id: String(g.id), name: `Groupe : ${g.data.name}` })),
        ]),
      )
      .catch((e) => setError(String(e.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.apiKey, settings.userId]);

  useEffect(() => {
    if (!client) return;
    client
      .collections()
      .then(setCollections)
      .catch((e) => setError(String(e.message ?? e)));
  }, [client]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError('');
    setResult('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const doImport = () =>
    run('Importation…', async () => {
      if (!client) return;
      const { records, sources, sourceMap, libraryVersion } = await importFromZotero(client, p, setBusy);
      const { added, updated } = mergeImport(p, records);
      const { changed } = reconcileFromZotero(mergeImport(p, records).project, records);
      update((cur) => {
        const merged = mergeImport({ ...cur, sources }, records).project;
        const rec = reconcileFromZotero(merged, records).project;
        return { ...rec, sync: { ...rec.sync, sourceMap, libraryVersion, lastPull: new Date().toISOString() } };
      });
      setResult(
        `${records.length} référence(s) lue(s) dans Zotero : ${added} nouvelle(s), ${updated} mise(s) à jour` +
          (changed.length ? `, ${changed.length} décision(s) modifiée(s) dans Zotero reprise(s)` : '') +
          '. Les titres et résumés sont conservés tels quels.',
      );
    });

  // Arborescence des collections pour la liste déroulante.
  const ours = new Set(Object.values(p.zoteroCollections));
  const tree: { c: ZCollection; depth: number }[] = [];
  const walk = (parent: string | false, depth: number) =>
    collections
      .filter((c) => c.data.parentCollection === parent && !ours.has(c.key))
      .sort((a, b) => a.data.name.localeCompare(b.data.name, 'fr'))
      .forEach((c) => {
        tree.push({ c, depth });
        walk(c.key, depth + 1);
      });
  walk(false, 0);

  const total = Object.keys(p.records).length;

  return (
    <div className="stack">
      <section className="panel stack">
        <h2>Identification : lier la revue à Zotero</h2>
        {!settings.apiKey ? (
          <div className="notice warn">
            Aucune clé API Zotero. <button className="btn small" onClick={onSettings}>Configurer la connexion</button>
          </div>
        ) : (
          <>
            <label className="field">
              <span>Bibliothèque Zotero (personnelle ou de groupe pour travailler en équipe)</span>
              <select
                value={p.library ? `${p.library.type}:${p.library.id}` : ''}
                onChange={(e) => {
                  const lib = libraries.find((l) => `${l.type}:${l.id}` === e.target.value) ?? null;
                  if (total && !confirm('Changer de bibliothèque ? Les références déjà importées resteront dans le projet.')) return;
                  update((cur) => ({ ...cur, library: lib, sourceCollection: null, zoteroCollections: {}, zoteroNotes: {} }));
                }}
              >
                <option value="">— Choisir —</option>
                {libraries.map((l) => (
                  <option key={`${l.type}:${l.id}`} value={`${l.type}:${l.id}`}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            {p.library && (
              <label className="field">
                <span>Collection contenant vos résultats de recherche</span>
                <select
                  value={p.sourceCollection?.key ?? ''}
                  onChange={(e) => {
                    const c = collections.find((x) => x.key === e.target.value);
                    update((cur) => ({ ...cur, sourceCollection: c ? { key: c.key, name: c.data.name } : null }));
                  }}
                >
                  <option value="">— Choisir —</option>
                  {tree.map(({ c, depth }) => (
                    <option key={c.key} value={c.key}>
                      {'  '.repeat(depth * 2)}
                      {depth ? '└ ' : ''}
                      {c.data.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="notice small">
              Conseil : créez dans Zotero une collection pour la revue, avec une <strong>sous-collection par source</strong>{' '}
              (ex. « PubMed », « Cairn », « Érudit », « Recherche par citations »). Chaque sous-collection sera comptée
              séparément dans le diagramme PRISMA. LitFlow ne modifie jamais ces collections : il crée à côté une collection
              « LitFlow – {p.name} ».
            </div>
            <div className="row">
              <button className="btn primary" disabled={!client || !p.sourceCollection || !!busy} onClick={doImport}>
                {total ? '⟳ Actualiser depuis Zotero' : 'Importer depuis Zotero'}
              </button>
              {total > 0 && client && (
                <button
                  className="btn"
                  disabled={!!busy}
                  onClick={() =>
                    run('Synchronisation…', async () => {
                      markDirty(Object.keys(p.records));
                      await syncNow(Object.keys(p.records));
                      setResult('Toutes les décisions ont été renvoyées vers Zotero.');
                    })
                  }
                >
                  Tout renvoyer vers Zotero
                </button>
              )}
              {busy && <span className="muted small">{busy}</span>}
            </div>
          </>
        )}
        {error && <div className="notice error">{error}</div>}
        {result && (
          <div className="notice">
            {result}{' '}
            <button className="btn small" onClick={onDone}>
              Passer aux doublons →
            </button>
          </div>
        )}
      </section>

      {p.sources.length > 0 && (
        <section className="panel stack">
          <h2>Sources ({total} références)</h2>
          <p className="small muted">
            <strong>Vérifiez le type de chaque source.</strong> Les « autres méthodes » (recherche par citations, sites web…) apparaissent dans
            la colonne de droite du diagramme PRISMA 2020 et passent directement à l’évaluation du texte intégral.
          </p>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Références</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {p.sources.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>{Object.values(p.records).filter((r) => r.sources.includes(s.name)).length}</td>
                  <td>
                    <select
                      value={s.kind}
                      onChange={(e) =>
                        update((cur) => ({
                          ...cur,
                          sources: cur.sources.map((x) => (x.name === s.name ? { ...x, kind: e.target.value as SourceKind } : x)),
                        }))
                      }
                    >
                      {KINDS.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
