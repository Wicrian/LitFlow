// Lecture des notes et surlignages Zotero d'une référence, pour les afficher
// dans LitFlow (lecture seule : rien n'est modifié dans Zotero).

import type { ZItem } from '../zotero/api';

export interface UserNote {
  key: string;
  text: string;
  modified: string;
}

export interface Highlight {
  key: string;
  text: string;
  comment: string;
  color: string;
  page: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** HTML d'une note Zotero → texte brut (paragraphes conservés, jamais interprété comme HTML). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Notes rédigées par la personne (on écarte la note générée par LitFlow). */
export function userNotes(children: ZItem[], litflowNoteKey?: string): UserNote[] {
  return children
    .filter((c) => c.data.itemType === 'note' && c.key !== litflowNoteKey && !/^\s*<h2>LitFlow – /.test(c.data.note ?? ''))
    .map((c) => ({ key: c.key, text: htmlToText(c.data.note ?? ''), modified: String(c.data.dateModified ?? '') }))
    .filter((n) => n.text);
}

/** Pièces jointes susceptibles de porter des annotations (PDF, EPUB, page web enregistrée). */
export function annotatableAttachments(children: ZItem[]): string[] {
  return children
    .filter((c) => c.data.itemType === 'attachment' && c.data.linkMode !== 'linked_url')
    .filter((c) => /pdf|epub|html/i.test(String(c.data.contentType ?? '')))
    .map((c) => c.key);
}

/** Surlignages et commentaires faits dans le lecteur de Zotero, dans l'ordre du document. */
export function highlights(annotations: ZItem[]): Highlight[] {
  return annotations
    .filter((a) => a.data.itemType === 'annotation')
    .map((a) => ({
      key: a.key,
      text: String(a.data.annotationText ?? '').trim(),
      comment: htmlToText(String(a.data.annotationComment ?? '')),
      color: String(a.data.annotationColor ?? '#ffd400'),
      page: String(a.data.annotationPageLabel ?? ''),
      sort: String(a.data.annotationSortIndex ?? ''),
    }))
    .filter((h) => h.text || h.comment)
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .map(({ sort: _sort, ...h }) => h);
}
