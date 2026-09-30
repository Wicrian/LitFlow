// Logique de l'assistant IA (fonctions pures, testées sans modèle).
//
// L'IA ne décide jamais à votre place : elle propose une suggestion et une
// raison lisible, que vous confirmez ou non.
//
// Deux modes :
//  * « critères » : compare le sens du titre/résumé à vos critères (PICO,
//    inclusion, exclusion) ;
//  * « apprentissage » : dès que vous avez inclus et exclu quelques références,
//    l'IA apprend de vos décisions (régression logistique) et explique sa
//    suggestion par la référence déjà triée qui ressemble le plus.

import type { Decision, Project, RecordItem } from '../types';
import type { DuplicateGroup } from '../lib/dedup';
import type { Vector } from './client';

export interface AiSuggestion {
  decision: Decision;
  /** Probabilité ou score relatif (0 à 1). */
  score: number;
  reason: string;
  mode: 'criteria' | 'learned';
  /** Date du calcul (pour ne comparer qu'aux décisions prises après). */
  at?: string;
}

export interface Criterion {
  label: string;
  kind: 'pos' | 'neg';
  text: string;
}

export const recordText = (r: RecordItem) => `passage: ${r.title}. ${r.abstract}`.trim();
export const titleText = (r: RecordItem) => `query: ${r.title}`;

/** Critères du protocole transformés en textes à comparer. */
export function buildCriteria(p: Project): Criterion[] {
  const out: Criterion[] = [];
  for (const el of p.framework.elements) {
    if (!el.description.trim() && !el.keywords.trim()) continue;
    const desc = [el.description, el.keywords].filter((x) => x.trim()).join(' – ');
    out.push({ label: `${el.letter} : ${desc}`, kind: 'pos', text: `query: ${el.label} : ${desc}` });
  }
  for (const c of p.inclusionCriteria) out.push({ label: c, kind: 'pos', text: `query: ${c}` });
  for (const c of p.exclusionCriteria) out.push({ label: c, kind: 'neg', text: `query: ${c}` });
  if (p.question.trim() && !out.some((c) => c.kind === 'pos'))
    out.push({ label: 'Question de recherche', kind: 'pos', text: `query: ${p.question}` });
  return out;
}

export function dot(a: Vector, b: Vector): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1;
};
const short = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Similarités record × critère, centrées-réduites par critère (z-scores). */
function criterionZ(vecs: Vector[], critVecs: Vector[]): number[][] {
  const sims = vecs.map((v) => critVecs.map((c) => dot(v, c)));
  const cols = critVecs.map((_, j) => sims.map((row) => row[j]));
  const stats = cols.map((col) => [mean(col), sd(col)]);
  return sims.map((row) => row.map((s, j) => (s - stats[j][0]) / stats[j][1]));
}

export interface TrainingExample {
  key: string;
  include: boolean;
  reason?: string;
}

/**
 * Régression logistique avec pondération des classes (les inclusions sont
 * rares) et régularisation L2. Renvoie les poids, le dernier étant le biais.
 */
export function trainLogistic(X: number[][], y: number[], { epochs = 300, lr = 0.5, l2 = 0.01 } = {}): number[] {
  const d = X[0]?.length ?? 0;
  const w = new Array(d + 1).fill(0);
  const pos = y.filter((v) => v === 1).length;
  const neg = y.length - pos;
  const weight = (v: number) => (v === 1 ? y.length / (2 * (pos || 1)) : y.length / (2 * (neg || 1)));
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(d + 1).fill(0);
    for (let i = 0; i < X.length; i++) {
      const p = sigmoid(predictRaw(w, X[i]));
      const g = (p - y[i]) * weight(y[i]);
      for (let j = 0; j < d; j++) grad[j] += g * X[i][j];
      grad[d] += g;
    }
    for (let j = 0; j <= d; j++) w[j] -= lr * (grad[j] / X.length + (j < d ? l2 * w[j] : 0));
  }
  return w;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
function predictRaw(w: number[], x: number[]): number {
  let s = w[w.length - 1];
  for (let j = 0; j < x.length; j++) s += w[j] * x[j];
  return s;
}

/**
 * Calcule une suggestion pour chaque référence de `keys`.
 * `vecs` : vecteur de chaque référence ; `critVecs` : vecteur de chaque critère.
 */
export function suggest(
  keys: string[],
  vecs: Map<string, Vector>,
  criteria: Criterion[],
  critVecs: Vector[],
  training: TrainingExample[],
  titles: Record<string, string>,
  minPerClass = 3,
): Record<string, AiSuggestion> {
  const ks = keys.filter((k) => vecs.has(k));
  if (!ks.length) return {};
  const V = ks.map((k) => vecs.get(k)!);
  // Z-scores calculés sur l'ensemble (à trier + déjà triées) pour être comparables.
  const allKeys = [...new Set([...ks, ...training.map((t) => t.key).filter((k) => vecs.has(k))])];
  const allZ = critVecs.length ? criterionZ(allKeys.map((k) => vecs.get(k)!), critVecs) : allKeys.map(() => []);
  const zOf = new Map(allKeys.map((k, i) => [k, allZ[i]]));
  const Z = ks.map((k) => zOf.get(k)!);
  const posIdx = criteria.map((c, j) => (c.kind === 'pos' ? j : -1)).filter((j) => j >= 0);
  const negIdx = criteria.map((c, j) => (c.kind === 'neg' ? j : -1)).filter((j) => j >= 0);

  const criteriaReason = (z: number[], decision: Decision): string => {
    if (!criteria.length) return '';
    const best = posIdx.length ? posIdx.reduce((a, b) => (z[b] > z[a] ? b : a)) : -1;
    const worst = posIdx.length ? posIdx.reduce((a, b) => (z[b] < z[a] ? b : a)) : -1;
    const neg = negIdx.length ? negIdx.reduce((a, b) => (z[b] > z[a] ? b : a)) : -1;
    if (decision === 'exclude') {
      if (neg >= 0 && z[neg] >= 1) return `Évoque le critère d’exclusion « ${short(criteria[neg].label)} »`;
      if (worst >= 0) return `Peu de lien avec « ${short(criteria[worst].label)} »`;
    }
    if (decision === 'include' && best >= 0) return `Proche de « ${short(criteria[best].label)} »`;
    if (best >= 0 && worst >= 0 && best !== worst)
      return `Proche de « ${short(criteria[best].label, 40)} » mais peu de lien avec « ${short(criteria[worst].label, 40)} »`;
    return best >= 0 ? `Lien moyen avec « ${short(criteria[best].label)} »` : '';
  };

  const nInc = training.filter((t) => t.include && vecs.has(t.key)).length;
  const nExc = training.filter((t) => !t.include && vecs.has(t.key)).length;
  const out: Record<string, AiSuggestion> = {};

  if (nInc >= minPerClass && nExc >= minPerClass) {
    // --- Mode apprentissage ---
    const train = training.filter((t) => vecs.has(t.key));
    const trainZ = train.map((t) => zOf.get(t.key)!);
    const feats = (v: Vector, z: number[]) => [...Array.from(v), ...z.map((x) => x * 0.1)];
    const w = trainLogistic(
      train.map((t, i) => feats(vecs.get(t.key)!, trainZ[i])),
      train.map((t) => (t.include ? 1 : 0)),
    );
    ks.forEach((k, i) => {
      const prob = sigmoid(predictRaw(w, feats(V[i], Z[i])));
      const decision: Decision = prob >= 0.6 ? 'include' : prob <= 0.35 ? 'exclude' : 'maybe';
      // Explication : la référence déjà triée la plus ressemblante.
      let nearest: TrainingExample | null = null;
      let bestSim = -Infinity;
      for (const t of train) {
        if (t.key === k || (decision !== 'maybe' && t.include !== (decision === 'include'))) continue;
        const s = dot(V[i], vecs.get(t.key)!);
        if (s > bestSim) [bestSim, nearest] = [s, t];
      }
      const parts: string[] = [];
      if (nearest)
        parts.push(
          `Ressemble à une référence que vous avez ${nearest.include ? 'incluse' : 'exclue'}${nearest.reason ? ` (${nearest.reason})` : ''} : « ${short(titles[nearest.key] ?? '', 60)} »`,
        );
      const cr = criteriaReason(Z[i], decision);
      if (cr) parts.push(cr);
      out[k] = { decision, score: prob, reason: parts.join(' · '), mode: 'learned' };
    });
    return out;
  }

  // --- Mode critères ---
  if (!criteria.length) return {};
  const raw = Z.map((z) => {
    const posMean = posIdx.length ? mean(posIdx.map((j) => z[j])) : 0;
    const negMax = negIdx.length ? Math.max(...negIdx.map((j) => z[j])) : 0;
    return posMean - 0.5 * Math.max(0, negMax);
  });
  const m = mean(raw);
  const s = sd(raw);
  ks.forEach((k, i) => {
    const z = (raw[i] - m) / s;
    const decision: Decision = z >= 0.5 ? 'include' : z <= -0.25 ? 'exclude' : 'maybe';
    out[k] = { decision, score: sigmoid(z), reason: criteriaReason(Z[i], decision), mode: 'criteria' };
  });
  return out;
}

/**
 * Doublons « de sens » : titres très proches par le sens (ex. un titre traduit,
 * une prépublication et l'article publié), à un an près.
 */
export function aiDuplicateGroups(records: RecordItem[], vecs: Map<string, Vector>, threshold: number): (DuplicateGroup & { score: number })[] {
  const rs = records.filter((r) => vecs.has(r.key));
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    while (parent.get(k) && parent.get(k) !== k) k = parent.get(k)!;
    return k;
  };
  const best = new Map<string, number>();
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const [a, b] = [rs[i], rs[j]];
      if (a.year && b.year && Math.abs(a.year - b.year) > 1) continue;
      const s = dot(vecs.get(a.key)!, vecs.get(b.key)!);
      if (s < threshold) continue;
      const [ra, rb] = [find(a.key), find(b.key)];
      if (ra !== rb) parent.set(rb, ra);
      parent.set(ra, ra);
      best.set(a.key, Math.max(best.get(a.key) ?? 0, s));
      best.set(b.key, Math.max(best.get(b.key) ?? 0, s));
    }
  }
  const groups = new Map<string, string[]>();
  for (const k of best.keys()) groups.set(find(k), [...(groups.get(find(k)) ?? []), k]);
  const byKey = new Map(rs.map((r) => [r.key, r]));
  return [...groups.values()]
    .filter((ks) => ks.length > 1)
    .map((ks) => {
      const keys = [...ks].sort();
      const richest = [...ks].sort((x, y) => byKey.get(y)!.abstract.length - byKey.get(x)!.abstract.length)[0];
      return { id: keys.join('+'), keys, reason: 'ai' as const, suggestedKeep: richest, score: Math.max(...ks.map((k) => best.get(k)!)) };
    });
}
