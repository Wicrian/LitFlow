// Lancement des analyses IA sur un projet.
import type { Project } from '../types';
import { screeningKeys } from '../lib/prisma';
import { embed, type Progress, type Vector } from './client';
import { aiDuplicateGroups, buildCriteria, recordText, suggest, titleText, type TrainingExample } from './logic';

/** Suggestions pour les références pas encore triées (les anciennes suggestions sont conservées). */
export async function runSuggestions(p: Project, onProgress?: Progress): Promise<Project['ai']['suggestions']> {
  const keys = screeningKeys(p);
  const criteria = buildCriteria(p);
  const training: TrainingExample[] = p.ai.learn
    ? keys
        .filter((k) => p.screening[k] && p.screening[k].decision !== 'maybe')
        .map((k) => ({ key: k, include: p.screening[k].decision === 'include', reason: p.screening[k].reasons[0] }))
    : [];
  const target = keys.filter((k) => !p.screening[k]);
  const needVec = [...new Set([...target, ...training.map((t) => t.key)])];

  const vectors = await embed([...criteria.map((c) => c.text), ...needVec.map((k) => recordText(p.records[k]))], onProgress);
  const critVecs = vectors.slice(0, criteria.length);
  const vecs = new Map<string, Vector>(needVec.map((k, i) => [k, vectors[criteria.length + i]]));
  const titles = Object.fromEntries(needVec.map((k) => [k, p.records[k].title]));

  const at = new Date().toISOString();
  const fresh = suggest(target, vecs, criteria, critVecs, training, titles);
  const out = { ...p.ai.suggestions };
  for (const [k, s] of Object.entries(fresh)) out[k] = { ...s, at };
  return out;
}

/** Doublons proposés par l'IA parmi les références pas encore marquées comme doublons. */
export async function runAiDuplicates(p: Project, onProgress?: Progress) {
  const records = Object.values(p.records).filter((r) => !(r.key in p.duplicates) && r.title.trim());
  const vectors = await embed(records.map(titleText), onProgress);
  const vecs = new Map(records.map((r, i) => [r.key, vectors[i]]));
  return aiDuplicateGroups(records, vecs, p.ai.dupThreshold);
}
