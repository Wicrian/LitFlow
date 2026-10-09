import { describe, expect, it } from 'vitest';
import { demoProject } from '../src/lib/demo';
import { firstView, guideSteps, newGuide, visibleViews, type ViewId } from '../src/lib/guide';

const ALL: ViewId[] = ['protocol', 'search', 'import', 'dedup', 'screening', 'fulltext', 'organisation', 'records', 'prisma'];

describe('parcours et guide', () => {
  it('sans niveau choisi, toute l’interface est visible (revues existantes)', () => {
    expect(visibleViews(demoProject(), ALL)).toEqual(ALL);
  });
  it('« Organiser » ne montre que les étapes utiles, « + étapes » montre tout', () => {
    const p = { ...demoProject(), mode: 'organise' as const, guide: newGuide() };
    expect(visibleViews(p, ALL)).toEqual(['import', 'dedup', 'organisation', 'records']);
    expect(visibleViews({ ...p, guide: { ...p.guide, showAll: true } }, ALL)).toEqual(ALL);
  });
  it('les étapes du guide se cochent selon le travail fait', () => {
    const p = { ...demoProject(), mode: 'sort' as const, guide: newGuide() };
    const ids = guideSteps(p, 2).map((s) => [s.id, s.done]);
    expect(ids).toEqual([
      ['zotero', true],
      ['dedup', false],
      ['screen', false],
      ['plan', false],
      ['classify', false],
    ]);
    expect(guideSteps(p, 0).find((s) => s.id === 'dedup')!.done).toBe(true);
  });
  it('la revue systématique commence par la question et finit par le PRISMA', () => {
    const p = { ...demoProject(), mode: 'systematic' as const, guide: { ...newGuide(), visited: ['prisma'] } };
    const steps = guideSteps(p, 0);
    expect(steps[0].id).toBe('question');
    expect(steps.at(-1)).toMatchObject({ id: 'prisma', done: true });
  });
  it('premier écran : les doublons s’il y en a, sinon le tri ou l’organisation', () => {
    const p = { ...demoProject(), mode: 'organise' as const };
    expect(firstView(p, 3)).toBe('dedup');
    expect(firstView(p, 0)).toBe('organisation');
  });
});
