import { emptyOrganisation } from './organisation';
import type { FrameworkElement, FrameworkId, Project, ReviewType } from '../types';

type Def = { name: string; hint: string; elements: [string, string, string][] };

/** Cadres de formulation de la question de recherche. */
export const FRAMEWORKS: Record<FrameworkId, Def> = {
  PICO: {
    name: 'PICO',
    hint: 'Études quantitatives / interventions (le plus courant).',
    elements: [
      ['P', 'Population / Problème', 'Qui est concerné ?'],
      ['I', 'Intervention', 'Quelle intervention ou exposition ?'],
      ['C', 'Comparaison', 'Par rapport à quoi ?'],
      ['O', 'Résultats (Outcomes)', 'Quels effets mesurés ?'],
    ],
  },
  PICOS: {
    name: 'PICOS',
    hint: 'PICO + type d’étude.',
    elements: [
      ['P', 'Population', ''],
      ['I', 'Intervention', ''],
      ['C', 'Comparaison', ''],
      ['O', 'Résultats', ''],
      ['S', 'Type d’étude (Study design)', 'ECR, cohortes, qualitatif…'],
    ],
  },
  PICOT: {
    name: 'PICOT',
    hint: 'PICO + temporalité.',
    elements: [
      ['P', 'Population', ''],
      ['I', 'Intervention', ''],
      ['C', 'Comparaison', ''],
      ['O', 'Résultats', ''],
      ['T', 'Temps', 'Durée de suivi, période'],
    ],
  },
  PECO: {
    name: 'PECO',
    hint: 'Études d’exposition (environnement, épidémiologie).',
    elements: [
      ['P', 'Population', ''],
      ['E', 'Exposition', ''],
      ['C', 'Comparateur', ''],
      ['O', 'Résultats', ''],
    ],
  },
  PEO: {
    name: 'PEO',
    hint: 'Questions qualitatives ou d’association.',
    elements: [
      ['P', 'Population', ''],
      ['E', 'Exposition', ''],
      ['O', 'Résultats', ''],
    ],
  },
  PCC: {
    name: 'PCC',
    hint: 'Recommandé par JBI pour les revues de portée (scoping).',
    elements: [
      ['P', 'Population', ''],
      ['C', 'Concept', ''],
      ['C', 'Contexte', ''],
    ],
  },
  SPIDER: {
    name: 'SPIDER',
    hint: 'Recherches qualitatives et méthodes mixtes.',
    elements: [
      ['S', 'Échantillon (Sample)', ''],
      ['PI', 'Phénomène d’intérêt', ''],
      ['D', 'Devis (Design)', 'Entretiens, focus groups, ethnographie…'],
      ['E', 'Évaluation', 'Perceptions, expériences, attitudes…'],
      ['R', 'Type de recherche', 'Qualitative, quantitative, mixte'],
    ],
  },
  SPICE: {
    name: 'SPICE',
    hint: 'Sciences sociales, évaluation de services.',
    elements: [
      ['S', 'Contexte (Setting)', ''],
      ['P', 'Perspective', ''],
      ['I', 'Intervention', ''],
      ['C', 'Comparaison', ''],
      ['E', 'Évaluation', ''],
    ],
  },
  ECLIPSE: {
    name: 'ECLIPSE',
    hint: 'Politiques publiques, gestion, services.',
    elements: [
      ['E', 'Attente (Expectation)', ''],
      ['C', 'Groupe client', ''],
      ['L', 'Lieu (Location)', ''],
      ['I', 'Impact', ''],
      ['P', 'Professionnels', ''],
      ['SE', 'Service', ''],
    ],
  },
  CUSTOM: { name: 'Personnalisé', hint: 'Définissez vos propres éléments.', elements: [['A', 'Élément', '']] },
};

export function frameworkElements(id: FrameworkId): FrameworkElement[] {
  return FRAMEWORKS[id].elements.map(([letter, label]) => ({ letter, label, description: '', keywords: '' }));
}

export const REVIEW_TYPES: Record<ReviewType, string> = {
  systematic: 'Revue systématique',
  scoping: 'Revue de portée (scoping review)',
  rapid: 'Revue rapide',
  umbrella: 'Revue parapluie (umbrella)',
  integrative: 'Revue intégrative',
  'meta-analysis': 'Méta-analyse',
  narrative: 'Revue narrative',
  other: 'Autre',
};

export const DEFAULT_REASONS: Project['reasons'] = {
  screening: {
    include: ['Répond aux critères', 'Sujet pertinent'],
    exclude: [
      'Hors sujet',
      'Mauvaise population',
      'Mauvaise intervention / exposition',
      'Mauvais type d’étude',
      'Mauvais type de publication',
      'Langue non retenue',
      'Hors période',
    ],
    maybe: ['Résumé absent', 'À vérifier en texte intégral', 'Doute sur la population'],
  },
  fulltext: {
    include: ['Répond à tous les critères'],
    exclude: [
      'Mauvaise population',
      'Mauvaise intervention / exposition',
      'Mauvais résultats (outcomes)',
      'Mauvais devis d’étude',
      'Données insuffisantes',
      'Texte intégral non disponible',
      'Doublon de publication',
    ],
    maybe: ['À discuter en équipe', 'Contacter les auteurs'],
  },
};

export function newProject(name: string): Project {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    reviewType: 'systematic',
    question: '',
    framework: { id: 'PICO', elements: frameworkElements('PICO') },
    inclusionCriteria: [],
    exclusionCriteria: [],
    highlightInclude: '',
    highlightExclude: '',
    library: null,
    sourceCollection: null,
    sources: [],
    zoteroCollections: {},
    zoteroNotes: {},
    records: {},
    duplicates: {},
    notDuplicateGroups: [],
    screening: {},
    fulltext: {},
    notRetrieved: {},
    rayyanLabels: {},
    organisation: emptyOrganisation(),
    reasons: structuredClone(DEFAULT_REASONS),
    askReason: { include: true, exclude: true, maybe: true },
    manualCounts: { automationExcluded: 0, otherRemoved: 0, otherMethodsIdentified: [] },
    ai: { enabled: false, show: 'before', learn: true, dupThreshold: 0.93, suggestions: {}, lastRun: null },
    sync: { auto: true, tagPrefix: 'LF', writeNotes: true, pending: [], lastSync: null, lastError: null, libraryVersion: null, sourceMap: {}, lastPull: null, snapshotKeys: [], snapshotHash: null, lastSnapshot: null },
  };
}

/** Complète un projet enregistré par une version plus ancienne de l'application. */
export function upgradeProject(p: Project): Project {
  const base = newProject(p.name);
  return {
    ...base,
    ...p,
    manualCounts: { ...base.manualCounts, ...p.manualCounts },
    sync: { ...base.sync, ...p.sync },
    ai: { ...base.ai, ...p.ai },
    organisation: { ...base.organisation, ...p.organisation },
    askReason: { ...base.askReason, ...p.askReason },
    reasons: { ...base.reasons, ...p.reasons },
  };
}
