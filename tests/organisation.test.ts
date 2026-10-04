import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newProject } from '../src/lib/frameworks';
import { deleteCategory, fromTemplate, moveToCategory, newCategory, renameCategory, toggleMarker } from '../src/lib/organisation';
import { ZoteroClient, type ZCollection, type ZItem } from '../src/zotero/api';
import { mergeImport } from '../src/zotero/mapping';
import { adoptExistingRoot, mergeStructure } from '../src/zotero/organisationSync';
import { applyChanges, fetchChanges } from '../src/zotero/pull';
import { importFromZotero, pushToZotero } from '../src/zotero/sync';
import type { Project } from '../src/types';

// Faux serveur Zotero minimal (même principe que zotero-sync.test.ts).
let collections: ZCollection[];
let items: Map<string, ZItem>;
let version: number;
let seq: number;
const item = (key: string, title: string, cols: string[]): ZItem => ({
  key,
  version: 1,
  data: { key, version: 1, itemType: 'journalArticle', title, collections: cols, tags: [{ tag: 'perso' }] },
});

function fake(url: string, init: RequestInit = {}): Response {
  const u = new URL(url);
  const path = u.pathname.replace(/^\/users\/1/, '');
  const method = init.method ?? 'GET';
  const json = (b: unknown, h: Record<string, string> = {}) =>
    new Response(JSON.stringify(b), { status: 200, headers: { 'Last-Modified-Version': String(version), ...h } });
  if (method === 'GET' && path === '/collections') return json(collections, { 'Total-Results': String(collections.length) });
  let m = path.match(/^\/collections\/(\w+)\/items\/top$/);
  if (method === 'GET' && m) {
    const all = [...items.values()].filter((i) => i.data.collections?.includes(m![1]));
    return json(all, { 'Total-Results': String(all.length) });
  }
  if (method === 'GET' && path === '/items/top') {
    const since = Number(u.searchParams.get('since'));
    const all = [...items.values()].filter((i) => i.version > since);
    return json(all, { 'Total-Results': String(all.length) });
  }
  if (method === 'GET' && path === '/items') return json((u.searchParams.get('itemKey') ?? '').split(',').map((k) => items.get(k)).filter(Boolean));
  m = path.match(/^\/collections\/(\w+)$/);
  if (m && (method === 'PATCH' || method === 'DELETE')) {
    const i = collections.findIndex((c) => c.key === m![1]);
    if (method === 'DELETE') collections.splice(i, 1);
    else collections[i] = { ...collections[i], version: ++version, data: { ...collections[i].data, ...JSON.parse(String(init.body)) } };
    return new Response(null, { status: 204 });
  }
  if (method === 'POST' && path === '/collections') {
    const [c] = JSON.parse(String(init.body));
    const key = `C${++seq}`;
    const col = { key, version: ++version, data: { key, name: c.name, parentCollection: c.parentCollection } };
    collections.push(col);
    return json({ successful: { 0: col }, unchanged: {}, failed: {} });
  }
  if (method === 'POST' && path === '/items') {
    const res = { successful: {} as Record<string, ZItem>, unchanged: {}, failed: {} };
    (JSON.parse(String(init.body)) as Record<string, unknown>[]).forEach((o, i) => {
      const cur = items.get(o.key as string);
      if (!cur) return;
      const v = ++version;
      const next = { key: cur.key, version: v, data: { ...cur.data, ...o, version: v } } as ZItem;
      items.set(cur.key, next);
      res.successful[i] = next;
    });
    return json(res);
  }
  return new Response('?', { status: 404 });
}

beforeEach(() => {
  version = 10;
  seq = 0;
  collections = [
    { key: 'SRC', version: 1, data: { key: 'SRC', name: 'Revue', parentCollection: false } },
    { key: 'MINE', version: 1, data: { key: 'MINE', name: 'Mon classement', parentCollection: false } },
    { key: 'M1', version: 1, data: { key: 'M1', name: 'Méthodo', parentCollection: 'MINE' } },
  ];
  items = new Map([item('A', 'Article A', ['SRC', 'M1']), item('B', 'Article B', ['SRC']), item('C', 'Article C', ['SRC'])].map((i) => [i.key, i]));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => fake(url, init)));
});

async function setup(): Promise<{ client: ZoteroClient; p: Project }> {
  const client = new ZoteroClient('k', { type: 'user', id: '1' });
  let p = newProject('Test');
  p.library = { type: 'user', id: '1', name: 'Moi' };
  p.sourceCollection = { key: 'SRC', name: 'Revue' };
  const imp = await importFromZotero(client, p);
  p = mergeImport({ ...p, sources: imp.sources }, imp.records).project;
  p.sync = { ...p.sync, sourceMap: imp.sourceMap, libraryVersion: imp.libraryVersion };
  return { client, p };
}

async function push(client: ZoteroClient, p: Project, keys: string[]): Promise<Project> {
  const res = await pushToZotero(client, p, keys);
  expect(res.failed).toEqual([]);
  return { ...res.project, organisation: res.structure ? mergeStructure(p.organisation, res.structure, p.organisation) : p.organisation };
}

const names = (parent: string) => collections.filter((c) => c.data.parentCollection === parent).map((c) => c.data.name).sort();

describe('organisation', () => {
  it('crée les sous-collections, range les références, pose les marqueurs', async () => {
    const { client, p: p0 } = await setup();
    let p = { ...p0, organisation: fromTemplate(p0, 'memoire', 'Sections du mémoire') };
    const metho = p.organisation.categories.find((c) => c.name === 'Méthodologie')!;
    // Une référence EXCLUE au tri peut quand même aller dans Méthodologie.
    p.screening = { B: { decision: 'exclude', reasons: [], note: '', at: '' } };
    p.organisation = moveToCategory(p.organisation, 'B', null, metho.id);
    p.organisation = toggleMarker(p.organisation, 'B', p.organisation.markers[0].id);
    p = await push(client, p, ['B']);

    const root = collections.find((c) => c.data.name === '4 – Organisation · Sections du mémoire')!;
    expect(root.data.parentCollection).toBe(p.zoteroCollections.root);
    // Dossiers créés à la demande : seulement « Exclus » (une exclusion), pas les autres étapes.
    expect(names(p.zoteroCollections.root)).toEqual(['1 – Tri titre-résumé · Exclus', '4 – Organisation · Sections du mémoire']);
    expect(names(root.key)).toContain('Méthodologie');
    const b = items.get('B')!.data;
    expect(b.collections).toContain(p.organisation.categories.find((c) => c.id === metho.id)!.zoteroKey);
    expect(b.collections).toContain(p.zoteroCollections.screening_exclude);
    expect(b.tags!.map((t) => t.tag)).toEqual(expect.arrayContaining(['perso', 'LF:marqueur:⭐ Important', 'LF:tri:exclu']));
    expect(p.organisation.structureDirty).toBe(false);

    // Renommer puis supprimer une catégorie en déplaçant ses références.
    const disc = p.organisation.categories.find((c) => c.name === 'Discussion')!;
    p.organisation = renameCategory(p.organisation, metho.id, 'Méthodes');
    const del = deleteCategory(p.organisation, metho.id, { kind: 'move', to: disc.id });
    p = await push(client, { ...p, organisation: del.org, sync: { ...p.sync, pending: del.affected } }, del.affected);
    expect(names(root.key)).not.toContain('Méthodologie');
    expect(names(root.key)).not.toContain('Méthodes');
    expect(items.get('B')!.data.collections).toContain(disc.zoteroKey ?? p.organisation.categories.find((c) => c.id === disc.id)!.zoteroKey);
    expect(items.has('B')).toBe(true); // jamais supprimée
  });

  it('reprend une collection existante et les changements faits dans Zotero', async () => {
    const { client, p: p0 } = await setup();
    let p: Project = { ...p0, organisation: adoptExistingRoot(p0, collections, 'MINE', '') };
    expect(p.organisation.name).toBe('Mon classement');
    const metho = p.organisation.categories.find((c) => c.name === 'Méthodo')!;
    expect(p.organisation.assignments.A).toEqual([metho.id]);
    p = await push(client, p, []);
    p = { ...p, sync: { ...p.sync, lastSync: p.sync.lastSync ?? 'x' } };

    // Dans Zotero : nouvelle sous-collection « Concepts », C y est glissé, A reçoit un marqueur.
    collections.push({ key: 'M2', version: ++version, data: { key: 'M2', name: 'Concepts', parentCollection: 'MINE' } });
    const c = items.get('C')!;
    items.set('C', { ...c, version: ++version, data: { ...c.data, collections: [...c.data.collections!, 'M2'] } });
    const a = items.get('A')!;
    items.set('A', { ...a, version: ++version, data: { ...a.data, tags: [...a.data.tags!, { tag: 'LF:marqueur:À relire' }] } });

    // Lecture : structure puis références.
    const { syncOrganisationStructure } = await import('../src/zotero/organisationSync');
    const s = await syncOrganisationStructure(client, p, collections);
    p = { ...p, organisation: mergeStructure(p.organisation, s, p.organisation) };
    const concepts = p.organisation.categories.find((x) => x.name === 'Concepts')!;
    expect(concepts.zoteroKey).toBe('M2');
    const { incoming, libraryVersion } = await fetchChanges(client, p);
    p = applyChanges(p, incoming, libraryVersion).project;
    expect(p.organisation.assignments.C).toEqual([concepts.id]);
    const relire = p.organisation.markers.find((m) => m.name === 'À relire')!;
    expect(p.organisation.markerAssignments.A).toEqual([relire.id]);
    expect(newCategory('x').zoteroKey).toBeNull();
  });
});
