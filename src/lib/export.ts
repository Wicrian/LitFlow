import type { Decision, Project } from '../types';
import { upgradeProject } from './frameworks';
import { authorsShort } from './text';
import { itemTypeLabel } from '../zotero/mapping';

const LABEL: Record<Decision, string> = { include: 'Inclus', exclude: 'Exclu', maybe: 'Incertain' };

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV encodé en UTF-8 avec BOM et séparateur « ; » : s'ouvre correctement dans
 * Excel/LibreOffice en français, accents compris.
 */
export function recordsCsv(p: Project): string {
  const head = [
    'Clé Zotero', 'Titre', 'Auteurs', 'Année', 'Type', 'Publication', 'Langue', 'DOI', 'Sources',
    'Doublon de', 'Tri', 'Raisons (tri)', 'Note (tri)', 'Introuvable',
    'Texte intégral', 'Raisons (texte intégral)', 'Note (texte intégral)', 'Suggestion IA (tri)', 'Raison IA',
    'Catégories', 'Marqueurs',
  ];
  const rows = Object.values(p.records).map((r) => {
    const s = p.screening[r.key];
    const f = p.fulltext[r.key];
    return [
      r.key, r.title, authorsShort(r.creators, 20), r.year ?? '', itemTypeLabel(r.itemType), r.publication, r.language,
      r.doi, r.sources.join(' | '), p.duplicates[r.key] ?? '',
      s ? LABEL[s.decision] : '', s?.reasons.join(' | ') ?? '', s?.note ?? '', r.key in p.notRetrieved ? 'oui' : '',
      f ? LABEL[f.decision] : '', f?.reasons.join(' | ') ?? '', f?.note ?? '',
      p.ai.suggestions[r.key] ? LABEL[p.ai.suggestions[r.key].decision] : '', p.ai.suggestions[r.key]?.reason ?? '',
      (p.organisation.assignments[r.key] ?? []).map((id) => p.organisation.categories.find((c) => c.id === id)?.name).filter(Boolean).join(' | '),
      (p.organisation.markerAssignments[r.key] ?? []).map((id) => p.organisation.markers.find((m) => m.id === id)?.name).filter(Boolean).join(' | '),
    ];
  });
  return '﻿' + [head, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
}

export function download(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);

export function exportProjectJson(p: Project) {
  download(`${safeFileName(p.name)}.litflow.json`, JSON.stringify({ format: 'litflow', version: 1, project: p }, null, 2), 'application/json');
}

export async function importProjectJson(file: File): Promise<Project> {
  const data = JSON.parse(await file.text());
  const p = data?.format === 'litflow' ? data.project : data;
  if (!p?.id || !p?.records) throw new Error('Ce fichier n’est pas une sauvegarde LitFlow.');
  return upgradeProject(p as Project);
}
