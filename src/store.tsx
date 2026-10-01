// État partagé du projet ouvert : sauvegarde automatique locale et
// synchronisation automatique vers Zotero.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Decision, Project, Settings, Stage, StageDecision } from './types';
import { saveProject } from './lib/storage';
import { ZoteroClient } from './zotero/api';
import { pushToZotero } from './zotero/sync';
import { applyChanges, fetchChanges } from './zotero/pull';
import { saveSnapshot } from './zotero/snapshot';

export type SyncStatus = { state: 'off' | 'idle' | 'pending' | 'syncing' | 'error'; message?: string; done?: number; total?: number };

interface Ctx {
  project: Project;
  settings: Settings;
  client: ZoteroClient | null;
  update: (fn: (p: Project) => Project) => void;
  /** Enregistre une décision (ou l'efface si `decision` est null). */
  decide: (stage: Stage, key: string, value: Omit<StageDecision, 'at'> | null) => void;
  /** Ajoute une raison à la liste mémorisée. */
  rememberReason: (stage: Stage, decision: Decision, reason: string) => void;
  markDirty: (keys: string[]) => void;
  syncNow: (keys?: string[]) => Promise<void>;
  syncStatus: SyncStatus;
  pullNow: () => Promise<void>;
  /** Sauvegarde le projet dans Zotero (pour le reprendre sur un autre appareil). */
  saveSnapshotNow: () => Promise<void>;
  snapshotError: string | null;
  /** Résumé de la dernière lecture de changements venus de Zotero. */
  pullInfo: { changed: number; added: number } | null;
  clearPullInfo: () => void;
}

const ProjectContext = createContext<Ctx | null>(null);

export function useProject(): Ctx {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject hors de ProjectProvider');
  return ctx;
}

export function ProjectProvider({ initial, settings, children }: { initial: Project; settings: Settings; children: ReactNode }) {
  const [project, setProject] = useState(initial);
  const ref = useRef(project);
  ref.current = project;
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' });
  const syncing = useRef(false);
  const pulling = useRef(false);
  const snapshotting = useRef(false);
  const [pullInfo, setPullInfo] = useState<{ changed: number; added: number } | null>(null);
  const dirtyDuringSync = useRef(new Set<string>());

  const client = useMemo(
    () => (settings.apiKey && project.library ? new ZoteroClient(settings.apiKey, project.library) : null),
    [settings.apiKey, project.library],
  );

  const update = useCallback((fn: (p: Project) => Project) => {
    setProject((p) => ({ ...fn(p), updatedAt: new Date().toISOString() }));
  }, []);

  const markDirty = useCallback(
    (keys: string[]) => {
      if (syncing.current) keys.forEach((k) => dirtyDuringSync.current.add(k));
      update((p) => ({ ...p, sync: { ...p.sync, pending: [...new Set([...p.sync.pending, ...keys])] } }));
    },
    [update],
  );

  const decide = useCallback<Ctx['decide']>(
    (stage, key, value) => {
      update((p) => {
        const map = { ...p[stage] };
        if (value) map[key] = { ...value, at: new Date().toISOString() };
        else delete map[key];
        return { ...p, [stage]: map };
      });
      markDirty([key]);
    },
    [update, markDirty],
  );

  const rememberReason = useCallback<Ctx['rememberReason']>(
    (stage, decision, reason) => {
      update((p) => {
        const list = p.reasons[stage][decision];
        if (list.includes(reason)) return p;
        return { ...p, reasons: { ...p.reasons, [stage]: { ...p.reasons[stage], [decision]: [...list, reason] } } };
      });
    },
    [update],
  );

  // Sauvegarde locale (légèrement différée pour ne pas écrire à chaque frappe).
  useEffect(() => {
    const t = setTimeout(() => void saveProject(project), 400);
    return () => clearTimeout(t);
  }, [project]);

  const syncNow = useCallback(
    async (keys?: string[]) => {
      if (!client || syncing.current) return;
      // Évite de créer deux fois les collections si une sauvegarde est en cours.
      if (snapshotting.current) {
        setTimeout(() => void syncNow(keys), 2000);
        return;
      }
      const start = ref.current;
      const toSend = keys ?? start.sync.pending;
      if (!toSend.length) return;
      syncing.current = true;
      dirtyDuringSync.current = new Set();
      setSyncStatus({ state: 'syncing', message: 'Synchronisation…' });
      try {
        const res = await pushToZotero(client, start, toSend, (message, done, total) =>
          setSyncStatus({ state: 'syncing', message, done, total }),
        );
        const failed = new Set(res.failed.map((f) => f.replace(/^note /, '').split(':')[0]));
        const sent = new Set(toSend);
        setProject((cur) => {
          const records = { ...cur.records };
          for (const k of sent) if (res.project.records[k]) records[k] = res.project.records[k];
          return {
            ...cur,
            records,
            zoteroCollections: res.project.zoteroCollections,
            zoteroNotes: { ...cur.zoteroNotes, ...res.project.zoteroNotes },
            sync: {
              ...cur.sync,
              pending: cur.sync.pending.filter((k) => !sent.has(k) || failed.has(k) || dirtyDuringSync.current.has(k)),
              lastSync: res.project.sync.lastSync,
              lastError: res.project.sync.lastError,
            },
          };
        });
        setSyncStatus(res.failed.length ? { state: 'error', message: res.failed.slice(0, 3).join('\n') } : { state: 'idle' });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setProject((cur) => ({ ...cur, sync: { ...cur.sync, lastError: message } }));
        setSyncStatus({ state: 'error', message });
      } finally {
        syncing.current = false;
      }
    },
    [client],
  );

  // Lecture des changements faits dans Zotero (étiquettes, collections, nouvelles références).
  const pullNow = useCallback(async () => {
    if (!client || syncing.current || pulling.current) return;
    const start = ref.current;
    if (start.sync.libraryVersion === null) return;
    pulling.current = true;
    try {
      const { incoming, libraryVersion } = await fetchChanges(client, start);
      if (!incoming.length) {
        setProject((cur) => ({ ...cur, sync: { ...cur.sync, libraryVersion: libraryVersion ?? cur.sync.libraryVersion } }));
        return;
      }
      const preview = applyChanges(ref.current, incoming, libraryVersion);
      setProject((cur) => applyChanges(cur, incoming, libraryVersion).project);
      if (preview.changed.length || preview.added) setPullInfo({ changed: preview.changed.length, added: preview.added });
    } catch (e) {
      setSyncStatus({ state: 'error', message: `Lecture depuis Zotero : ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      pulling.current = false;
    }
  }, [client]);

  // Sauvegarde du projet dans Zotero, 15 secondes après la dernière modification.
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const saveSnapshotNow = useCallback(async () => {
    const cur = ref.current;
    if (!client || !cur.library || !cur.sourceCollection || syncing.current || snapshotting.current) return;
    snapshotting.current = true;
    try {
      const res = await saveSnapshot(client, cur);
      if (res)
        setProject((c) => ({ ...c, zoteroCollections: { ...c.zoteroCollections, ...res.zoteroCollections }, sync: { ...c.sync, ...res.sync } }));
      setSnapshotError(null);
    } catch (e) {
      setSnapshotError(e instanceof Error ? e.message : String(e));
    } finally {
      snapshotting.current = false;
    }
  }, [client]);
  useEffect(() => {
    if (!client || !project.library || !project.sourceCollection) return;
    const t = setTimeout(() => void saveSnapshotNow(), 15000);
    return () => clearTimeout(t);
  }, [client, project, saveSnapshotNow]);

  // À l'ouverture puis toutes les 45 secondes quand la page est visible.
  useEffect(() => {
    if (!client) return;
    void pullNow();
    const t = setInterval(() => document.visibilityState === 'visible' && void pullNow(), 45000);
    const onVisible = () => document.visibilityState === 'visible' && void pullNow();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [client, pullNow]);

  // Synchronisation automatique quelques secondes après la dernière décision.
  useEffect(() => {
    if (!client || !project.sync.auto || !project.sync.pending.length) return;
    const t = setTimeout(() => void syncNow(), 3000);
    return () => clearTimeout(t);
  }, [client, project.sync.auto, project.sync.pending, syncNow]);

  const status: SyncStatus = !client
    ? { state: 'off' }
    : syncStatus.state === 'idle' && project.sync.pending.length
      ? { state: 'pending', message: `${project.sync.pending.length} modification(s) à envoyer` }
      : syncStatus;

  const value: Ctx = { project, settings, client, update, decide, rememberReason, markDirty, syncNow, syncStatus: status, pullNow, pullInfo, clearPullInfo: () => setPullInfo(null), saveSnapshotNow, snapshotError };
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
