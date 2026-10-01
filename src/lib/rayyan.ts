// Import des décisions d'une revue Rayyan (fichier articles.csv de l'export).
//
// Seules les DÉCISIONS sont reprises : chaque ligne Rayyan est rapprochée d'une
// référence Zotero du projet (DOI, puis titre), et ce sont les notices Zotero,
// avec leurs accents d'origine, qui restent utilisées.

import type { Decision, Project, RecordItem } from '../types';
import { normalizeDoi, normalizeForCompare, similarity } from './text';

/** Lecteur CSV (guillemets, virgules et retours à la ligne dans les champs). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

export interface RayyanRecord {
  rayyanKey: string;
  title: string;
  year: number | null;
  doi: string;
  authors: string;
  /** Décision par personne (nom tel qu'affiché dans Rayyan). */
  decisions: Record<string, Decision>;
  reasons: string[];
  labels: string[];
}

const RANK: Record<Decision, number> = { exclude: 0, maybe: 1, include: 2 };
const DECISION: Record<string, Decision> = { included: 'include', excluded: 'exclude', maybe: 'maybe' };

function splitList(s: string | undefined): string[] {
  return (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Lit un fichier articles.csv exporté de Rayyan. */
export function parseRayyan(text: string): RayyanRecord[] {
  const rows = parseCsv(text);
  if (!rows.length || !('notes' in rows[0]) || !('title' in rows[0]))
    throw new Error('Ce fichier ne ressemble pas à un export Rayyan (fichier « articles.csv » attendu).');
  return rows.map((r) => {
    const notes = r.notes ?? '';
    const part = (name: string) => notes.match(new RegExp(`RAYYAN-${name}:\\s*([^|]*)`))?.[1]?.trim();
    const decisions: Record<string, Decision> = {};
    for (const [, who, d] of (part('INCLUSION') ?? '').matchAll(/"([^"]+)"\s*=>\s*"([^"]+)"/g)) {
      const dec = DECISION[d.toLowerCase()];
      if (dec) decisions[who] = dec;
    }
    return {
      rayyanKey: r.key ?? '',
      title: r.title ?? '',
      year: /^\d{4}$/.test((r.year ?? '').trim()) ? +r.year : null,
      doi: normalizeDoi(r.doi ?? ''),
      authors: r.authors ?? '',
      decisions,
      reasons: splitList(part('EXCLUSION-REASONS')),
      labels: splitList(part('LABELS')),
    };
  });
}

/** Titre comparable : sans accents, sans accolades BibTeX, sans ponctuation. */
const cmp = (s: string) => normalizeForCompare(s.replace(/[{}]/g, ''));

export type MatchKind = 'doi' | 'title' | 'close';

export interface RayyanMatch {
  rayyan: RayyanRecord;
  /** Références Zotero correspondantes (plusieurs = doublons dans Zotero). */
  keys: string[];
  kind: MatchKind | null;
  score: number;
}

/** Rapproche chaque ligne Rayyan des références Zotero du projet. */
export function matchRayyan(rayyan: RayyanRecord[], records: RecordItem[]): RayyanMatch[] {
  const byDoi = new Map<string, string[]>();
  const byTitle = new Map<string, string[]>();
  const prepared = records.map((r) => ({ r, t: cmp(r.title), full: cmp(`${r.title} ${r.publication}`) }));
  for (const { r, t } of prepared) {
    const d = normalizeDoi(r.doi);
    if (d) byDoi.set(d, [...(byDoi.get(d) ?? []), r.key]);
    if (t) byTitle.set(t, [...(byTitle.get(t) ?? []), r.key]);
  }
  return rayyan.map((ry) => {
    if (ry.doi && byDoi.has(ry.doi)) return { rayyan: ry, keys: byDoi.get(ry.doi)!, kind: 'doi', score: 1 };
    const t = cmp(ry.title);
    if (t && byTitle.has(t)) return { rayyan: ry, keys: byTitle.get(t)!, kind: 'title', score: 1 };
    // Rapprochement souple : titre très proche, ou titre Zotero + titre du livre (chapitres).
    let best: { key: string; score: number } | null = null;
    if (t.length >= 10) {
      for (const p of prepared) {
        if (ry.year && p.r.year && Math.abs(ry.year - p.r.year) > 1) continue;
        let s = Math.max(similarity(t, p.t), similarity(t, p.full));
        if (p.t.length >= 15 && t.startsWith(p.t)) s = Math.max(s, 0.9);
        if (!best || s > best.score) best = { key: p.r.key, score: s };
      }
    }
    if (best && best.score >= 0.8) return { rayyan: ry, keys: [best.key], kind: 'close', score: best.score };
    return { rayyan: ry, keys: [], kind: null, score: best?.score ?? 0 };
  });
}

export interface RayyanPlan {
  /** Décisions de tri à écrire (clé Zotero -> décision). */
  decisions: Record<string, { decision: Decision; reasons: string[]; labels: string[] }>;
  /** Doublons supplémentaires (plusieurs références Zotero pour une ligne Rayyan). */
  duplicates: Record<string, string>;
  skippedExisting: number;
}

/**
 * Prépare l'import : une décision par ligne Rayyan, posée sur une seule
 * référence Zotero ; les autres références qui lui correspondent (doublons
 * fusionnés par Rayyan) sont marquées comme doublons.
 */
export function planRayyanImport(
  p: Project,
  matches: RayyanMatch[],
  reviewer: string,
  opts: { overwrite: boolean; acceptClose: boolean },
): RayyanPlan {
  const decisions: RayyanPlan['decisions'] = {};
  const duplicates: Record<string, string> = {};
  let skippedExisting = 0;
  for (const m of matches) {
    if (!m.keys.length || (m.kind === 'close' && !opts.acceptClose)) continue;
    const d = m.rayyan.decisions[reviewer] ?? Object.values(m.rayyan.decisions)[0];
    if (!d) continue;
    // Garde la référence déjà « conservée » si LitFlow connaît déjà ces doublons.
    const keys = m.keys.filter((k) => p.records[k]);
    const keep = keys.find((k) => !(k in p.duplicates)) ?? keys[0];
    if (!keep) continue;
    for (const k of keys) if (k !== keep && !(k in p.duplicates)) duplicates[k] = keep;
    if (p.screening[keep] && !opts.overwrite) {
      skippedExisting++;
      continue;
    }
    // Deux lignes Rayyan pour la même référence : on garde la décision la plus inclusive.
    const prev = decisions[keep];
    if (prev && RANK[prev.decision] >= RANK[d]) {
      prev.labels = [...new Set([...prev.labels, ...m.rayyan.labels])];
      continue;
    }
    decisions[keep] = { decision: d, reasons: d === 'exclude' ? m.rayyan.reasons : [], labels: [...new Set([...(prev?.labels ?? []), ...m.rayyan.labels])] };
  }
  return { decisions, duplicates, skippedExisting };
}

export function reviewersOf(rayyan: RayyanRecord[]): string[] {
  const count = new Map<string, number>();
  for (const r of rayyan) for (const who of Object.keys(r.decisions)) count.set(who, (count.get(who) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]).map(([w]) => w);
}
