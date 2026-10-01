import { useEffect, useState } from 'react';
import type { Project, Settings, ZoteroLibrary } from '../types';
import { ZoteroClient } from '../zotero/api';
import { readSnapshots, restoreSnapshot, type FoundSnapshot } from '../zotero/snapshot';

/** Reprendre une revue sauvegardée dans Zotero (autre appareil, navigateur vidé…). */
export function RestoreDialog({
  settings,
  localProjects,
  onClose,
  onOpen,
}: {
  settings: Settings;
  localProjects: Project[];
  onClose: () => void;
  onOpen: (p: Project) => void;
}) {
  const [found, setFound] = useState<FoundSnapshot[] | null>(null);
  const [status, setStatus] = useState('Recherche des revues sauvegardées dans vos bibliothèques Zotero…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const base = new ZoteroClient(settings.apiKey);
        const groups = await base.groups(settings.userId);
        const libraries: ZoteroLibrary[] = [
          { type: 'user', id: settings.userId, name: `Ma bibliothèque (${settings.username})` },
          ...groups.map((g) => ({ type: 'group' as const, id: String(g.id), name: `Groupe : ${g.data.name}` })),
        ];
        const all: FoundSnapshot[] = [];
        for (const lib of libraries) {
          setStatus(`Recherche dans « ${lib.name} »…`);
          all.push(...(await readSnapshots(new ZoteroClient(settings.apiKey, lib), lib)));
        }
        setFound(all.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
        setStatus('');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('');
      }
    })();
  }, [settings]);

  const restore = async (f: FoundSnapshot) => {
    const local = localProjects.find((p) => p.id === f.project.id);
    if (
      local &&
      !confirm(
        `Cette revue existe déjà sur cet appareil (modifiée le ${new Date(local.updatedAt).toLocaleString('fr-CA')}).\n\n` +
          `La remplacer par la version sauvegardée dans Zotero le ${new Date(f.savedAt).toLocaleString('fr-CA')} ?`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const p = await restoreSnapshot(new ZoteroClient(settings.apiKey, f.library), f, setStatus);
      onOpen(p);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h2>Reprendre une revue depuis Zotero</h2>
        <p className="small muted">
          LitFlow sauvegarde automatiquement chaque revue liée à Zotero dans une note de la collection « LitFlow – nom du
          projet ». Vous pouvez ainsi la reprendre sur un autre appareil (iPad, autre ordinateur) ou après avoir vidé votre
          navigateur. Vos décisions sont relues dans Zotero, y compris celles faites à la main avec les étiquettes LF:.
        </p>
        {status && <div className="small muted">⏳ {status}</div>}
        {error && <div className="notice error">{error}</div>}
        {found && found.length === 0 && (
          <div className="notice warn">
            Aucune revue sauvegardée trouvée. La sauvegarde se fait automatiquement depuis l’appareil où la revue a été créée,
            une fois celle-ci liée à une collection Zotero : ouvrez-la au moins une fois avec cette version de LitFlow.
          </div>
        )}
        {found?.map((f) => {
          const local = localProjects.find((p) => p.id === f.project.id);
          const decided = Object.keys(f.project.screening).length;
          return (
            <div key={`${f.library.type}${f.library.id}${f.project.id}`} className="project-card" style={{ cursor: 'default' }}>
              <div className="avatar">{f.project.name.trim().charAt(0).toUpperCase() || 'L'}</div>
              <div style={{ flex: 1 }}>
                <strong>{f.project.name}</strong>
                <div className="small muted">
                  {f.library.name} · sauvegardée le {new Date(f.savedAt).toLocaleString('fr-CA')} · {decided} décision(s) de tri
                  {local && ' · déjà sur cet appareil'}
                </div>
              </div>
              <button className="btn primary small" disabled={busy} onClick={() => restore(f)}>
                {local ? 'Remplacer' : 'Reprendre'}
              </button>
            </div>
          );
        })}
        <div className="row">
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
