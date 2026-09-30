// Synchronisation Zotero -> LitFlow.
//
// Si vous ajoutez ou retirez dans Zotero une étiquette « LF:… » ou déplacez un item
// dans une collection « LitFlow – … », LitFlow reprend ce changement.
//
// Règle : on compare l'état de l'item dans Zotero à ce que LitFlow y a écrit.
// Tout ce qui diffère a été changé par vous dans Zotero et est adopté, étape par étape.
// Une référence modifiée dans LitFlow et pas encore envoyée (« en attente ») garde
// la décision de LitFlow.

import type { Decision, Project, RecordItem, StageDecision } from '../types';
import { fulltextKeys } from '../lib/prisma';
import type { ZoteroClient } from './api';
import { mergeImport, toRecord } from './mapping';
import { desiredState, type CollectionId } from './sync';

const TAG_DECISION: Record<string, Decision> = { inclus: 'include', exclu: 'exclude', incertain: 'maybe' };

type StageState = { decision: Decision | 'notretrieved' | null; reasons: string[] };
interface ItemState {
  duplicate: boolean;
  screening: StageState;
  fulltext: StageState;
}

/** Lit l'état exprimé par des étiquettes « LF:… ». */
export function stateFromTags(prefix: string, tags: string[]): ItemState {
  const pre = `${prefix}:`;
  const s: ItemState = { duplicate: false, screening: { decision: null, reasons: [] }, fulltext: { decision: null, reasons: [] } };
  // Plusieurs décisions pour une même étape : on les garde toutes, le choix se fait par comparaison.
  for (const raw of tags) {
    if (!raw.startsWith(pre)) continue;
    const t = raw.slice(pre.length);
    if (t === 'doublon') s.duplicate = true;
    let m = t.match(/^tri:raison:(.+)$/);
    if (m) s.screening.reasons.push(m[1]);
    m = t.match(/^texte:raison:(.+)$/);
    if (m) s.fulltext.reasons.push(m[1]);
  }
  return s;
}

function decisionTags(prefix: string, tags: string[], stage: 'tri' | 'texte'): string[] {
  const pre = `${prefix}:${stage}:`;
  return tags
    .filter((t) => t.startsWith(pre))
    .map((t) => t.slice(pre.length))
    .filter((t) => t in TAG_DECISION || (stage === 'texte' && t === 'introuvable'));
}

const SCREENING_COLS: Record<string, Decision> = {
  screening_include: 'include',
  screening_exclude: 'exclude',
  screening_maybe: 'maybe',
};
const FULLTEXT_COLS: Record<string, Decision | 'notretrieved'> = {
  included: 'include',
  fulltext_exclude: 'exclude',
  fulltext_maybe: 'maybe',
  fulltext_notretrieved: 'notretrieved',
};

/**
 * Choisit la décision d'une étape : celle qui est apparue dans Zotero par rapport
 * à l'état attendu. Renvoie `undefined` si rien n'a changé pour cette étape.
 */
function pickChange<T extends string>(zotero: T[], local: T[]): T | null | undefined {
  const added = zotero.filter((d) => !local.includes(d));
  if (added.length) return added[added.length - 1];
  const removed = local.filter((d) => !zotero.includes(d));
  if (removed.length) return zotero[0] ?? null;
  return undefined;
}

export interface Reconciled {
  project: Project;
  changed: string[];
}

/** Applique à `p` les changements faits dans Zotero pour les références données. */
export function reconcileFromZotero(p: Project, records: RecordItem[]): Reconciled {
  if (!p.sync.lastSync || !Object.keys(p.zoteroCollections).length) return { project: p, changed: [] };
  const prefix = p.sync.tagPrefix.trim() || 'LF';
  const pending = new Set(p.sync.pending);
  const colIdOf = new Map(Object.entries(p.zoteroCollections).map(([id, key]) => [key, id as CollectionId]));
  const ftSet = new Set(fulltextKeys(p));

  let screening = p.screening;
  let fulltext = p.fulltext;
  let duplicates = p.duplicates;
  let notRetrieved = p.notRetrieved;
  const changed = new Set<string>();

  const setStage = (stage: 'screening' | 'fulltext', key: string, value: StageDecision | null) => {
    const map = { ...(stage === 'screening' ? screening : fulltext) };
    if (value) map[key] = value;
    else delete map[key];
    if (stage === 'screening') screening = map;
    else fulltext = map;
  };

  for (const r of records) {
    const key = r.key;
    if (pending.has(key) || !p.records[key]) continue;
    const local = desiredState(p, key, ftSet);
    const localTags = local.tags;
    const zTags = r.zoteroTags.filter((t) => t.startsWith(`${prefix}:`));
    const zCols = r.collections.map((c) => colIdOf.get(c)).filter((c): c is CollectionId => !!c && c !== 'root');
    const now = new Date().toISOString();

    // --- Doublon ---
    const zDup = zTags.includes(`${prefix}:doublon`) || zCols.includes('duplicates');
    const lDup = key in duplicates;
    const tagDupChanged = zTags.includes(`${prefix}:doublon`) !== localTags.includes(`${prefix}:doublon`);
    const colDupChanged = zCols.includes('duplicates') !== local.collections.includes('duplicates');
    if ((tagDupChanged || colDupChanged) && zDup !== lDup) {
      duplicates = { ...duplicates };
      if (zDup) duplicates[key] = '';
      else delete duplicates[key];
      changed.add(key);
    }

    // --- Étapes ---
    for (const stage of ['screening', 'fulltext'] as const) {
      const tagStage = stage === 'screening' ? 'tri' : 'texte';
      const cols = stage === 'screening' ? SCREENING_COLS : FULLTEXT_COLS;
      const zFromTags = decisionTags(prefix, zTags, tagStage).map((t) => (t === 'introuvable' ? 'notretrieved' : TAG_DECISION[t]));
      const lFromTags = decisionTags(prefix, localTags, tagStage).map((t) => (t === 'introuvable' ? 'notretrieved' : TAG_DECISION[t]));
      const zFromCols = zCols.filter((c) => c in cols).map((c) => cols[c]);
      const lFromCols = local.collections.filter((c) => c in cols).map((c) => cols[c]);

      const fromTag = pickChange(zFromTags, lFromTags);
      const next = fromTag !== undefined ? fromTag : pickChange(zFromCols, lFromCols);

      const zReasons = stateFromTags(prefix, zTags)[stage].reasons;
      const lReasons = stateFromTags(prefix, localTags)[stage].reasons;
      const reasonsChanged = zReasons.length !== lReasons.length || zReasons.some((x) => !lReasons.includes(x));

      const cur = (stage === 'screening' ? screening : fulltext)[key];
      const curNR = key in notRetrieved;
      if (next === undefined) {
        // Seules les raisons ont changé dans Zotero.
        if (reasonsChanged && cur) {
          setStage(stage, key, { ...cur, reasons: zReasons, at: now });
          changed.add(key);
        }
        continue;
      }
      if (next === 'notretrieved') {
        if (!curNR) {
          notRetrieved = { ...notRetrieved, [key]: now.slice(0, 10) };
          setStage(stage, key, null);
          changed.add(key);
        }
        continue;
      }
      if (stage === 'fulltext' && curNR) {
        notRetrieved = { ...notRetrieved };
        delete notRetrieved[key];
        changed.add(key);
      }
      if (next === null) {
        if (cur) {
          setStage(stage, key, null);
          changed.add(key);
        }
        continue;
      }
      if (cur?.decision !== next || reasonsChanged) {
        const reasons = cur?.decision === next ? zReasons : zReasons.filter((x) => !lReasons.includes(x));
        setStage(stage, key, { decision: next, reasons, note: cur?.note ?? '', at: now });
        changed.add(key);
      }
    }
  }

  if (!changed.size) return { project: p, changed: [] };
  return { project: { ...p, screening, fulltext, duplicates, notRetrieved }, changed: [...changed] };
}

/**
 * Lit dans Zotero uniquement ce qui a changé depuis la dernière lecture :
 * nouvelles références ajoutées aux collections sources, et références
 * du projet modifiées (par exemple des étiquettes ajoutées à la main).
 */
export async function fetchChanges(client: ZoteroClient, p: Project): Promise<{ incoming: RecordItem[]; libraryVersion: number | null }> {
  if (p.sync.libraryVersion === null) return { incoming: [], libraryVersion: null };
  const items = await client.itemsSince(p.sync.libraryVersion);
  const sourceKeys = new Set(Object.keys(p.sync.sourceMap));
  const incoming: RecordItem[] = [];
  for (const it of items) {
    if (it.data.itemType === 'attachment' || it.data.itemType === 'note') continue;
    const cols = it.data.collections ?? [];
    const sources = [...new Set(cols.filter((c) => sourceKeys.has(c)).map((c) => p.sync.sourceMap[c]))];
    const known = p.records[it.key];
    if (!known && !sources.length) continue;
    const specific = sources.filter((s) => s !== p.sourceCollection?.name);
    incoming.push(toRecord(it, known?.sources ?? (specific.length ? specific : sources)));
  }
  return { incoming, libraryVersion: client.libraryVersion };
}

/** Intègre au projet les références lues par `fetchChanges`. */
export function applyChanges(
  p: Project,
  incoming: RecordItem[],
  libraryVersion: number | null,
): { project: Project; changed: string[]; added: number } {
  // Ignore les versions plus anciennes que celle que LitFlow connaît déjà
  // (ex. lecture commencée avant un envoi de LitFlow).
  incoming = incoming.filter((r) => !p.records[r.key] || r.version >= p.records[r.key].version);
  const { project: merged, added } = mergeImport(p, incoming);
  const { project, changed } = reconcileFromZotero(merged, incoming);
  return {
    project: {
      ...project,
      sync: { ...project.sync, libraryVersion: libraryVersion ?? p.sync.libraryVersion, lastPull: new Date().toISOString() },
    },
    changed,
    added,
  };
}
