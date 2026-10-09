// Modèle de données de LitFlow.
// Les métadonnées des références viennent de Zotero et ne sont JAMAIS réécrites :
// LitFlow ne modifie dans Zotero que les collections, les étiquettes (tags) et
// ses propres notes. Les titres, résumés et accents restent intacts.

export type Decision = 'include' | 'exclude' | 'maybe';
export type Stage = 'screening' | 'fulltext';

export interface Creator {
  firstName?: string;
  lastName?: string;
  name?: string;
  creatorType?: string;
}

/** Référence bibliographique (instantané en lecture seule d'un item Zotero). */
export interface RecordItem {
  key: string;
  version: number;
  itemType: string;
  title: string;
  creators: Creator[];
  date: string;
  year: number | null;
  abstract: string;
  doi: string;
  url: string;
  publication: string;
  language: string;
  pages: string;
  /** Nombre de pages calculé à partir du champ « pages » ou « numPages ». */
  pageCount: number | null;
  zoteroTags: string[];
  /** Clés de toutes les collections Zotero de l'item (y compris celles de LitFlow). */
  collections: string[];
  /** Nom(s) de la ou des sources d'identification (sous-collections : PubMed, Scopus…). */
  sources: string[];
  /** Détails utiles pour départager des doublons (facultatifs). */
  bookTitle?: string;
  publisher?: string;
  isbn?: string;
  volume?: string;
  issue?: string;
  /** Nombre de notes et pièces jointes (PDF…) rattachées dans Zotero. */
  numChildren?: number;
}

export interface StageDecision {
  decision: Decision;
  reasons: string[];
  note: string;
  at: string;
}

export type SourceKind = 'database' | 'register' | 'other';

export interface SourceInfo {
  /** Clé de la collection Zotero (vide pour une source saisie manuellement). */
  key: string;
  name: string;
  kind: SourceKind;
}

export type FrameworkId =
  | 'PICO'
  | 'PICOS'
  | 'PICOT'
  | 'PECO'
  | 'PEO'
  | 'PCC'
  | 'SPIDER'
  | 'SPICE'
  | 'ECLIPSE'
  | 'CUSTOM';

export interface FrameworkElement {
  letter: string;
  label: string;
  description: string;
  /** Mots-clés surlignés pendant le tri (séparés par des virgules). */
  keywords: string;
}

export type ReviewType =
  | 'systematic'
  | 'scoping'
  | 'rapid'
  | 'umbrella'
  | 'integrative'
  | 'meta-analysis'
  | 'narrative'
  | 'other';

export interface ZoteroLibrary {
  type: 'user' | 'group';
  id: string;
  name: string;
}

/** Catégorie du plan de classement (= sous-collection Zotero). */
export interface Category {
  id: string;
  name: string;
  /** Catégorie parente (2 niveaux maximum). */
  parent: string | null;
  zoteroKey: string | null;
  /** Nom tel qu'il est dans Zotero lors de la dernière synchronisation. */
  syncedName: string | null;
}

/** Marqueur libre (= étiquette Zotero LF:marqueur:…). */
export interface Marker {
  id: string;
  name: string;
  color: string;
}

export interface Organisation {
  /** Nom du plan (ex. « Sections du mémoire ») ; vide tant qu'aucun plan n'est créé. */
  name: string;
  /** « litflow » : collection créée dans « LitFlow – projet » ; « existing » : collection Zotero existante. */
  rootMode: 'litflow' | 'existing';
  rootKey: string | null;
  categories: Category[];
  /** Référence -> catégories. */
  assignments: Record<string, string[]>;
  markers: Marker[];
  /** Référence -> marqueurs. */
  markerAssignments: Record<string, string[]>;
  /** Sous-collections Zotero à supprimer à la prochaine synchronisation. */
  deletedZoteroKeys: string[];
  /** La structure (catégories) doit être envoyée vers Zotero. */
  structureDirty: boolean;
}

/** Concept de la stratégie de recherche (une colonne de mots-clés reliés par OU). */
export interface SearchConcept {
  id: string;
  name: string;
  terms: string[];
}

export interface SearchDatabase {
  id: string;
  /** Profil de syntaxe intégré (pubmed, scopus…), ou vide pour une base personnalisée. */
  profileId: string;
  name: string;
  /** Règles d'une base ajoutée par la personne. */
  custom?: { and: string; or: string; trunc: string; quotes: boolean; parens: boolean; help?: string };
  /** Équation modifiée à la main (remplace la traduction automatique). */
  override: string | null;
  /** Traduction automatique au moment de la modification (pour signaler qu'elle a changé depuis). */
  overrideBase: string | null;
  notes: string;
}

/** Une recherche effectivement lancée (journal, pour PRISMA-S). */
export interface SearchRun {
  id: string;
  dbId: string;
  date: string;
  query: string;
  results: number | null;
  filters: string;
  notes: string;
}

export interface SearchState {
  concepts: SearchConcept[];
  field: 'tiab' | 'title' | 'all';
  databases: SearchDatabase[];
  runs: SearchRun[];
}

export type ReviewMode = 'organise' | 'sort' | 'systematic';

export interface GuideState {
  /** Écrans de démarrage en cours. */
  wizard: boolean;
  /** Liste « Pour bien démarrer » affichée. */
  active: boolean;
  /** Toutes les étapes visibles dans la barre, quel que soit le niveau. */
  showAll: boolean;
  /** Écrans déjà visités (pour cocher « Voir le diagramme PRISMA »…). */
  visited: string[];
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  reviewType: ReviewType;
  question: string;
  framework: { id: FrameworkId; elements: FrameworkElement[] };
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  /** Mots-clés à surligner en vert (inclusion) et en rouge (exclusion). */
  highlightInclude: string;
  highlightExclude: string;

  library: ZoteroLibrary | null;
  /** Collection Zotero contenant les résultats de recherche (sous-collections = sources). */
  sourceCollection: { key: string; name: string } | null;
  sources: SourceInfo[];
  /** Collections créées par LitFlow dans Zotero (clé logique -> clé Zotero). */
  zoteroCollections: Record<string, string>;
  /** Notes Zotero créées par LitFlow (clé item -> clé note). */
  zoteroNotes: Record<string, string>;

  records: Record<string, RecordItem>;
  /** Doublon -> référence conservée. */
  duplicates: Record<string, string>;
  /** Groupes de doublons potentiels déjà examinés et jugés « pas des doublons ». */
  notDuplicateGroups: string[];

  screening: Record<string, StageDecision>;
  fulltext: Record<string, StageDecision>;
  /** Textes intégraux introuvables (PRISMA : « reports not retrieved »). */
  notRetrieved: Record<string, string>;
  /** Stratégie de recherche : concepts, équations par base, journal. */
  search: SearchState;
  /** Organisation sur mesure (catégories et marqueurs). */
  organisation: Organisation;
  /** Jusqu'où la personne veut aller (choisi au démarrage) ; absent = interface complète. */
  mode?: ReviewMode;
  /** Accueil et guide « Pour bien démarrer ». */
  guide?: GuideState;
  /** Labels importés de Rayyan (clé item -> labels), écrits dans Zotero en LF:rayyan:… */
  rayyanLabels: Record<string, string[]>;
  /** Raisons mémorisées, réutilisables d'un clic. */
  reasons: Record<Stage, Record<Decision, string[]>>;
  /** Quand demander une raison après une décision. */
  askReason: Record<Decision, boolean>;

  /** Chiffres PRISMA saisis à la main (sources hors Zotero). */
  manualCounts: {
    automationExcluded: number;
    otherRemoved: number;
    otherMethodsIdentified: { name: string; n: number }[];
  };

  /** Assistant IA local (facultatif). */
  ai: {
    enabled: boolean;
    /** Montrer la suggestion avant ma décision, seulement après, ou jamais. */
    show: 'before' | 'after' | 'never';
    /** L'IA apprend de mes décisions déjà prises. */
    learn: boolean;
    /** Seuil de similarité pour les doublons proposés par l'IA (0,80 à 0,99). */
    dupThreshold: number;
    suggestions: Record<string, { decision: Decision; score: number; reason: string; mode: 'criteria' | 'learned'; at: string }>;
    lastRun: string | null;
  };

  /** Réglages de synchronisation. */
  sync: {
    auto: boolean;
    tagPrefix: string;
    writeNotes: boolean;
    /** Items modifiés localement qui restent à envoyer vers Zotero. */
    pending: string[];
    lastSync: string | null;
    lastError: string | null;
    /** Version de la bibliothèque Zotero lors de la dernière lecture (pour ne relire que les changements). */
    libraryVersion: number | null;
    /** Collection Zotero -> nom de la source (y compris les sous-sous-collections). */
    sourceMap: Record<string, string>;
    lastPull: string | null;
    /** Notes Zotero contenant la sauvegarde du projet (pour le reprendre sur un autre appareil). */
    snapshotKeys: string[];
    snapshotHash: string | null;
    lastSnapshot: string | null;
  };
}

export interface Settings {
  apiKey: string;
  userId: string;
  username: string;
}
