// Projet de démonstration (sans Zotero) pour découvrir l'application.
import type { Project, RecordItem } from '../types';
import { newProject } from './frameworks';
import { parsePageCount, parseYear } from './text';

type Raw = [title: string, authors: string, date: string, source: string, abstract: string, extra?: Partial<RecordItem>];

const RAW: Raw[] = [
  ['Représentations sociales de la santé mentale chez les étudiants québécois', 'Lévesque, Émilie; Côté, François', '2021', 'Érudit', 'Cette étude qualitative explore les représentations sociales de la santé mentale auprès de 32 étudiants universitaires au Québec. Des entretiens semi-dirigés ont été réalisés. Les résultats montrent une stigmatisation persistante.', { doi: '10.7202/1078453ar', language: 'fr', publication: 'Santé mentale au Québec', pages: '45-67', volume: '46', issue: '1', numChildren: 2 }],
  ['Representations sociales de la sante mentale chez les etudiants quebecois', 'Levesque, Emilie; Cote, Francois', '2021', 'PubMed', '', { doi: '10.7202/1078453AR', publication: 'Sante Ment Que', pages: '45-67' }],
  ['L’épuisement professionnel des infirmières en contexte pandémique : une revue de portée', 'Gagnon, Hélène; Bérubé, Noël', '2022', 'Cairn', 'Objectif : cartographier les écrits portant sur l’épuisement professionnel des infirmières durant la pandémie de COVID-19. Méthode : revue de portée selon JBI. 48 études ont été incluses.', { language: 'fr', publication: 'Recherche en soins infirmiers', pages: '8-22' }],
  ['Burnout among nurses during COVID-19: a systematic review and meta-analysis', 'Smith, John; Nguyen, Linh', '2021', 'PubMed', 'Background: nurses experienced high levels of burnout during the COVID-19 pandemic. Methods: we searched MEDLINE, CINAHL and PsycINFO. Results: pooled prevalence of burnout was 34%.', { doi: '10.1016/j.ijnurstu.2021.104012', language: 'en', publication: 'International Journal of Nursing Studies', pages: '104012' }],
  ['Burnout among nurses during COVID-19: A systematic review and meta-analysis.', 'Smith, J.; Nguyen, L.', '2021', 'Scopus', 'Background: nurses experienced high levels of burnout during the COVID-19 pandemic.', { language: 'en', publication: 'Int J Nurs Stud' }],
  ['Soutien par les pairs et rétablissement en santé mentale : étude mixte', 'Tremblay, Josée; Ouellet, Marc-André', '2020', 'Érudit', 'Cette étude à devis mixte évalue un programme de soutien par les pairs auprès de personnes vivant avec un trouble mental grave. Les participants rapportent une amélioration du sentiment d’espoir.', { language: 'fr', publication: 'Santé mentale au Québec', pages: '101-124' }],
  ['Peer support interventions for adults with severe mental illness: randomized controlled trial', 'Johnson, Sarah; Patel, Arjun', '2019', 'PubMed', 'A randomized controlled trial of 240 adults with severe mental illness. Peer support improved recovery scores at 12 months compared with usual care.', { doi: '10.1192/bjp.2019.12', language: 'en', publication: 'British Journal of Psychiatry', pages: '12-19' }],
  ['Les déterminants sociaux de la santé chez les jeunes autochtones : synthèse des connaissances', 'Awashish, Mélanie; Picard, Réjean', '2023', 'Cairn', 'Synthèse des connaissances sur les déterminants sociaux de la santé des jeunes des Premières Nations au Canada.', { language: 'fr', publication: 'Revue canadienne de santé publique', pages: '210-229' }],
  ['Effets de l’activité physique sur l’anxiété des adolescents : essai contrôlé randomisé', 'Moreau, Chloé; Dubé, Théo', '2022', 'PubMed', 'Essai contrôlé randomisé auprès de 180 adolescents. Le programme d’activité physique de 12 semaines a réduit les symptômes d’anxiété.', { doi: '10.1016/j.encep.2022.03.004', language: 'fr', publication: 'L’Encéphale', pages: '300-307' }],
  ['Pratiques pédagogiques inclusives au secondaire : une méta-synthèse', 'Rousseau, Nadia; Bélanger, Stéphane', '2018', 'Érudit', 'Méta-synthèse qualitative de 22 études portant sur les pratiques inclusives dans les écoles secondaires.', { language: 'fr', publication: 'Revue des sciences de l’éducation', pages: '55-88' }],
  ['Télésanté et suivi des maladies chroniques en région éloignée', 'Fortin, Jean-Sébastien', '2020', 'Scopus', 'Étude de cas multiples sur l’implantation de la télésanté pour le suivi du diabète en région éloignée.', { language: 'fr', publication: 'Santé publique', pages: '77-85' }],
  ['Mindfulness-based stress reduction for healthcare workers: a meta-analysis', 'Garcia, Maria; Lee, Min-Jun', '2020', 'Scopus', 'Meta-analysis of 29 randomized trials of MBSR among healthcare workers. MBSR reduced stress and burnout symptoms.', { doi: '10.1007/s12671-020-01345-6', language: 'en', publication: 'Mindfulness', pages: '1-15' }],
  ['Expérience des proches aidants de personnes atteintes de la maladie d’Alzheimer', 'Bouchard, Ginette; Paré, Lucie', '2019', 'Cairn', 'Étude phénoménologique auprès de 15 proches aidants. Les thèmes émergents concernent l’isolement, la culpabilité et la résilience.', { language: 'fr', publication: 'Gérontologie et société', pages: '139-156' }],
  ['Dépistage du cancer du col de l’utérus : revue systématique des interventions', 'Nadeau, Véronique', '2017', 'PubMed', '', { language: 'fr', publication: 'Bulletin du Cancer' }],
  ['Rapport sur la santé des Québécois 2022', 'Institut national de santé publique du Québec', '2022', 'Littérature grise', 'Rapport gouvernemental présentant les principaux indicateurs de santé de la population québécoise.', { itemType: 'report', language: 'fr', publication: 'INSPQ' }],
  ['L’intervention en santé mentale jeunesse : thèse de doctorat', 'Lachance, Rosalie', '2021', 'Littérature grise', 'Thèse portant sur les pratiques d’intervention en santé mentale auprès des jeunes de 12 à 25 ans.', { itemType: 'thesis', language: 'fr', publication: 'Université Laval' }],
  ['Stigmatisation et recherche d’aide chez les hommes : une étude qualitative', 'Roy, Mathieu; Houle, Janie', '2016', 'Érudit', 'Entretiens auprès de 25 hommes ayant vécu une détresse psychologique. La stigmatisation freine la recherche d’aide.', { language: 'fr', publication: 'Santé mentale au Québec', pages: '149-169' }],
  ['Referenced study: peer workers in community mental health', 'Davidson, Larry', '2015', 'Recherche par citations', 'Narrative account of peer workers in community mental health services.', { language: 'en', publication: 'Psychiatric Services' }],
  ['Introduction : penser le rétablissement', 'Lecomte, Yves', '2018', 'Cairn', '', { itemType: 'bookSection', language: 'fr', bookTitle: 'Le rétablissement en santé mentale : pratiques et savoirs', publication: 'Le rétablissement en santé mentale : pratiques et savoirs', publisher: 'Presses de l’Université du Québec', pages: '1-12', isbn: '978-2-7605-4890-1', numChildren: 1 }],
  ['Introduction : penser le rétablissement', 'Provencher, Hélène', '2020', 'Cairn', '', { itemType: 'bookSection', language: 'fr', bookTitle: 'Pair-aidance et intervention communautaire', publication: 'Pair-aidance et intervention communautaire', publisher: 'Presses de l’Université Laval', pages: '1-9', isbn: '978-2-7637-4512-3' }],
];

export function demoProject(): Project {
  const p = newProject('Démonstration – santé mentale');
  p.question = 'Quelles interventions favorisent le rétablissement en santé mentale chez les jeunes adultes ?';
  p.framework.elements[0].description = 'Jeunes adultes (18-30 ans)';
  p.framework.elements[0].keywords = 'étudiant*, jeune*, adolescent*, young adult*';
  p.framework.elements[1].description = 'Soutien par les pairs, interventions psychosociales';
  p.framework.elements[1].keywords = 'pairs, peer support, intervention*';
  p.framework.elements[3].description = 'Rétablissement, bien-être, symptômes';
  p.framework.elements[3].keywords = 'rétablissement, recovery, bien-être';
  p.highlightInclude = 'santé mentale, mental health';
  p.highlightExclude = 'cancer, diabète, gouvernemental';
  p.inclusionCriteria = ['Population de 16 à 35 ans', 'Publié depuis 2015', 'Français ou anglais'];
  p.exclusionCriteria = ['Éditoriaux et commentaires', 'Population exclusivement pédiatrique (< 12 ans)'];
  const kinds: Record<string, Project['sources'][number]['kind']> = { 'Recherche par citations': 'other', 'Littérature grise': 'other' };
  p.sources = [...new Set(RAW.map((r) => r[3]))].map((name) => ({ key: '', name, kind: kinds[name] ?? 'database' }));

  RAW.forEach(([title, authors, date, source, abstract, extra], i) => {
    const key = `DEMO${String(i + 1).padStart(4, '0')}`;
    const creators = authors.split(';').map((a) => {
      const [lastName, firstName] = a.split(',').map((s) => s.trim());
      return firstName ? { lastName, firstName, creatorType: 'author' } : { name: lastName, creatorType: 'author' };
    });
    p.records[key] = {
      key,
      version: 1,
      itemType: 'journalArticle',
      title,
      creators,
      date,
      year: parseYear(date),
      abstract,
      doi: '',
      url: '',
      publication: '',
      language: '',
      pages: '',
      pageCount: null,
      zoteroTags: [],
      collections: [],
      sources: [source],
      ...extra,
    };
    p.records[key].pageCount = parsePageCount(p.records[key].pages);
  });
  p.sync.auto = false;
  return p;
}
