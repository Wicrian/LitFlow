import type { RecordItem } from '../types';
import { normalizeDoi, normalizeForCompare, similarity } from './text';

export type MatchReason = 'doi' | 'title' | 'similar' | 'ai';

export interface DuplicateGroup {
  /** Identifiant stable du groupe (clés triées). */
  id: string;
  keys: string[];
  reason: MatchReason;
  /** Référence proposée par défaut comme « à conserver ». */
  suggestedKeep: string;
}

/** Score de complétude : on propose de garder la notice la plus riche. */
export function completeness(r: RecordItem): number {
  return (
    (r.abstract ? 4 : 0) +
    (r.doi ? 3 : 0) +
    (r.publication ? 1 : 0) +
    (r.pages ? 1 : 0) +
    (r.creators.length ? 1 : 0) +
    (r.language ? 0.5 : 0) +
    Math.min(r.abstract.length / 2000, 1)
  );
}

function firstAuthor(r: RecordItem): string {
  const c = r.creators[0];
  return normalizeForCompare(c?.lastName || c?.name || '');
}

/**
 * Détecte les doublons potentiels :
 *  1. même DOI ;
 *  2. même titre (sans tenir compte des accents, de la casse ni de la ponctuation) ;
 *  3. titres très proches (≥ 92 %) avec même année et même premier auteur.
 * Les accents sont ignorés pour la comparaison, jamais supprimés des données.
 */
export function findDuplicateGroups(records: RecordItem[], threshold = 0.92): DuplicateGroup[] {
  const parent = new Map<string, string>();
  const reasonOf = new Map<string, MatchReason>();
  const find = (k: string): string => {
    let p = parent.get(k) ?? k;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(k, p);
    return p;
  };
  const rank: Record<MatchReason, number> = { doi: 0, title: 1, similar: 2, ai: 3 };
  const union = (a: string, b: string, reason: MatchReason) => {
    const ra = find(a);
    const rb = find(b);
    const prev = reasonOf.get(ra) ?? reasonOf.get(rb);
    if (ra !== rb) parent.set(rb, ra);
    // On affiche la correspondance la plus fiable trouvée dans le groupe.
    const best = prev && rank[prev] < rank[reason] ? prev : reason;
    reasonOf.set(ra, best);
  };

  const byDoi = new Map<string, string>();
  const byTitle = new Map<string, string>();
  const blocks = new Map<string, { key: string; title: string }[]>();

  for (const r of records) {
    const doi = normalizeDoi(r.doi);
    if (doi) {
      const other = byDoi.get(doi);
      if (other) union(other, r.key, 'doi');
      else byDoi.set(doi, r.key);
    }
    const title = normalizeForCompare(r.title);
    if (title.length >= 15) {
      const other = byTitle.get(title);
      if (other) union(other, r.key, 'title');
      else byTitle.set(title, r.key);
      const block = `${r.year ?? ''}|${firstAuthor(r).slice(0, 4)}`;
      const list = blocks.get(block) ?? [];
      for (const o of list) {
        if (o.title !== title && similarity(o.title, title) >= threshold) union(o.key, r.key, 'similar');
      }
      list.push({ key: r.key, title });
      blocks.set(block, list);
    }
  }

  const groups = new Map<string, string[]>();
  for (const r of records) {
    if (!parent.has(r.key)) continue;
    const root = find(r.key);
    groups.set(root, [...(groups.get(root) ?? []), r.key]);
  }

  const byKey = new Map(records.map((r) => [r.key, r]));
  const out: DuplicateGroup[] = [];
  for (const [root, keys] of groups) {
    if (keys.length < 2) continue;
    const sorted = [...keys].sort();
    const suggestedKeep = [...keys].sort((a, b) => completeness(byKey.get(b)!) - completeness(byKey.get(a)!))[0];
    out.push({ id: sorted.join('+'), keys: sorted, reason: reasonOf.get(root) ?? 'similar', suggestedKeep });
  }
  return out.sort((a, b) => rank[a.reason] - rank[b.reason]);
}
