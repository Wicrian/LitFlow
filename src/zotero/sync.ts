// Synchronisation LitFlow -> Zotero.
//
// Pour chaque référence, LitFlow calcule l'état attendu dans Zotero :
//   * les collections du projet (« 0 – Doublons », « 1 – Tri… », « 3 – Inclus… ») ;
//   * des étiquettes lisibles (« LF:tri:exclu », « LF:tri:raison:Hors sujet »…) ;
//   * éventuellement une note enfant « LitFlow » avec les raisons et les notes de lecture.
// Seuls ces éléments sont modifiés : les autres collections et étiquettes de
// l'utilisateur, les titres, résumés, etc. ne sont jamais touchés.

import type { Decision, Project, RecordItem, StageDecision } from '../types';
import { fulltextKeys } from '../lib/prisma';
import { ZoteroClient, type ZCollection, type ZItem, type ZItemData } from './api';
import { toRecord } from './mapping';

export type CollectionId =
  | 'root'
  | 'duplicates'
  | 'screening_include'
  | 'screening_exclude'
  | 'screening_maybe'
  | 'fulltext_exclude'
  | 'fulltext_maybe'
  | 'fulltext_notretrieved'
  | 'included';

export const COLLECTION_NAMES: Record<Exclude<CollectionId, 'root'>, string> = {
  duplicates: '0 – Doublons',
  screening_include: '1 – Tri titre-résumé · Inclus',
  screening_exclude: '1 – Tri titre-résumé · Exclus',
  screening_maybe: '1 – Tri titre-résumé · Incertains',
  fulltext_exclude: '2 – Texte intégral · Exclus',
  fulltext_maybe: '2 – Texte intégral · Incertains',
  fulltext_notretrieved: '2 – Texte intégral · Introuvables',
  included: '3 – Inclus dans la revue',
};

export const rootCollectionName = (p: Project) => `LitFlow – ${p.name}`;

const DECISION_TAG: Record<Decision, string> = { include: 'inclus', exclude: 'exclu', maybe: 'incertain' };
const DECISION_LABEL: Record<Decision, string> = { include: 'Inclus', exclude: 'Exclu', maybe: 'Incertain' };

export interface DesiredState {
  collections: CollectionId[];
  tags: string[];
}

/** État attendu dans Zotero pour une référence (fonction pure, testée). */
export function desiredState(p: Project, key: string, fulltextSet?: Set<string>): DesiredState {
  const pre = p.sync.tagPrefix.trim() || 'LF';
  const collections: CollectionId[] = [];
  const tags: string[] = [];

  for (const l of p.rayyanLabels?.[key] ?? []) tags.push(`${pre}:rayyan:${l}`);

  if (key in p.duplicates) {
    collections.push('duplicates');
    tags.push(`${pre}:doublon`);
    return { collections, tags };
  }

  const s = p.screening[key];
  if (s) {
    collections.push(`screening_${s.decision}` as CollectionId);
    tags.push(`${pre}:tri:${DECISION_TAG[s.decision]}`);
    for (const r of s.reasons) tags.push(`${pre}:tri:raison:${r}`);
  }

  const inFulltext = fulltextSet ? fulltextSet.has(key) : fulltextKeys(p).includes(key);
  if (inFulltext) {
    if (key in p.notRetrieved) {
      collections.push('fulltext_notretrieved');
      tags.push(`${pre}:texte:introuvable`);
    } else {
      const f = p.fulltext[key];
      if (f) {
        collections.push(f.decision === 'include' ? 'included' : (`fulltext_${f.decision}` as CollectionId));
        tags.push(`${pre}:texte:${DECISION_TAG[f.decision]}`);
        for (const r of f.reasons) tags.push(`${pre}:texte:raison:${r}`);
      }
    }
  }
  return { collections, tags: [...new Set(tags)] };
}

/** Calcule la mise à jour à envoyer, ou `null` si l'item est déjà à jour. */
export function buildItemPatch(
  p: Project,
  item: ZItem,
  desired: DesiredState,
): Pick<ZItemData, 'key' | 'version' | 'collections' | 'tags'> | null {
  const pre = (p.sync.tagPrefix.trim() || 'LF') + ':';
  const ours = new Set(Object.values(p.zoteroCollections));
  const current = item.data.collections ?? [];
  const wanted = desired.collections.map((c) => p.zoteroCollections[c]).filter(Boolean);
  const collections = [...current.filter((c) => !ours.has(c)), ...wanted];

  const currentTags = item.data.tags ?? [];
  const tags = [...currentTags.filter((t) => !t.tag.startsWith(pre)), ...desired.tags.map((tag) => ({ tag }))];

  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  if (sameSet(current, collections) && sameSet(currentTags.map((t) => t.tag), tags.map((t) => t.tag))) return null;
  return { key: item.key, version: item.version, collections, tags };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function stageHtml(title: string, d: StageDecision | undefined): string {
  if (!d) return '';
  const reasons = d.reasons.length ? ` — ${d.reasons.map(esc).join(' ; ')}` : '';
  const note = d.note.trim() ? `<p>${esc(d.note).replace(/\n/g, '<br/>')}</p>` : '';
  return `<p><strong>${title} :</strong> ${DECISION_LABEL[d.decision]}${reasons}</p>${note}`;
}

/** Contenu HTML de la note « LitFlow » attachée à l'item dans Zotero. */
export function noteHtml(p: Project, key: string): string | null {
  const s = p.screening[key];
  const f = p.fulltext[key];
  const hasContent = [s, f].some((d) => d && (d.note.trim() || d.reasons.length));
  if (!hasContent && !(key in p.notRetrieved)) return null;
  return (
    `<h2>LitFlow – ${esc(p.name)}</h2>` +
    stageHtml('Tri titre-résumé', s) +
    stageHtml('Texte intégral', f) +
    (key in p.notRetrieved ? `<p><strong>Texte intégral introuvable</strong> ${esc(p.notRetrieved[key])}</p>` : '')
  );
}

export interface SyncProgress {
  (message: string, done?: number, total?: number): void;
}

/** Crée (si besoin) l'arborescence de collections du projet dans Zotero. */
export async function ensureCollections(client: ZoteroClient, p: Project): Promise<Project['zoteroCollections']> {
  const existing = await client.collections();
  const byKey = new Map<string, ZCollection>(existing.map((c) => [c.key, c]));
  const ids = { ...p.zoteroCollections };

  let root = ids.root && byKey.has(ids.root) ? ids.root : undefined;
  if (!root) {
    root =
      existing.find((c) => !c.data.parentCollection && c.data.name === rootCollectionName(p))?.key ??
      (await client.createCollection(rootCollectionName(p)));
    ids.root = root;
  }
  for (const [id, name] of Object.entries(COLLECTION_NAMES)) {
    if (ids[id] && byKey.has(ids[id])) continue;
    ids[id] =
      existing.find((c) => c.data.parentCollection === root && c.data.name === name)?.key ??
      (await client.createCollection(name, root));
  }
  return ids;
}

const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export interface SyncResult {
  project: Project;
  updated: number;
  notes: number;
  failed: string[];
}

/**
 * Envoie vers Zotero l'état des références listées dans `keys`.
 * Les items sont relus juste avant l'écriture pour obtenir leur version
 * actuelle et ne jamais écraser une modification faite dans Zotero.
 */
export async function pushToZotero(
  client: ZoteroClient,
  project: Project,
  keys: string[],
  progress?: SyncProgress,
): Promise<SyncResult> {
  let p = project;
  progress?.('Vérification des collections…');
  const zoteroCollections = await ensureCollections(client, p);
  p = { ...p, zoteroCollections };

  const ftSet = new Set(fulltextKeys(p));
  const failed: string[] = [];
  let updated = 0;
  let notes = 0;
  const records = { ...p.records };
  const zoteroNotes = { ...p.zoteroNotes };
  const todo = keys.filter((k) => records[k]);

  let done = 0;
  for (const batch of chunk(todo, 50)) {
    progress?.('Envoi des décisions vers Zotero…', done, todo.length);
    const items = await client.itemsByKeys(batch);
    const patches = items
      .map((it) => buildItemPatch(p, it, desiredState(p, it.key, ftSet)))
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (patches.length) {
      const res = await client.writeItems(patches);
      for (const [i, f] of Object.entries(res.failed)) failed.push(`${patches[+i].key}: ${f.message}`);
      for (const it of Object.values(res.successful)) {
        updated++;
        const prev: RecordItem | undefined = records[it.key];
        if (prev) records[it.key] = { ...toRecord(it, prev.sources) };
      }
    }

    // Notes enfants
    if (p.sync.writeNotes) {
      const noteKeys = batch.map((k) => zoteroNotes[k]).filter(Boolean);
      const existingNotes = noteKeys.length ? await client.itemsByKeys(noteKeys) : [];
      const noteByKey = new Map(existingNotes.map((n) => [n.key, n]));
      const writes: Partial<ZItemData>[] = [];
      const parents: string[] = [];
      for (const k of batch) {
        const html = noteHtml(p, k);
        const existing = zoteroNotes[k] ? noteByKey.get(zoteroNotes[k]) : undefined;
        if (!html) continue;
        if (existing) {
          if (existing.data.note === html) continue;
          writes.push({ key: existing.key, version: existing.version, note: html });
        } else {
          writes.push({ itemType: 'note', parentItem: k, note: html, tags: [{ tag: `${p.sync.tagPrefix || 'LF'}:note` }] });
        }
        parents.push(k);
      }
      if (writes.length) {
        const res = await client.writeItems(writes);
        for (const [i, it] of Object.entries(res.successful)) {
          zoteroNotes[parents[+i]] = it.key;
          notes++;
        }
        for (const [i, f] of Object.entries(res.failed)) failed.push(`note ${parents[+i]}: ${f.message}`);
      }
    }
    done += batch.length;
  }
  progress?.('Synchronisation terminée', todo.length, todo.length);

  const failedKeys = new Set(failed.map((f) => f.replace(/^note /, '').split(':')[0]));
  return {
    project: {
      ...p,
      records,
      zoteroNotes,
      sync: {
        ...p.sync,
        pending: p.sync.pending.filter((k) => failedKeys.has(k) || !keys.includes(k)),
        lastSync: new Date().toISOString(),
        lastError: failed.length ? failed.slice(0, 5).join('\n') : null,
      },
    },
    updated,
    notes,
    failed,
  };
}

/**
 * Importe (ou rafraîchit) les références de la collection source et de ses
 * sous-collections. Chaque sous-collection de premier niveau devient une
 * « source » (ex. PubMed, Scopus, Cairn, Érudit…) pour le diagramme PRISMA.
 */
export async function importFromZotero(
  client: ZoteroClient,
  p: Project,
  progress?: SyncProgress,
): Promise<{ records: RecordItem[]; sources: Project['sources']; sourceMap: Record<string, string>; libraryVersion: number | null }> {
  if (!p.sourceCollection) throw new Error('Choisissez d’abord une collection source.');
  const all = await client.collections();
  const ours = new Set(Object.values(p.zoteroCollections));
  const childrenOf = (key: string) => all.filter((c) => c.data.parentCollection === key && !ours.has(c.key));
  const descendants = (key: string): string[] => childrenOf(key).flatMap((c) => [c.key, ...descendants(c.key)]);

  // collection -> nom de la source
  const plan: { key: string; source: string }[] = [{ key: p.sourceCollection.key, source: p.sourceCollection.name }];
  for (const top of childrenOf(p.sourceCollection.key)) {
    for (const k of [top.key, ...descendants(top.key)]) plan.push({ key: k, source: top.data.name });
  }

  const byKey = new Map<string, { item: ZItem; sources: Set<string> }>();
  for (const [i, { key, source }] of plan.entries()) {
    progress?.(`Lecture de « ${source} » (${i + 1}/${plan.length})…`);
    const items = await client.collectionItems(key, (d, t) => progress?.(`Lecture de « ${source} »…`, d, t));
    for (const it of items) {
      if (it.data.itemType === 'attachment' || it.data.itemType === 'note') continue;
      const entry = byKey.get(it.key) ?? { item: it, sources: new Set<string>() };
      entry.sources.add(source);
      byKey.set(it.key, entry);
    }
  }

  // Si des items sont à la fois dans la racine et dans une sous-collection, on garde la sous-collection.
  const records = [...byKey.values()].map(({ item, sources }) => {
    const list = [...sources];
    const specific = list.filter((s) => s !== p.sourceCollection!.name);
    return toRecord(item, specific.length ? specific : list);
  });

  const names = new Set(records.flatMap((r) => r.sources));
  const sources = [...names].map(
    (name) =>
      p.sources.find((s) => s.name === name) ?? {
        key: plan.find((x) => x.source === name)?.key ?? '',
        name,
        kind: guessKind(name),
      },
  );
  const sourceMap = Object.fromEntries(plan.map((x) => [x.key, x.source]));
  return { records, sources, sourceMap, libraryVersion: client.libraryVersion };
}

/**
 * Devine le type d'une source d'après le nom de sa sous-collection. Prudent :
 * en cas de doute c'est une base de données (Web of Science, Google Scholar…),
 * modifiable ensuite dans l'onglet Identification.
 */
export function guessKind(name: string): Project['sources'][number]['kind'] {
  const n = name.toLowerCase();
  if (/\b(clinicaltrials|prospero|registres?|registers?|registry|ictrp)\b/.test(n)) return 'register';
  if (
    /(citations?|boule de neige|snowball|liste de références|reference lists?|recherche manuelle|hand ?search|sites? web|websites?|expert|littérature grise|grey literature|gray literature)/.test(n)
  )
    return 'other';
  return 'database';
}
