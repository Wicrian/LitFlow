// Synchronisation de la STRUCTURE du plan de classement avec Zotero :
// une collection racine « 4 – Organisation · … » (ou une collection existante)
// et une sous-collection par catégorie (2 niveaux). Dans les deux sens :
//   * catégorie créée / renommée / supprimée dans LitFlow -> idem dans Zotero ;
//   * sous-collection créée / renommée / supprimée dans Zotero -> idem dans LitFlow.
// Supprimer une collection Zotero ne supprime jamais les références qu'elle contient.

import type { Category, Organisation, Project, RecordItem } from '../types';
import { newCategory, newMarker, MARKER_COLORS, markerTag } from '../lib/organisation';
import type { ZCollection, ZoteroClient } from './api';

export const organisationRootName = (o: Organisation) => `4 – Organisation · ${o.name}`;

export interface StructureResult {
  org: Organisation;
  /** Catégories supprimées dans Zotero (donc retirées de LitFlow). */
  removedIds: string[];
}

/**
 * Met en accord la structure LitFlow et Zotero. `collections` est la liste
 * actuelle des collections de la bibliothèque.
 */
export async function syncOrganisationStructure(
  client: ZoteroClient,
  p: Project,
  collections: ZCollection[],
): Promise<StructureResult> {
  let o: Organisation = { ...p.organisation, categories: p.organisation.categories.map((c) => ({ ...c })) };
  if (!o.name) return { org: o, removedIds: [] };
  const byKey = new Map(collections.map((c) => [c.key, c]));
  // La collection de recherche et les collections LitFlow ne deviennent jamais des catégories.
  const excluded = new Set([p.sourceCollection?.key, ...Object.values(p.zoteroCollections)].filter(Boolean));
  const childrenOf = (key: string) => collections.filter((c) => c.data.parentCollection === key && !excluded.has(c.key));

  // 1. Collections supprimées depuis LitFlow
  for (const key of o.deletedZoteroKeys) {
    const c = byKey.get(key);
    if (c) await client.deleteCollection(key, c.version);
    byKey.delete(key);
  }
  o = { ...o, deletedZoteroKeys: [] };

  // 2. Racine
  let root = o.rootKey && byKey.has(o.rootKey) ? byKey.get(o.rootKey)! : null;
  if (!root) {
    if (o.rootMode === 'existing') throw new Error('La collection Zotero choisie pour l’organisation est introuvable (supprimée ?).');
    const parent = p.zoteroCollections.root;
    const found = collections.find((c) => c.data.parentCollection === (parent ?? false) && c.data.name === organisationRootName(o));
    const key = found?.key ?? (await client.createCollection(organisationRootName(o), parent));
    o = { ...o, rootKey: key };
  } else if (o.rootMode === 'litflow' && root.data.name !== organisationRootName(o)) {
    await client.updateCollection(root.key, root.version, { name: organisationRootName(o) });
  }
  const rootKey = o.rootKey!;

  // 3. Catégories connues
  const removedIds: string[] = [];
  const linked = new Set<string>();
  const ordered = [...o.categories.filter((c) => !c.parent), ...o.categories.filter((c) => c.parent)];
  for (const cat of ordered) {
    const parentKey = cat.parent ? o.categories.find((x) => x.id === cat.parent)?.zoteroKey : rootKey;
    if (!parentKey) continue; // le parent sera créé au prochain passage
    if (cat.zoteroKey) {
      const z = byKey.get(cat.zoteroKey);
      if (!z) {
        removedIds.push(cat.id); // supprimée dans Zotero
        continue;
      }
      linked.add(z.key);
      if (cat.syncedName !== null && z.data.name !== cat.syncedName && cat.name === cat.syncedName) {
        cat.name = z.data.name; // renommée dans Zotero
      } else if (z.data.name !== cat.name) {
        await client.updateCollection(z.key, z.version, { name: cat.name });
      }
      cat.syncedName = cat.name;
    } else {
      const existing = childrenOf(parentKey).find((c) => c.data.name === cat.name && !linked.has(c.key));
      cat.zoteroKey = existing?.key ?? (await client.createCollection(cat.name, parentKey));
      cat.syncedName = cat.name;
      linked.add(cat.zoteroKey);
    }
  }

  // 4. Sous-collections créées dans Zotero (2 niveaux)
  let categories = o.categories.filter((c) => !removedIds.includes(c.id) && !removedIds.includes(c.parent ?? ''));
  for (const z of childrenOf(rootKey)) {
    if (linked.has(z.key)) continue;
    const c = { ...newCategory(z.data.name), zoteroKey: z.key, syncedName: z.data.name };
    categories.push(c);
    linked.add(z.key);
  }
  for (const top of categories.filter((c) => !c.parent && c.zoteroKey)) {
    for (const z of childrenOf(top.zoteroKey!)) {
      if (linked.has(z.key)) continue;
      categories.push({ ...newCategory(z.data.name, top.id), zoteroKey: z.key, syncedName: z.data.name });
      linked.add(z.key);
    }
  }
  const assignments = Object.fromEntries(
    Object.entries(o.assignments)
      .map(([k, ids]) => [k, ids.filter((id) => categories.some((c) => c.id === id))] as const)
      .filter(([, ids]) => ids.length),
  );
  categories = categories.map((c) => (c.parent && !categories.some((x) => x.id === c.parent) ? { ...c, parent: null } : c));
  return { org: { ...o, categories, assignments, structureDirty: false }, removedIds };
}

/**
 * Applique le résultat d'une synchronisation de structure à l'état ACTUEL
 * (l'utilisateur a pu modifier l'organisation pendant la synchronisation).
 */
export function mergeStructure(start: Organisation, res: StructureResult, cur: Organisation): Organisation {
  const resById = new Map(res.org.categories.map((c) => [c.id, c]));
  const startById = new Map(start.categories.map((c) => [c.id, c]));
  const categories: Category[] = cur.categories
    .filter((c) => !res.removedIds.includes(c.id))
    .map((c) => {
      const r = resById.get(c.id);
      if (!r) return c;
      const renamedMeanwhile = c.name !== startById.get(c.id)?.name;
      return { ...c, zoteroKey: r.zoteroKey, syncedName: r.syncedName, name: renamedMeanwhile ? c.name : r.name, parent: r.parent ?? c.parent };
    });
  for (const r of res.org.categories) if (!startById.has(r.id) && !categories.some((c) => c.id === r.id)) categories.push(r);
  const shape = (o: Organisation['categories']) => JSON.stringify(o.map((c) => [c.id, c.name, c.parent]));
  const changedMeanwhile = shape(cur.categories) !== shape(start.categories) || cur.deletedZoteroKeys.length > start.deletedZoteroKeys.length;
  const assignments = Object.fromEntries(
    Object.entries(cur.assignments)
      .map(([k, ids]) => [k, ids.filter((id) => !res.removedIds.includes(id))] as const)
      .filter(([, ids]) => ids.length),
  );
  return {
    ...cur,
    rootKey: res.org.rootKey,
    categories,
    assignments,
    deletedZoteroKeys: cur.deletedZoteroKeys.filter((k) => !start.deletedZoteroKeys.includes(k)),
    structureDirty: changedMeanwhile,
  };
}

/** Reprend une collection Zotero existante comme plan de classement. */
export function adoptExistingRoot(p: Project, collections: ZCollection[], rootKey: string, name: string): Organisation {
  const root = collections.find((c) => c.key === rootKey);
  // Jamais la collection de résultats de recherche ni les collections LitFlow comme catégories.
  const excluded = new Set([p.sourceCollection?.key, ...Object.values(p.zoteroCollections)].filter(Boolean));
  const children = (key: string) => collections.filter((c) => c.data.parentCollection === key && !excluded.has(c.key));
  const categories: Category[] = [];
  for (const z of children(rootKey)) {
    const top = { ...newCategory(z.data.name), zoteroKey: z.key, syncedName: z.data.name };
    categories.push(top);
    for (const s of children(z.key))
      categories.push({ ...newCategory(s.data.name, top.id), zoteroKey: s.key, syncedName: s.data.name });
  }
  const byKey = new Map(categories.map((c) => [c.zoteroKey!, c.id]));
  const assignments: Record<string, string[]> = {};
  for (const r of Object.values(p.records)) {
    const ids = r.collections.map((k) => byKey.get(k)).filter((x): x is string => !!x);
    if (ids.length) assignments[r.key] = ids;
  }
  return {
    ...p.organisation,
    name: name.trim() || root?.data.name || 'Organisation',
    rootMode: 'existing',
    rootKey,
    categories,
    assignments,
    markers: p.organisation.markers,
    deletedZoteroKeys: [],
    structureDirty: false,
  };
}

/**
 * Reprend dans LitFlow les classements faits à la main dans Zotero
 * (référence glissée dans une sous-collection, étiquette LF:marqueur:… ajoutée).
 * `localCats` / `localMarkers` : ce que LitFlow a envoyé à Zotero pour cette référence.
 */
export function reconcileOrganisation(p: Project, records: RecordItem[], pending: Set<string>): { org: Organisation; changed: string[] } {
  let o = p.organisation;
  if (!o.name && !o.markers.length) return { org: o, changed: [] };
  const catByKey = new Map(o.categories.filter((c) => c.zoteroKey).map((c) => [c.zoteroKey!, c.id]));
  const prefix = `${p.sync.tagPrefix.trim() || 'LF'}:marqueur:`;
  const changed: string[] = [];
  let markers = o.markers;
  const assignments = { ...o.assignments };
  const markerAssignments = { ...o.markerAssignments };

  for (const r of records) {
    if (pending.has(r.key)) continue;
    // Catégories
    const zCats = r.collections.map((k) => catByKey.get(k)).filter((x): x is string => !!x);
    const local = assignments[r.key] ?? [];
    const localSynced = local.filter((id) => o.categories.find((c) => c.id === id)?.zoteroKey);
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    if (!same(zCats, localSynced)) {
      const next = [...new Set([...zCats, ...local.filter((id) => !localSynced.includes(id))])];
      if (next.length) assignments[r.key] = next;
      else delete assignments[r.key];
      changed.push(r.key);
    }
    // Marqueurs
    const zNames = r.zoteroTags.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));
    for (const n of zNames)
      if (!markers.some((m) => m.name === n)) markers = [...markers, newMarker(n, MARKER_COLORS[markers.length % MARKER_COLORS.length])];
    const zMarkers = zNames.map((n) => markers.find((m) => m.name === n)!.id);
    const lMarkers = markerAssignments[r.key] ?? [];
    if (!same(zMarkers, lMarkers)) {
      if (zMarkers.length) markerAssignments[r.key] = zMarkers;
      else delete markerAssignments[r.key];
      if (!changed.includes(r.key)) changed.push(r.key);
    }
  }
  o = { ...o, markers, assignments, markerAssignments };
  return { org: o, changed };
}

/** Collections et étiquettes d'organisation attendues dans Zotero pour une référence. */
export function organisationTargets(p: Project, key: string): { collections: string[]; tags: string[] } {
  const o = p.organisation;
  const collections = (o.assignments[key] ?? [])
    .map((id) => o.categories.find((c) => c.id === id)?.zoteroKey)
    .filter((k): k is string => !!k);
  const tags = (o.markerAssignments[key] ?? [])
    .map((id) => o.markers.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => markerTag(p, m));
  return { collections, tags };
}
