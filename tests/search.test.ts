import { describe, expect, it } from 'vitest';
import { DB_PROFILES, genericEquation, profileFor, translate } from '../src/lib/search';
import type { SearchState } from '../src/types';

const s: SearchState = {
  field: 'tiab',
  concepts: [
    { id: 'a', name: 'Élus', terms: ['élu*', 'conseiller municipal', 'maire*'] },
    { id: 'b', name: 'Participation', terms: ['"participation citoyenne"', 'démocratie participative'] },
  ],
  databases: [],
  runs: [],
};
const t = (id: string, st = s) => translate(st, DB_PROFILES.find((p) => p.id === id)!);

describe('traduction des équations', () => {
  it('équation générique', () => {
    expect(genericEquation(s)).toBe('(élu* OU "conseiller municipal" OU maire*) ET ("participation citoyenne" OU "démocratie participative")');
  });

  it('PubMed : étiquette [tiab] sur chaque terme', () => {
    expect(t('pubmed').query).toBe(
      '(élu*[tiab] OR "conseiller municipal"[tiab] OR maire*[tiab]) AND ("participation citoyenne"[tiab] OR "démocratie participative"[tiab])',
    );
  });

  it('Scopus et Web of Science : champ autour de toute l’équation', () => {
    expect(t('scopus').query).toBe('TITLE-ABS-KEY((élu* OR "conseiller municipal" OR maire*) AND ("participation citoyenne" OR "démocratie participative"))');
    expect(t('wos').query.startsWith('TS=((élu*')).toBe(true);
  });

  it('EBSCO : titre ou résumé, concept par concept', () => {
    expect(t('ebsco').query).toBe(
      '(TI (élu* OR "conseiller municipal" OR maire*) OR AB (élu* OR "conseiller municipal" OR maire*)) AND (TI ("participation citoyenne" OR "démocratie participative") OR AB ("participation citoyenne" OR "démocratie participative"))',
    );
    expect(t('ebsco').lines[1].operator).toBe('AND');
  });

  it('Ovid : lignes numérotées, $ et sans guillemets', () => {
    const o = t('ovid');
    expect(o.lines.map((l) => l.text)).toEqual([
      '(élu$ or conseiller municipal or maire$).ti,ab.',
      '(participation citoyenne or démocratie participative).ti,ab.',
      '1 and 2',
    ]);
  });

  it('Google Scholar : troncature retirée, avertissements', () => {
    const g = t('scholar');
    expect(g.query).toBe('élu OR "conseiller municipal" OR maire "participation citoyenne" OR "démocratie participative"');
    expect(g.warnings.join(' ')).toMatch(/troncature/);
    expect(g.warnings.join(' ')).toMatch(/parenthèses/);
  });

  it('base personnalisée en français (ET / OU, sans troncature)', () => {
    const prof = profileFor({ id: 'x', profileId: '', name: 'Ma base', custom: { and: 'ET', or: 'OU', trunc: '', quotes: true, parens: true }, override: null, overrideBase: null, notes: '' });
    expect(translate(s, prof).query).toBe('(élu OU "conseiller municipal" OU maire) ET ("participation citoyenne" OU "démocratie participative")');
  });

  it('un seul concept, un seul terme : pas de parenthèses inutiles', () => {
    const one: SearchState = { ...s, concepts: [{ id: 'a', name: 'X', terms: ['municipalité'] }] };
    expect(t('cairn', one).query).toBe('municipalité');
  });
});
