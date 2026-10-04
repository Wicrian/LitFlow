// Stratégie de recherche : concepts (colonnes) et mots-clés, traduits dans la
// syntaxe de chaque base de données, avec mode d'emploi « ligne par ligne »
// pour les formulaires de recherche avancée.
//
// Les règles de syntaxe viennent de l'aide officielle des bases. Elles peuvent
// changer : chaque profil indique sa source et son degré de vérification.

import type { Project, SearchConcept, SearchState } from '../types';
import { splitKeywords } from './text';

export type SearchField = 'tiab' | 'title' | 'all';

export interface DbProfile {
  id: string;
  name: string;
  /** Mots des opérateurs. */
  and: string;
  or: string;
  /** Caractère de troncature, ou null si la base ne la connaît pas. */
  trunc: string | null;
  /** Expressions entre guillemets reconnues. */
  quotes: boolean;
  /** Parenthèses (regroupement) reconnues. */
  parens: boolean;
  /** Longueur maximale conseillée de l'équation. */
  maxLength?: number;
  /** Comment appliquer le champ titre/résumé. */
  field: (q: string, f: SearchField, concept?: boolean) => string;
  /** Libellé du champ à choisir dans le formulaire, pour le mode ligne par ligne. */
  formField: Record<SearchField, string>;
  /** Une étiquette de champ par terme (PubMed) plutôt qu'autour du bloc. */
  perTermTag?: Record<SearchField, string>;
  /** Mode « lignes numérotées » (Ovid). */
  numberedLines?: boolean;
  /** Le champ s'applique à chaque concept séparément (EBSCO, ProQuest). */
  fieldPerConcept?: boolean;
  help: string;
  /** « officiel » : règles tirées de l'aide de la base ; « observé » : vu dans une vraie recherche ; « à vérifier ». */
  status: 'officiel' | 'observé' | 'à vérifier';
  notes?: string[];
}

const plain = (q: string) => q;

export const DB_PROFILES: DbProfile[] = [
  {
    id: 'pubmed',
    name: 'PubMed',
    and: 'AND',
    or: 'OR',
    trunc: '*',
    quotes: true,
    parens: true,
    field: plain,
    perTermTag: { tiab: '[tiab]', title: '[ti]', all: '' },
    formField: { tiab: 'Title/Abstract', title: 'Title', all: 'All Fields' },
    help: 'https://pubmed.ncbi.nlm.nih.gov/help/',
    status: 'officiel',
    notes: ['Pensez aussi aux termes MeSH (vocabulaire contrôlé de PubMed) pour chaque concept.'],
  },
  {
    id: 'scopus',
    name: 'Scopus',
    and: 'AND',
    or: 'OR',
    trunc: '*',
    quotes: true,
    parens: true,
    field: (q, f) => (f === 'tiab' ? `TITLE-ABS-KEY(${q})` : f === 'title' ? `TITLE(${q})` : `ALL(${q})`),
    formField: { tiab: 'Article title, Abstract, Keywords', title: 'Article title', all: 'All fields' },
    help: 'https://service.elsevier.com/app/answers/detail/a_id/34325/supporthub/scopus/',
    status: 'officiel',
    notes: ['TITLE-ABS-KEY cherche aussi dans les mots-clés des auteurs et de l’indexation.'],
  },
  {
    id: 'wos',
    name: 'Web of Science',
    and: 'AND',
    or: 'OR',
    trunc: '*',
    quotes: true,
    parens: true,
    field: (q, f) => (f === 'tiab' ? `TS=(${q})` : f === 'title' ? `TI=(${q})` : `ALL=(${q})`),
    formField: { tiab: 'Topic', title: 'Title', all: 'All Fields' },
    help: 'https://webofscience.help.clarivate.com/en-us/Content/search-operators.html',
    status: 'officiel',
    notes: ['« Topic » (TS=) couvre titre, résumé et mots-clés.'],
  },
  {
    id: 'ebsco',
    name: 'EBSCOhost (CINAHL, PsycINFO, Academic Search, ERIC…)',
    and: 'AND',
    or: 'OR',
    trunc: '*',
    quotes: true,
    parens: true,
    field: (q, f) => (f === 'tiab' ? `(TI (${q}) OR AB (${q}))` : f === 'title' ? `TI (${q})` : q),
    fieldPerConcept: true,
    formField: { tiab: 'Select a Field (optional) — le champ TI/AB est déjà dans le texte', title: 'TI Title', all: 'Select a Field (optional)' },
    help: 'https://connect.ebsco.com/s/article/Searching-with-Boolean-Operators',
    status: 'officiel',
    notes: ['Le formulaire EBSCO a 3 lignes par défaut : « Add row » (+) en ajoute.'],
  },
  {
    id: 'proquest',
    name: 'ProQuest (Sociological Abstracts, ERIC…)',
    and: 'AND',
    or: 'OR',
    trunc: '*',
    quotes: true,
    parens: true,
    field: (q, f) => (f === 'tiab' ? `(ti(${q}) OR ab(${q}))` : f === 'title' ? `ti(${q})` : `noft(${q})`),
    fieldPerConcept: true,
    formField: { tiab: 'Anywhere — le champ ti()/ab() est déjà dans le texte', title: 'Anywhere — ti() est déjà dans le texte', all: 'Anywhere except full text – NOFT' },
    help: 'https://proquest.libguides.com/proquestplatform/tips',
    status: 'officiel',
  },
  {
    id: 'ovid',
    name: 'Ovid (MEDLINE, Embase, PsycINFO via Ovid)',
    and: 'and',
    or: 'or',
    trunc: '$',
    quotes: false,
    parens: true,
    field: (q, f) => `(${q}).${f === 'tiab' ? 'ti,ab' : f === 'title' ? 'ti' : 'mp'}.`,
    formField: { tiab: '.ti,ab.', title: '.ti.', all: '.mp.' },
    numberedLines: true,
    help: 'https://ospguides.ovid.com/OSPguides/medline.htm',
    status: 'officiel',
    notes: ['Ovid fonctionne par lignes numérotées : une ligne par concept, puis « 1 and 2 ». Les expressions s’écrivent sans guillemets.'],
  },
  {
    id: 'scholar',
    name: 'Google Scholar',
    and: '',
    or: 'OR',
    trunc: null,
    quotes: true,
    parens: false,
    maxLength: 256,
    field: plain,
    formField: { tiab: 'Recherche simple', title: 'allintitle: (sans OR)', all: 'Recherche simple' },
    help: 'https://scholar.google.com/intl/fr/scholar/help.html',
    status: 'officiel',
    notes: [
      'Google Scholar ne connaît pas la troncature (*) : écrivez les variantes (singulier, pluriel, féminin).',
      'Pas de vrai regroupement par parenthèses ni de recherche limitée au résumé : utilisez-le en complément, pas comme base principale.',
    ],
  },
  {
    id: 'cairn',
    name: 'Cairn.info',
    and: 'AND',
    or: 'OR',
    trunc: '*',
    quotes: true,
    parens: true,
    field: plain,
    formField: { tiab: 'Champ de recherche principal', title: 'Titre', all: 'Champ de recherche principal' },
    help: 'https://shs.cairn.info/aide',
    status: 'observé',
    notes: [
      'Syntaxe observée dans une vraie recherche Cairn : AND / OR en majuscules, parenthèses, guillemets, et troncature * même entre guillemets.',
      'La limitation au titre ou au résumé reste à vérifier dans la recherche avancée.',
    ],
  },
  {
    id: 'erudit',
    name: 'Érudit',
    and: 'AND',
    or: 'OR',
    trunc: '*',
    quotes: true,
    parens: true,
    field: plain,
    formField: { tiab: 'Tous les champs (à vérifier)', title: 'Titre', all: 'Tous les champs' },
    help: 'https://www.erudit.org/fr/recherche/avancee/',
    status: 'à vérifier',
  },
  {
    id: 'repere',
    name: 'Repère',
    and: 'AND',
    or: 'OR',
    trunc: '*',
    quotes: true,
    parens: true,
    field: plain,
    formField: { tiab: 'Tous les champs (à vérifier)', title: 'Titre', all: 'Tous les champs' },
    help: 'https://repere.cyberesse.qc.ca/',
    status: 'à vérifier',
  },
];

export function profileFor(db: SearchState['databases'][number]): DbProfile {
  if (db.custom)
    return {
      id: db.id,
      name: db.name,
      and: db.custom.and,
      or: db.custom.or,
      trunc: db.custom.trunc || null,
      quotes: db.custom.quotes,
      parens: db.custom.parens,
      field: plain,
      formField: { tiab: 'Titre / résumé', title: 'Titre', all: 'Tous les champs' },
      help: db.custom.help ?? '',
      status: 'à vérifier',
    };
  return DB_PROFILES.find((x) => x.id === db.profileId) ?? DB_PROFILES[DB_PROFILES.length - 1];
}

// ---------------------------------------------------------------------------
// Traduction

/** Écrit un terme dans la syntaxe de la base (guillemets, troncature, étiquette). */
export function formatTerm(raw: string, prof: DbProfile, field: SearchField, warnings: Set<string>): string {
  let t = raw.trim().replace(/^"(.*)"$/, '$1').trim();
  if (!t) return '';
  if (t.includes('*')) {
    if (prof.trunc === null) {
      warnings.add(`${prof.name} ne connaît pas la troncature : « * » a été retiré, ajoutez les variantes vous-même.`);
      t = t.replace(/\*/g, '');
    } else t = t.replace(/\*/g, prof.trunc);
  }
  const phrase = /\s/.test(t);
  let out = phrase && prof.quotes ? `"${t}"` : t;
  if (phrase && !prof.quotes && !prof.numberedLines) warnings.add(`${prof.name} ne reconnaît pas les guillemets : vérifiez que les expressions sont bien cherchées ensemble.`);
  if (prof.perTermTag && prof.perTermTag[field]) out += prof.perTermTag[field];
  return out;
}

export function conceptTerms(c: SearchConcept): string[] {
  return c.terms.map((t) => t.trim()).filter(Boolean);
}

/** Bloc d'un concept : termes reliés par OU. */
export function conceptBlock(c: SearchConcept, prof: DbProfile, field: SearchField, warnings: Set<string>): string {
  const terms = conceptTerms(c).map((t) => formatTerm(t, prof, field, warnings)).filter(Boolean);
  return terms.join(` ${prof.or} `);
}

export interface Translation {
  query: string;
  /** Mode d'emploi ligne par ligne (formulaire de recherche avancée). */
  lines: { label: string; text: string; field: string; operator?: string }[];
  warnings: string[];
}

export function translate(s: SearchState, prof: DbProfile): Translation {
  const warnings = new Set<string>();
  const field = s.field;
  const concepts = s.concepts.filter((c) => conceptTerms(c).length);
  const blocks = concepts.map((c) => {
    const block = conceptBlock(c, prof, field, warnings);
    const many = conceptTerms(c).length > 1;
    return { c, block, grouped: many && prof.parens ? `(${block})` : block };
  });

  const lines: Translation['lines'] = [];
  let query = '';
  if (prof.numberedLines) {
    // Ovid : une ligne par concept, puis la combinaison.
    blocks.forEach(({ c, block }, i) => lines.push({ label: `Ligne ${i + 1} — ${c.name}`, text: prof.field(block, field), field: prof.formField[field] }));
    if (blocks.length > 1)
      lines.push({ label: `Ligne ${blocks.length + 1} — combinaison`, text: blocks.map((_, i) => i + 1).join(` ${prof.and} `), field: '' });
    query = lines.map((l, i) => `${i + 1}. ${l.text}`).join('\n');
  } else {
    const joiner = prof.and ? ` ${prof.and} ` : ' ';
    const parts = blocks.map(({ block, grouped }) => (prof.fieldPerConcept ? prof.field(block, field) : blocks.length > 1 ? grouped : block));
    const inner = parts.join(joiner);
    query = !blocks.length ? '' : prof.perTermTag || prof.fieldPerConcept ? inner : prof.field(inner, field);
    blocks.forEach(({ c, block }, i) =>
      lines.push({
        label: `Ligne ${i + 1} — ${c.name}`,
        text: prof.fieldPerConcept ? prof.field(block, field) : block,
        field: prof.formField[field],
        operator: i > 0 ? prof.and || 'ET (un simple espace)' : undefined,
      }),
    );
  }
  if (prof.maxLength && query.length > prof.maxLength)
    warnings.add(`Équation de ${query.length} caractères : ${prof.name} en accepte environ ${prof.maxLength}. Gardez les termes les plus importants.`);
  if (!prof.parens && blocks.length > 1) warnings.add(`${prof.name} ne gère pas bien les parenthèses : le résultat peut être moins précis qu’ailleurs.`);
  for (const n of prof.notes ?? []) warnings.add(n);
  return { query, lines, warnings: [...warnings] };
}

/** Équation générique lisible (ET / OU), pour la vue d'ensemble. */
export function genericEquation(s: SearchState): string {
  return s.concepts
    .filter((c) => conceptTerms(c).length)
    .map((c) => {
      const terms = conceptTerms(c).map((t) => (/\s/.test(t) && !t.startsWith('"') ? `"${t}"` : t));
      return terms.length > 1 ? `(${terms.join(' OU ')})` : terms[0];
    })
    .join(' ET ');
}

/** Concepts proposés à partir des éléments du protocole (PICO, SPIDER…). */
export function conceptsFromProtocol(p: Project): SearchConcept[] {
  return p.framework.elements
    .filter((e) => e.description.trim() || e.keywords.trim())
    .map((e) => ({
      id: Math.random().toString(36).slice(2, 10),
      name: e.description.trim() ? `${e.letter} – ${e.description.trim()}` : `${e.letter} – ${e.label}`,
      terms: splitKeywords(e.keywords),
    }));
}

export function emptySearch(): SearchState {
  return { concepts: [], field: 'tiab', databases: [], runs: [] };
}

export function searchJournalCsv(p: Project): string {
  const cell = (v: unknown) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Base de données', 'Date', 'Résultats', 'Filtres / limites', 'Notes', 'Équation'];
  const rows = p.search.runs.map((r) => {
    const db = p.search.databases.find((d) => d.id === r.dbId);
    return [db?.name ?? r.dbId, r.date, r.results ?? '', r.filters, r.notes, r.query];
  });
  return '﻿' + [head, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
}
