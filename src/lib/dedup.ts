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
    // La notice qui porte vos notes ou le PDF passe avant tout le reste.
    (r.numChildren ? 6 : 0) +
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

// ---- Aide à la décision : ce qui distingue les notices d'un groupe ----

export interface DupField {
  id: string;
  label: string;
  value: string;
}

const names = (r: RecordItem, editors: boolean) =>
  r.creators
    .filter((c) => (c.creatorType === 'editor' || c.creatorType === 'seriesEditor') === editors)
    .map((c) => c.lastName || c.name || '')
    .filter(Boolean);

/** Champs utiles pour reconnaître une notice, selon son type (livre, chapitre, article…). */
export function dupFields(r: RecordItem): DupField[] {
  const book = r.itemType === 'book' || r.itemType === 'bookSection';
  const f: DupField[] = [];
  const add = (id: string, label: string, value: string | undefined | null) => value && f.push({ id, label, value });
  const authors = names(r, false);
  const editors = names(r, true);
  add('authors', 'Auteurs', authors.length > 4 ? `${authors.slice(0, 4).join(', ')} et al.` : authors.join(', '));
  add('editors', 'Sous la dir. de', editors.join(', '));
  add('year', 'Année', r.year ? String(r.year) : r.date);
  if (r.itemType === 'bookSection') add('bookTitle', 'Dans le livre', r.bookTitle || r.publication);
  else add('publication', book ? 'Éditeur' : 'Publié dans', book ? r.publisher || r.publication : r.publication);
  if (r.itemType === 'bookSection') add('publisher', 'Éditeur', r.publisher);
  add('volume', 'Volume', [r.volume && `vol. ${r.volume}`, r.issue && `n° ${r.issue}`].filter(Boolean).join(', '));
  add('pages', 'Pages', r.pages);
  if (book) add('isbn', 'ISBN', r.isbn);
  add('doi', 'DOI', r.doi);
  add('abstract', 'Début du résumé', r.abstract ? r.abstract.slice(0, 160) + (r.abstract.length > 160 ? '…' : '') : '');
  return f;
}

/** Champs dont la valeur diffère d'une notice à l'autre (accents et casse ignorés). */
export function differingFields(records: RecordItem[]): Set<string> {
  const norm = (v: string) => normalizeForCompare(v).replace(/\s+/g, '');
  const byId = new Map<string, Set<string>>();
  for (const r of records) for (const fl of dupFields(r)) byId.set(fl.id, (byId.get(fl.id) ?? new Set()).add(norm(fl.value)));
  const out = new Set<string>();
  for (const [id, vals] of byId) {
    // Différent si les valeurs ne concordent pas ; une valeur absente d'un côté n'est pas une différence.
    if (vals.size > 1 && id !== 'abstract') out.add(id);
  }
  if (new Set(records.map((r) => r.itemType)).size > 1) out.add('type');
  return out;
}

/** Avertissement quand des notices ressemblent à des parties différentes d'un livre. */
export function partsWarning(records: RecordItem[]): string | null {
  const parts = records.filter((r) => r.itemType === 'bookSection');
  if (parts.length < 2) return null;
  const d = differingFields(parts);
  if (d.has('bookTitle')) return 'Ces chapitres viennent de livres différents : ce ne sont probablement pas des doublons.';
  if (d.has('pages')) return 'Même livre, mais pages différentes : il s’agit peut-être de deux chapitres distincts.';
  if (d.has('authors')) return 'Mêmes titre et livre, mais auteurs différents : vérifiez avant de confirmer.';
  return null;
}
