// Organisation sur mesure des références : catégories (sous-collections Zotero)
// et marqueurs (étiquettes Zotero). Indépendante du parcours PRISMA : une
// référence exclue au tri peut très bien être rangée dans « Méthodologie ».

import type { Category, Marker, Organisation, Project } from '../types';

export const MARKER_COLORS = ['#8b6cf0', '#2f9a72', '#d4506f', '#c98a1d', '#2f80ed', '#e98a3f', '#5f6b80', '#b04fc7'];

export const ORG_TEMPLATES: { id: string; name: string; hint: string; categories: (p: Project) => (string | [string, string[]])[] }[] = [
  {
    id: 'memoire',
    name: 'Sections d’un mémoire / d’une thèse',
    hint: 'Introduction, problématique, cadre théorique, méthodologie…',
    categories: () => ['Introduction', 'Problématique', 'Cadre théorique', 'Méthodologie', 'Résultats', 'Discussion', 'Conclusion'],
  },
  {
    id: 'concepts',
    name: 'Concepts',
    hint: 'À partir des éléments de votre question (PICO, SPIDER…)',
    categories: (p) => {
      const els = p.framework.elements.filter((e) => e.description.trim() || e.label.trim());
      return els.length ? els.map((e) => (e.description.trim() ? `${e.label} : ${e.description.trim()}` : e.label)) : ['Concept 1', 'Concept 2', 'Concept 3'];
    },
  },
  {
    id: 'type',
    name: 'Type d’étude',
    hint: 'Quantitative, qualitative, mixte…',
    categories: () => ['Quantitative', 'Qualitative', 'Mixte', 'Revue de littérature', 'Théorique / essai', 'Littérature grise'],
  },
  {
    id: 'lecture',
    name: 'Suivi de lecture',
    hint: 'À lire, en cours, lu, à relire',
    categories: () => ['À lire', 'En cours', 'Lu', 'À relire'],
  },
  { id: 'vide', name: 'Plan vide', hint: 'Créez vos propres catégories', categories: () => [] },
];

export const DEFAULT_MARKERS: [string, string][] = [
  ['⭐ Important', MARKER_COLORS[3]],
  ['📌 À citer', MARKER_COLORS[0]],
  ['🔍 Méthode intéressante', MARKER_COLORS[4]],
];

export function emptyOrganisation(): Organisation {
  return {
    name: '',
    rootMode: 'litflow',
    rootKey: null,
    categories: [],
    assignments: {},
    markers: [],
    markerAssignments: {},
    deletedZoteroKeys: [],
    structureDirty: false,
  };
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function newCategory(name: string, parent: string | null = null): Category {
  return { id: uid(), name: name.trim(), parent, zoteroKey: null, syncedName: null };
}

export function newMarker(name: string, color = MARKER_COLORS[0]): Marker {
  return { id: uid(), name: name.trim(), color };
}

/** Crée un plan à partir d'un modèle. */
export function fromTemplate(p: Project, templateId: string, planName: string): Organisation {
  const t = ORG_TEMPLATES.find((x) => x.id === templateId) ?? ORG_TEMPLATES[ORG_TEMPLATES.length - 1];
  const categories: Category[] = [];
  for (const c of t.categories(p)) {
    if (typeof c === 'string') categories.push(newCategory(c));
    else {
      const parent = newCategory(c[0]);
      categories.push(parent, ...c[1].map((n) => newCategory(n, parent.id)));
    }
  }
  return {
    ...emptyOrganisation(),
    ...p.organisation,
    name: planName.trim() || t.name,
    categories,
    assignments: {},
    markers: p.organisation.markers.length ? p.organisation.markers : DEFAULT_MARKERS.map(([n, c]) => newMarker(n, c)),
    structureDirty: true,
  };
}

/** Catégories dans l'ordre d'affichage : chaque parent suivi de ses sous-catégories. */
export function orderedCategories(o: Organisation): Category[] {
  const out: Category[] = [];
  for (const c of o.categories.filter((x) => !x.parent)) {
    out.push(c, ...o.categories.filter((x) => x.parent === c.id));
  }
  return out;
}

export function categoryLabel(o: Organisation, c: Category): string {
  const parent = c.parent ? o.categories.find((x) => x.id === c.parent) : null;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

// ---- Modifications (fonctions pures : renvoient une nouvelle organisation) ----

export function setAssignment(o: Organisation, key: string, ids: string[]): Organisation {
  const assignments = { ...o.assignments };
  const uniq = [...new Set(ids)];
  if (uniq.length) assignments[key] = uniq;
  else delete assignments[key];
  return { ...o, assignments };
}

export function toggleCategory(o: Organisation, key: string, id: string): Organisation {
  const cur = o.assignments[key] ?? [];
  return setAssignment(o, key, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
}

/** Déplace une référence d'une catégorie vers une autre (glisser-déposer). */
export function moveToCategory(o: Organisation, key: string, from: string | null, to: string | null): Organisation {
  const cur = (o.assignments[key] ?? []).filter((x) => x !== from);
  return setAssignment(o, key, to ? [...cur, to] : cur);
}

export function toggleMarker(o: Organisation, key: string, id: string): Organisation {
  const cur = o.markerAssignments[key] ?? [];
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  const markerAssignments = { ...o.markerAssignments };
  if (next.length) markerAssignments[key] = next;
  else delete markerAssignments[key];
  return { ...o, markerAssignments };
}

export function renameCategory(o: Organisation, id: string, name: string): Organisation {
  return { ...o, categories: o.categories.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)), structureDirty: true };
}

export type DeleteStrategy = { kind: 'unclassify' } | { kind: 'move'; to: string } | { kind: 'marker' };

/**
 * Supprime une catégorie. Les références qu'elle contenait ne sont jamais
 * supprimées : elles sont remises « à classer », déplacées dans une autre
 * catégorie, ou reçoivent un marqueur du même nom. Les sous-catégories
 * remontent d'un niveau. Renvoie aussi les références concernées.
 */
export function deleteCategory(o: Organisation, id: string, strategy: DeleteStrategy): { org: Organisation; affected: string[] } {
  const cat = o.categories.find((c) => c.id === id);
  if (!cat) return { org: o, affected: [] };
  const affected = Object.keys(o.assignments).filter((k) => o.assignments[k].includes(id));
  let org: Organisation = {
    ...o,
    categories: o.categories.filter((c) => c.id !== id).map((c) => (c.parent === id ? { ...c, parent: cat.parent } : c)),
    deletedZoteroKeys: cat.zoteroKey ? [...o.deletedZoteroKeys, cat.zoteroKey] : o.deletedZoteroKeys,
    structureDirty: true,
  };
  let marker: Marker | null = null;
  if (strategy.kind === 'marker') {
    marker = org.markers.find((m) => m.name === cat.name) ?? newMarker(cat.name, MARKER_COLORS[org.markers.length % MARKER_COLORS.length]);
    if (!org.markers.some((m) => m.id === marker!.id)) org = { ...org, markers: [...org.markers, marker] };
  }
  for (const k of affected) {
    const rest = org.assignments[k].filter((x) => x !== id);
    org = setAssignment(org, k, strategy.kind === 'move' ? [...rest, strategy.to] : rest);
    if (marker && !(org.markerAssignments[k] ?? []).includes(marker.id)) org = toggleMarker(org, k, marker.id);
  }
  return { org, affected };
}

export function deleteMarker(o: Organisation, id: string): { org: Organisation; affected: string[] } {
  const affected = Object.keys(o.markerAssignments).filter((k) => o.markerAssignments[k].includes(id));
  const markerAssignments = { ...o.markerAssignments };
  for (const k of affected) {
    const next = markerAssignments[k].filter((x) => x !== id);
    if (next.length) markerAssignments[k] = next;
    else delete markerAssignments[k];
  }
  return { org: { ...o, markers: o.markers.filter((m) => m.id !== id), markerAssignments }, affected };
}

/** Étiquette Zotero d'un marqueur. */
export const markerTag = (p: Project, m: Marker) => `${p.sync.tagPrefix.trim() || 'LF'}:marqueur:${m.name}`;

/** Clés Zotero des collections gérées par l'organisation (racine, catégories, supprimées). */
export function organisationCollectionKeys(o: Organisation): string[] {
  return [o.rootMode === 'litflow' ? o.rootKey : null, ...o.categories.map((c) => c.zoteroKey), ...o.deletedZoteroKeys].filter(
    (k): k is string => !!k,
  );
}

/**
 * Plan tapé à la main : une catégorie par ligne ; une ligne qui commence par
 * des espaces, un tiret ou « > » devient une sous-catégorie de la précédente.
 */
export function planFromText(p: Project, planName: string, text: string): Organisation {
  const base = fromTemplate(p, 'vide', planName || 'Mon plan');
  const categories: Category[] = [];
  let parent: Category | null = null;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    const isSub = /^(\s{2,}|\t|\s*[-–•>]\s*)/.test(raw) && !!parent;
    const name = raw.replace(/^[\s\-–•>]+/, '').trim();
    if (!name) continue;
    if (isSub) categories.push(newCategory(name, parent!.id));
    else {
      parent = newCategory(name);
      categories.push(parent);
    }
  }
  return { ...base, categories };
}
