import type { Project, RecordItem } from '../types';
import { normalizeForCompare } from './text';

export type StatusFilter = 'all' | 'undecided' | 'include' | 'exclude' | 'maybe' | 'notretrieved';

export interface Filters {
  q: string;
  types: string[];
  languages: string[];
  sources: string[];
  yearMin: string;
  yearMax: string;
  abstract: '' | 'yes' | 'no';
  pagesMin: string;
  pagesMax: string;
  tag: string;
  screening: StatusFilter;
  fulltext: StatusFilter;
}

export const emptyFilters = (): Filters => ({
  q: '',
  types: [],
  languages: [],
  sources: [],
  yearMin: '',
  yearMax: '',
  abstract: '',
  pagesMin: '',
  pagesMax: '',
  tag: '',
  screening: 'all',
  fulltext: 'all',
});

/** Langue normalisée (« fr », « fre », « Français », « French » -> « fr »). */
export function langCode(l: string): string {
  const n = normalizeForCompare(l);
  if (!n) return '';
  if (/^(fr|fre|fra|francais|french)/.test(n)) return 'fr';
  if (/^(en|eng|anglais|english)/.test(n)) return 'en';
  if (/^(es|spa|espagnol|spanish|espanol)/.test(n)) return 'es';
  if (/^(de|ger|deu|allemand|german|deutsch)/.test(n)) return 'de';
  if (/^(pt|por|portugais|portuguese)/.test(n)) return 'pt';
  if (/^(it|ita|italien|italian)/.test(n)) return 'it';
  return n.slice(0, 12);
}

function statusMatches(f: StatusFilter, d: string | undefined, notRetrieved = false): boolean {
  if (f === 'all') return true;
  if (f === 'notretrieved') return notRetrieved;
  if (f === 'undecided') return !d && !notRetrieved;
  return d === f;
}

export function applyFilters(p: Project, records: RecordItem[], f: Filters): RecordItem[] {
  const q = normalizeForCompare(f.q);
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const [yMin, yMax, pMin, pMax] = [num(f.yearMin), num(f.yearMax), num(f.pagesMin), num(f.pagesMax)];
  const tag = normalizeForCompare(f.tag);
  return records.filter((r) => {
    if (f.types.length && !f.types.includes(r.itemType)) return false;
    if (f.languages.length && !f.languages.includes(langCode(r.language) || '?')) return false;
    if (f.sources.length && !r.sources.some((s) => f.sources.includes(s))) return false;
    if (yMin !== null && (r.year ?? -Infinity) < yMin) return false;
    if (yMax !== null && (r.year ?? Infinity) > yMax) return false;
    if (f.abstract === 'yes' && !r.abstract) return false;
    if (f.abstract === 'no' && r.abstract) return false;
    if (pMin !== null && (r.pageCount ?? -Infinity) < pMin) return false;
    if (pMax !== null && (r.pageCount ?? Infinity) > pMax) return false;
    if (tag && !r.zoteroTags.some((t) => normalizeForCompare(t).includes(tag))) return false;
    if (!statusMatches(f.screening, p.screening[r.key]?.decision)) return false;
    if (!statusMatches(f.fulltext, p.fulltext[r.key]?.decision, r.key in p.notRetrieved)) return false;
    if (q) {
      const hay = normalizeForCompare(
        `${r.title} ${r.abstract} ${r.publication} ${r.doi} ${r.creators.map((c) => `${c.lastName ?? ''} ${c.name ?? ''}`).join(' ')}`,
      );
      if (!q.split(' ').every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

/** Valeurs disponibles pour les listes de filtres, avec leur nombre. */
export function facetValues(records: RecordItem[]) {
  const count = (vals: string[]) => {
    const m = new Map<string, number>();
    vals.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  return {
    types: count(records.map((r) => r.itemType)),
    languages: count(records.map((r) => langCode(r.language) || '?')),
    sources: count(records.flatMap((r) => r.sources)),
  };
}

export type SortKey = 'title' | 'year' | 'author' | 'publication' | 'pages' | 'abstract' | 'source' | 'decided';

export function sortRecords(p: Project, records: RecordItem[], key: SortKey | '', dir: 1 | -1): RecordItem[] {
  if (!key) return records;
  const val = (r: RecordItem): string | number => {
    switch (key) {
      case 'title':
        return normalizeForCompare(r.title);
      case 'year':
        return r.year ?? 0;
      case 'author':
        return normalizeForCompare(r.creators[0]?.lastName ?? r.creators[0]?.name ?? '');
      case 'publication':
        return normalizeForCompare(r.publication);
      case 'pages':
        return r.pageCount ?? 0;
      case 'abstract':
        return r.abstract.length;
      case 'source':
        return r.sources.join(',');
      case 'decided':
        return p.screening[r.key]?.at ?? p.fulltext[r.key]?.at ?? '';
    }
  };
  return [...records].sort((a, b) => {
    const [x, y] = [val(a), val(b)];
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
}
