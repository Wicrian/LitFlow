// Parcours selon « Jusqu'où voulez-vous aller ? » et liste « Pour bien démarrer ».

import type { Project, ReviewMode } from '../types';

export type ViewId = 'protocol' | 'search' | 'import' | 'dedup' | 'screening' | 'fulltext' | 'organisation' | 'records' | 'prisma';

export const MODES: { id: ReviewMode; emoji: string; title: string; hint: string; includes: ('Ranger' | 'Trier' | 'PRISMA')[] }[] = [
  { id: 'organise', emoji: '🗂️', title: 'Organiser mes lectures', hint: 'Classer mes articles par section, concept ou thème', includes: ['Ranger'] },
  { id: 'sort', emoji: '🃏', title: 'Trier puis organiser', hint: 'Garder ou écarter mes articles, puis les ranger', includes: ['Ranger', 'Trier'] },
  {
    id: 'systematic',
    emoji: '🔬',
    title: 'Revue systématique',
    hint: 'Protocole, tri en deux temps, diagramme PRISMA… et organisation',
    includes: ['Ranger', 'Trier', 'PRISMA'],
  },
];

const VIEWS_BY_MODE: Record<ReviewMode, ViewId[]> = {
  organise: ['import', 'dedup', 'organisation', 'records'],
  sort: ['import', 'dedup', 'screening', 'fulltext', 'organisation', 'records'],
  systematic: ['protocol', 'search', 'import', 'dedup', 'screening', 'fulltext', 'organisation', 'records', 'prisma'],
};

/** Étapes affichées dans la barre de gauche. */
export function visibleViews(p: Project, all: ViewId[]): ViewId[] {
  if (!p.mode || p.guide?.showAll) return all;
  return all.filter((v) => VIEWS_BY_MODE[p.mode!].includes(v));
}

export interface GuideStep {
  id: string;
  label: string;
  hint: string;
  view: ViewId;
  done: boolean;
}

/** Liste « Pour bien démarrer », adaptée au parcours choisi. */
export function guideSteps(p: Project, openDuplicates: number): GuideStep[] {
  const mode = p.mode ?? 'systematic';
  const records = Object.keys(p.records).length;
  const screened = Object.keys(p.screening).length;
  const classified = Object.values(p.organisation.assignments).filter((ids) => ids.length).length;
  const visited = p.guide?.visited ?? [];
  const steps: GuideStep[] = [];
  const add = (s: GuideStep) => steps.push(s);
  if (mode === 'systematic')
    add({ id: 'question', label: 'Écrire votre question de recherche', hint: 'Dans le protocole : la question et vos critères.', view: 'protocol', done: !!p.question.trim() });
  add({ id: 'zotero', label: 'Relier votre collection Zotero', hint: 'Vos articles sont lus directement dans Zotero.', view: 'import', done: records > 0 });
  add({ id: 'dedup', label: 'Vérifier les doublons', hint: 'Le même article trouvé deux fois ?', view: 'dedup', done: records > 0 && openDuplicates === 0 });
  if (mode !== 'organise')
    add({ id: 'screen', label: 'Trier 5 articles (titre et résumé)', hint: 'Glissez la carte : → garder, ← écarter, ↑ incertain.', view: 'screening', done: screened >= 5 });
  if (mode === 'systematic')
    add({ id: 'fulltext', label: 'Évaluer un premier texte intégral', hint: 'Lisez dans Zotero, décidez ici.', view: 'fulltext', done: Object.keys(p.fulltext).length > 0 });
  add({ id: 'plan', label: 'Choisir comment ranger vos articles', hint: 'Un plan proposé, le vôtre, ou plus tard.', view: 'organisation', done: !!p.organisation.name });
  add({ id: 'classify', label: 'Classer 5 articles', hint: 'Glissez chaque carte vers une bulle.', view: 'organisation', done: classified >= 5 });
  if (mode === 'systematic')
    add({ id: 'prisma', label: 'Découvrir votre diagramme PRISMA', hint: 'Il se remplit tout seul.', view: 'prisma', done: visited.includes('prisma') });
  return steps;
}

/** Premier écran après le démarrage. */
export function firstView(p: Project, openDuplicates: number): ViewId {
  if (!Object.keys(p.records).length) return p.mode === 'systematic' ? 'protocol' : 'import';
  if (openDuplicates) return 'dedup';
  return p.mode === 'organise' ? 'organisation' : 'screening';
}

export const newGuide = () => ({ wizard: true, active: true, showAll: false, visited: [] as string[] });
