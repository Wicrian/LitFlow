import { describe, expect, it } from 'vitest';
import { aiDuplicateGroups, suggest, type Criterion } from '../src/ai/logic';
import { cohenKappa } from '../src/lib/agreement';
import { demoProject } from '../src/lib/demo';

// Petits vecteurs normalisés : axe 0 = sujet recherché, axe 1 = critère d'exclusion.
const v = (...xs: number[]) => {
  const n = Math.hypot(...xs);
  return Float32Array.from(xs.map((x) => x / n));
};

const criteria: Criterion[] = [
  { label: 'P : jeunes adultes', kind: 'pos', text: '' },
  { label: 'Études animales', kind: 'neg', text: '' },
];
const critVecs = [v(1, 0, 0.1), v(0, 1, 0.1)];

describe('assistant IA', () => {
  it('propose selon les critères, avec une raison', () => {
    const vecs = new Map([
      ['A', v(1, 0.05, 0.2)],
      ['B', v(0.9, 0.1, 0.3)],
      ['C', v(0.1, 1, 0.2)],
      ['D', v(0.5, 0.5, 0.5)],
      ['E', v(0.05, 0.9, 0.4)],
    ]);
    const s = suggest([...vecs.keys()], vecs, criteria, critVecs, [], {});
    expect(s.A.decision).toBe('include');
    expect(s.A.reason).toContain('jeunes adultes');
    expect(s.C.decision).toBe('exclude');
    expect(s.C.reason).toContain('Études animales');
    expect(s.A.mode).toBe('criteria');
  });

  it('apprend des décisions et cite la référence la plus proche', () => {
    const vecs = new Map<string, Float32Array>();
    const training = [];
    for (let i = 0; i < 4; i++) {
      vecs.set(`I${i}`, v(1, 0.1 * i, 0));
      vecs.set(`X${i}`, v(0, 1, 0.1 * i));
      training.push({ key: `I${i}`, include: true }, { key: `X${i}`, include: false, reason: 'Hors sujet' });
    }
    vecs.set('new1', v(0.95, 0.1, 0));
    vecs.set('new2', v(0.05, 1, 0.1));
    const titles = { X1: 'Une étude hors sujet' };
    const s = suggest(['new1', 'new2'], vecs, [], [], training, titles);
    expect(s.new1).toMatchObject({ decision: 'include', mode: 'learned' });
    expect(s.new2.decision).toBe('exclude');
    expect(s.new2.reason).toContain('exclue (Hors sujet)');
  });

  it('regroupe les titres de même sens, à un an près', () => {
    const p = demoProject();
    const recs = Object.values(p.records).slice(0, 3);
    recs[0].year = 2021;
    recs[1].year = 2021;
    recs[2].year = 2010;
    const vecs = new Map([
      [recs[0].key, v(1, 0, 0)],
      [recs[1].key, v(0.99, 0.05, 0)],
      [recs[2].key, v(0.99, 0.05, 0)], // même sens mais 11 ans d'écart
    ]);
    const g = aiDuplicateGroups(recs, vecs, 0.95);
    expect(g).toHaveLength(1);
    expect(g[0].keys).toEqual([recs[0].key, recs[1].key].sort());
    expect(g[0].reason).toBe('ai');
  });

  it('calcule le kappa de Cohen', () => {
    const k = cohenKappa([
      ['include', 'include'],
      ['exclude', 'exclude'],
      ['exclude', 'exclude'],
      ['include', 'exclude'],
    ]);
    expect(k.observed).toBe(0.75);
    expect(k.kappa).toBeCloseTo(0.5, 5);
  });
});
