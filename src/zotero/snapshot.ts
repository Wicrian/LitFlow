// Sauvegarde du projet dans Zotero, pour le reprendre sur un autre appareil
// (iPad, autre ordinateur) ou après avoir perdu les données du navigateur.
//
// Le projet (protocole, raisons, décisions, notes, réglages) est compressé et
// rangé dans une ou plusieurs notes indépendantes de la collection
// « LitFlow – nom du projet », avec l'étiquette « LitFlow-projet ».
// Les références elles-mêmes ne sont pas copiées : elles sont relues dans
// Zotero au moment de la reprise, puis les étiquettes LF:… font foi.

import type { Project, ZoteroLibrary } from '../types';
import { upgradeProject } from '../lib/frameworks';
import type { ZoteroClient, ZItem } from './api';
import { mergeImport } from './mapping';
import { reconcileFromZotero } from './pull';
import { ensureCollections, importFromZotero } from './sync';

export const SNAPSHOT_TAG = 'LitFlow-projet';
const PART_SIZE = 150_000;
const MARK = 'litflow:v1';

// ---- Compression (deflate + base64) ----

async function deflate(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function inflate(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  return ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36));
}

/** Ce qui est sauvegardé : tout le projet sauf les références (relues dans Zotero). */
function payloadOf(p: Project) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { records, updatedAt, ...rest } = p;
  return {
    ...rest,
    sync: { ...p.sync, lastError: null, libraryVersion: null, lastPull: null, snapshotKeys: [], snapshotHash: null, lastSnapshot: null },
  };
}

export function snapshotHash(p: Project): string {
  return hash(JSON.stringify(payloadOf(p)));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function noteHtml(p: Project, stamp: string, id: string, k: number, n: number, chunk: string): string {
  return (
    `<h1>LitFlow – sauvegarde du projet « ${esc(p.name)} »${n > 1 ? ` (partie ${k}/${n})` : ''}</h1>` +
    `<p>Cette note permet de reprendre la revue dans LitFlow sur un autre appareil (bouton « Reprendre depuis Zotero »). ` +
    `Elle est mise à jour automatiquement : ne la modifiez pas et ne la supprimez pas.</p>` +
    `<p>Dernière mise à jour : ${new Date(stamp).toLocaleString('fr-CA')}</p>` +
    `<pre>${MARK}:${id}:${k}/${n}:${chunk}</pre>`
  );
}

/**
 * Écrit (ou met à jour) la sauvegarde dans Zotero si le projet a changé.
 * Renvoie les nouveaux réglages de sauvegarde, ou `null` si rien n'a changé.
 */
export interface SnapshotResult {
  sync: Pick<Project['sync'], 'snapshotKeys' | 'snapshotHash' | 'lastSnapshot'>;
  zoteroCollections: Project['zoteroCollections'];
}

export async function saveSnapshot(client: ZoteroClient, p: Project): Promise<SnapshotResult | null> {
  const h = snapshotHash(p);
  if (h === p.sync.snapshotHash && p.sync.snapshotKeys.length) return null;
  const zoteroCollections = p.zoteroCollections.root ? p.zoteroCollections : await ensureCollections(client, p);
  const stamp = new Date().toISOString();
  const id = Date.now().toString(36);
  const data = await deflate(JSON.stringify({ ...payloadOf(p), zoteroCollections, savedAt: stamp }));
  const chunks = Array.from({ length: Math.ceil(data.length / PART_SIZE) || 1 }, (_, i) => data.slice(i * PART_SIZE, (i + 1) * PART_SIZE));

  const existing = p.sync.snapshotKeys.length ? await client.itemsByKeys(p.sync.snapshotKeys) : [];
  const byKey = new Map(existing.map((n) => [n.key, n]));
  const reusable = p.sync.snapshotKeys.filter((k) => byKey.has(k));

  const writes = chunks.map((chunk, i) => {
    const note = noteHtml(p, stamp, id, i + 1, chunks.length, chunk);
    const key = reusable[i];
    return key
      ? { key, version: byKey.get(key)!.version, note }
      : { itemType: 'note', note, collections: [zoteroCollections.root], tags: [{ tag: SNAPSHOT_TAG }] };
  });
  // Parties devenues inutiles : vidées (jamais supprimées).
  for (const key of reusable.slice(chunks.length))
    writes.push({ key, version: byKey.get(key)!.version, note: '<p>LitFlow – ancienne partie de sauvegarde, inutilisée.</p>' });

  const res = await client.writeItems(writes);
  const failed = Object.values(res.failed);
  if (failed.length) throw new Error(`Sauvegarde dans Zotero impossible : ${failed[0].message}`);
  const keys = chunks.map((_, i) => res.successful[String(i)]?.key ?? reusable[i]).filter(Boolean);
  return { sync: { snapshotKeys: [...keys, ...reusable.slice(chunks.length)], snapshotHash: h, lastSnapshot: stamp }, zoteroCollections };
}

export interface FoundSnapshot {
  library: ZoteroLibrary;
  project: Project;
  savedAt: string;
  noteKeys: string[];
}

/** Lit les sauvegardes présentes dans une bibliothèque (la plus récente par projet). */
export async function readSnapshots(client: ZoteroClient, library: ZoteroLibrary): Promise<FoundSnapshot[]> {
  const notes: ZItem[] = await client.itemsWithTag(SNAPSHOT_TAG);
  const re = new RegExp(`${MARK}:([a-z0-9]+):(\\d+)/(\\d+):([A-Za-z0-9+/=\\s]+)`);
  const groups = new Map<string, { parts: string[]; n: number; keys: string[] }>();
  for (const it of notes) {
    const m = (it.data.note ?? '').match(re);
    if (!m) continue;
    const [, stamp, k, n, chunk] = m;
    const g = groups.get(stamp) ?? { parts: [], n: +n, keys: [] };
    g.parts[+k - 1] = chunk.replace(/\s+/g, '');
    g.keys.push(it.key);
    groups.set(stamp, g);
  }
  const byProject = new Map<string, FoundSnapshot>();
  for (const [stamp, g] of groups) {
    if (g.parts.filter(Boolean).length !== g.n) continue; // sauvegarde incomplète
    try {
      const data = JSON.parse(await inflate(g.parts.join('')));
      const savedAt: string = data.savedAt ?? new Date(parseInt(stamp, 36)).toISOString();
      const project = upgradeProject({ ...data, records: {}, updatedAt: savedAt } as Project);
      project.library = library;
      const prev = byProject.get(project.id);
      if (!prev || prev.savedAt < savedAt) byProject.set(project.id, { library, project, savedAt, noteKeys: g.keys });
    } catch {
      /* note abîmée : ignorée */
    }
  }
  return [...byProject.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * Reconstruit un projet complet : réglages de la sauvegarde + références relues
 * dans Zotero + décisions changées dans Zotero depuis la sauvegarde.
 */
export async function restoreSnapshot(client: ZoteroClient, found: FoundSnapshot, progress?: (m: string) => void): Promise<Project> {
  let p: Project = {
    ...found.project,
    sync: { ...found.project.sync, snapshotKeys: found.noteKeys, lastSnapshot: found.savedAt, snapshotHash: null },
  };
  const { records, sources, sourceMap, libraryVersion } = await importFromZotero(client, p, progress);
  const merged = mergeImport({ ...p, sources: sources.map((s) => p.sources.find((x) => x.name === s.name) ?? s) }, records).project;
  p = reconcileFromZotero(merged, records).project;
  return { ...p, sync: { ...p.sync, sourceMap, libraryVersion, lastPull: new Date().toISOString() }, updatedAt: new Date().toISOString() };
}
