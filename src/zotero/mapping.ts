import type { Project, RecordItem } from '../types';
import { parsePageCount, parseYear } from '../lib/text';
import type { ZItem } from './api';

/** Convertit un item Zotero en référence LitFlow, sans modifier aucun texte. */
export function toRecord(item: ZItem, sources: string[]): RecordItem {
  const d = item.data;
  return {
    key: item.key,
    version: item.version,
    itemType: d.itemType,
    title: d.title ?? '',
    creators: (d.creators ?? []).map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName,
      name: c.name,
      creatorType: c.creatorType,
    })),
    date: d.date ?? '',
    year: parseYear(d.date ?? ''),
    abstract: d.abstractNote ?? '',
    doi: d.DOI ?? extractDoiFromExtra(d.extra ?? ''),
    url: d.url ?? '',
    publication: d.publicationTitle || d.bookTitle || d.proceedingsTitle || d.university || d.publisher || '',
    language: d.language ?? '',
    pages: d.pages ?? '',
    pageCount: parsePageCount(d.pages ?? '', d.numPages),
    zoteroTags: (d.tags ?? []).map((t) => t.tag),
    collections: d.collections ?? [],
    sources,
  };
}

function extractDoiFromExtra(extra: string): string {
  return extra.match(/^DOI:\s*(\S+)/im)?.[1] ?? '';
}

/**
 * Fusionne une nouvelle importation avec le projet : les métadonnées sont
 * rafraîchies, les décisions existantes sont conservées.
 */
export function mergeImport(p: Project, incoming: RecordItem[]): { project: Project; added: number; updated: number } {
  const records = { ...p.records };
  let added = 0;
  let updated = 0;
  for (const r of incoming) {
    if (records[r.key]) updated++;
    else added++;
    records[r.key] = r;
  }
  return { project: { ...p, records }, added, updated };
}

export const ITEM_TYPE_LABELS: Record<string, string> = {
  journalArticle: 'Article de revue',
  book: 'Livre',
  bookSection: 'Chapitre de livre',
  thesis: 'Thèse / mémoire',
  report: 'Rapport',
  conferencePaper: 'Communication de colloque',
  webpage: 'Page web',
  document: 'Document',
  preprint: 'Prépublication',
  magazineArticle: 'Article de magazine',
  newspaperArticle: 'Article de journal',
  manuscript: 'Manuscrit',
  presentation: 'Présentation',
  dataset: 'Jeu de données',
  blogPost: 'Billet de blog',
  encyclopediaArticle: 'Article d’encyclopédie',
  dictionaryEntry: 'Entrée de dictionnaire',
  statute: 'Loi',
  case: 'Jurisprudence',
  videoRecording: 'Vidéo',
  standard: 'Norme',
};

export const itemTypeLabel = (t: string) => ITEM_TYPE_LABELS[t] ?? t;
