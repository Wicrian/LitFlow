import { describe, expect, it } from 'vitest';
import { demoProject } from '../src/lib/demo';
import { matchRayyan, parseCsv, parseRayyan, planRayyanImport, reviewersOf } from '../src/lib/rayyan';
import { desiredState } from '../src/zotero/sync';

// Extrait au format d'un vrai export Rayyan (articles.csv).
const CSV = [
  'key,title,year,month,day,journal,issn,volume,issue,pages,authors,url,language,publisher,location,abstract,notes,doi,keywords,pubmed_id,pmc_id',
  'rayyan-1,Representations sociales de la sante mentale chez les etudiants quebecois,2021,,,,,,,,"Lévesque, Émilie",,,,,,"RAYYAN-INCLUSION: {""Christian""=>""Included""} | RAYYAN-LABELS: qualitatif,Québec",10.7202/1078453ar,"",,',
  'rayyan-2,"Burnout among nurses during COVID-19: a systematic review and meta-analysis",2021,,,,,,,,"Smith, John",,,,,,"RAYYAN-INCLUSION: {""Christian""=>""Excluded"", ""Marie""=>""Included""} | RAYYAN-EXCLUSION-REASONS: wrong population,background article",,"",,',
  'rayyan-3,"Expérience des proches aidants de personnes atteintes de la maladie d’Alzheimer - Gérontologie et société",2019,,,,,,,,,,,,,,"Section: 12 p. | RAYYAN-INCLUSION: {""Christian""=>""Maybe""}",,"",,',
  'rayyan-4,Un article qui n’existe pas dans Zotero,2020,,,,,,,,,,,,,,"RAYYAN-INCLUSION: {""Christian""=>""Excluded""}",,"",,',
].join('\n');

describe('import Rayyan', () => {
  it('lit le CSV (guillemets, virgules, sauts de ligne)', () => {
    const rows = parseCsv('a,b\n"x, ""y""","multi\nligne"\n');
    expect(rows).toEqual([{ a: 'x, "y"', b: 'multi\nligne' }]);
  });

  it('lit les décisions, raisons et labels', () => {
    const r = parseRayyan(CSV);
    expect(r).toHaveLength(4);
    expect(r[0].decisions).toEqual({ Christian: 'include' });
    expect(r[0].labels).toEqual(['qualitatif', 'Québec']);
    expect(r[1].decisions).toEqual({ Christian: 'exclude', Marie: 'include' });
    expect(r[1].reasons).toEqual(['wrong population', 'background article']);
    expect(reviewersOf(r)[0]).toBe('Christian');
    expect(() => parseRayyan('a,b\n1,2')).toThrow(/Rayyan/);
  });

  it('rapproche des références Zotero et prépare les décisions', () => {
    const p = demoProject();
    const m = matchRayyan(parseRayyan(CSV), Object.values(p.records));
    expect(m[0]).toMatchObject({ kind: 'doi', keys: ['DEMO0001', 'DEMO0002'] }); // même DOI dans Zotero (doublon)
    expect(m[1]).toMatchObject({ kind: 'title', keys: ['DEMO0004', 'DEMO0005'] });
    expect(m[2].kind).toBe('close'); // titre + titre de la revue/du livre ajouté par Rayyan
    expect(m[2].keys).toEqual(['DEMO0013']);
    expect(m[3].kind).toBeNull();

    p.screening.DEMO0013 = { decision: 'include', reasons: [], note: '', at: '' };
    const plan = planRayyanImport(p, m, 'Christian', { overwrite: false, acceptClose: true });
    expect(plan.decisions.DEMO0001).toMatchObject({ decision: 'include', labels: ['qualitatif', 'Québec'] });
    expect(plan.decisions.DEMO0004).toMatchObject({ decision: 'exclude', reasons: ['wrong population', 'background article'] });
    expect(plan.duplicates).toEqual({ DEMO0002: 'DEMO0001', DEMO0005: 'DEMO0004' });
    expect(plan.decisions.DEMO0013).toBeUndefined(); // décision LitFlow conservée
    expect(plan.skippedExisting).toBe(1);
    expect(planRayyanImport(p, m, 'Marie', { overwrite: true, acceptClose: false }).decisions.DEMO0004.decision).toBe('include');
  });

  it('écrit les labels Rayyan comme étiquettes LF:rayyan:…', () => {
    const p = demoProject();
    p.rayyanLabels = { DEMO0001: ['qualitatif'] };
    expect(desiredState(p, 'DEMO0001').tags).toContain('LF:rayyan:qualitatif');
  });
});
