import { describe, expect, it } from 'vitest';
import { demoProject } from '../src/lib/demo';
import { findDuplicateGroups } from '../src/lib/dedup';
import { computePrisma, fulltextKeys, screeningKeys } from '../src/lib/prisma';
import { highlight, normalizeForCompare, parsePageCount } from '../src/lib/text';
import { buildItemPatch, desiredState, noteHtml } from '../src/zotero/sync';
import type { ZItem } from '../src/zotero/api';

describe('texte', () => {
  it('compare sans accents mais ne modifie pas l’original', () => {
    const t = 'Représentations sociales : l’été québécois';
    expect(normalizeForCompare(t)).toBe('representations sociales l ete quebecois');
    expect(t).toBe('Représentations sociales : l’été québécois');
  });

  it('surligne en ignorant accents et casse, avec troncature', () => {
    const segs = highlight('Les Étudiants et la santé mentale', ['etudiant*', 'sante mentale'], []);
    expect(segs.filter((s) => s.mark).map((s) => s.text)).toEqual(['Étudiants', 'santé mentale']);
    expect(segs.map((s) => s.text).join('')).toBe('Les Étudiants et la santé mentale');
  });

  it('calcule le nombre de pages', () => {
    expect(parsePageCount('45-67')).toBe(23);
    expect(parsePageCount('1234-45')).toBe(12);
    expect(parsePageCount('e104012')).toBeNull();
  });
});

describe('doublons', () => {
  it('trouve les doublons par DOI, titre et similarité', () => {
    const p = demoProject();
    const groups = findDuplicateGroups(Object.values(p.records));
    const sets = groups.map((g) => g.keys.join(','));
    expect(sets).toContain('DEMO0001,DEMO0002'); // même DOI, accents perdus dans une base
    expect(groups.find((g) => g.keys.includes('DEMO0001'))!.reason).toBe('doi');
    expect(sets).toContain('DEMO0004,DEMO0005'); // même titre, ponctuation différente
    expect(groups.find((g) => g.keys.includes('DEMO0001'))!.suggestedKeep).toBe('DEMO0001');
  });
});

describe('PRISMA', () => {
  it('compte les étapes', () => {
    const p = demoProject();
    p.duplicates = { DEMO0002: 'DEMO0001', DEMO0005: 'DEMO0004' };
    const d = (decision: 'include' | 'exclude' | 'maybe', reasons: string[] = []) => ({ decision, reasons, note: '', at: '' });
    p.screening = { DEMO0001: d('include'), DEMO0003: d('include'), DEMO0004: d('exclude', ['Hors sujet']) };
    p.notRetrieved = { DEMO0003: '' };
    p.fulltext = { DEMO0001: d('include'), DEMO0015: d('exclude', ['Mauvaise population']) };
    const c = computePrisma(p);
    expect(c.duplicates).toBe(2);
    expect(c.screened).toBe(screeningKeys(p).length);
    expect(c.screeningExcluded).toBe(1);
    expect(c.main.sought).toBe(2);
    expect(c.main.notRetrieved).toBe(1);
    expect(c.main.included).toBe(1);
    expect(c.other!.sought).toBe(3); // littérature grise + citations
    expect(c.other!.excludedByReason).toEqual([['Mauvaise population', 1]]);
    expect(c.totalIncluded).toBe(1);
    expect(fulltextKeys(p)).toContain('DEMO0018');
  });
});

describe('synchronisation Zotero', () => {
  const p = demoProject();
  p.zoteroCollections = { root: 'ROOT', duplicates: 'DUP', screening_include: 'SI', screening_exclude: 'SE', screening_maybe: 'SM', fulltext_exclude: 'FE', fulltext_maybe: 'FM', fulltext_notretrieved: 'FN', included: 'INC' };
  p.screening = { DEMO0001: { decision: 'exclude', reasons: ['Hors sujet'], note: 'Pas la bonne population', at: '' } };

  it('conserve les collections et étiquettes de l’utilisateur', () => {
    const item: ZItem = { key: 'DEMO0001', version: 7, data: { key: 'DEMO0001', version: 7, itemType: 'journalArticle', collections: ['SRC', 'SI'], tags: [{ tag: 'à lire', type: 0 }, { tag: 'LF:tri:inclus' }] } };
    const patch = buildItemPatch(p, item, desiredState(p, 'DEMO0001'))!;
    expect(patch.version).toBe(7);
    expect(patch.collections).toEqual(['SRC', 'SE']);
    expect(patch.tags!.map((t) => t.tag)).toEqual(['à lire', 'LF:tri:exclu', 'LF:tri:raison:Hors sujet']);
  });

  it('ne fait rien si Zotero est déjà à jour', () => {
    const item: ZItem = { key: 'DEMO0001', version: 7, data: { key: 'DEMO0001', version: 7, itemType: 'journalArticle', collections: ['SRC', 'SE'], tags: [{ tag: 'LF:tri:raison:Hors sujet' }, { tag: 'LF:tri:exclu' }] } };
    expect(buildItemPatch(p, item, desiredState(p, 'DEMO0001'))).toBeNull();
  });

  it('écrit une note lisible', () => {
    expect(noteHtml(p, 'DEMO0001')).toContain('Exclu — Hors sujet');
    expect(noteHtml(p, 'DEMO0003')).toBeNull();
  });
});
