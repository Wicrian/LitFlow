// Test d'intégration : import + synchronisation contre un faux serveur Zotero en mémoire.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newProject } from '../src/lib/frameworks';
import { ZoteroClient, type ZCollection, type ZItem } from '../src/zotero/api';
import { mergeImport } from '../src/zotero/mapping';
import { importFromZotero, pushToZotero } from '../src/zotero/sync';
import { applyChanges, fetchChanges } from '../src/zotero/pull';
import { readSnapshots, restoreSnapshot, saveSnapshot } from '../src/zotero/snapshot';

let collections: ZCollection[];
let items: Map<string, ZItem>;
let version: number;
let seq: number;

function item(key: string, title: string, cols: string[], extra: Record<string, unknown> = {}): ZItem {
  return { key, version: 1, data: { key, version: 1, itemType: 'journalArticle', title, collections: cols, tags: [{ tag: 'à lire' }], ...extra } };
}

function fakeZotero(url: string, init: RequestInit = {}): Response {
  const u = new URL(url);
  const path = u.pathname.replace(/^\/users\/1/, '');
  const method = init.method ?? 'GET';
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Last-Modified-Version': String(version), ...headers },
    });

  if (method === 'GET' && path === '/collections') return json(collections, { 'Total-Results': String(collections.length) });
  const m = path.match(/^\/collections\/(\w+)\/items\/top$/);
  if (method === 'GET' && m) {
    const all = [...items.values()].filter((i) => i.data.collections?.includes(m[1]) && !i.data.parentItem);
    const start = Number(u.searchParams.get('start') ?? 0);
    const limit = Number(u.searchParams.get('limit') ?? 100);
    return json(all.slice(start, start + limit), { 'Total-Results': String(all.length) });
  }
  if (method === 'GET' && path === '/items/top' && u.searchParams.has('since')) {
    const since = Number(u.searchParams.get('since'));
    const all = [...items.values()].filter((i) => i.version > since && !i.data.parentItem);
    return json(all, { 'Total-Results': String(all.length) });
  }
  if (method === 'GET' && path === '/items' && u.searchParams.has('tag')) {
    const tag = u.searchParams.get('tag');
    const all = [...items.values()].filter((i) => i.data.tags?.some((t) => t.tag === tag));
    return json(all, { 'Total-Results': String(all.length) });
  }
  if (method === 'GET' && path === '/items') {
    const keys = (u.searchParams.get('itemKey') ?? '').split(',');
    return json(keys.map((k) => items.get(k)).filter(Boolean));
  }
  if (method === 'POST' && path === '/collections') {
    const [c] = JSON.parse(String(init.body));
    const key = `C${++seq}`;
    const col = { key, version: ++version, data: { key, name: c.name, parentCollection: c.parentCollection } };
    collections.push(col);
    return json({ successful: { 0: col }, unchanged: {}, failed: {} });
  }
  if (method === 'POST' && path === '/items') {
    const objs = JSON.parse(String(init.body)) as Record<string, unknown>[];
    const res = { successful: {} as Record<string, ZItem>, unchanged: {}, failed: {} as Record<string, unknown> };
    objs.forEach((o, i) => {
      if (o.key) {
        const cur = items.get(o.key as string)!;
        if (cur.version !== o.version) return (res.failed[i] = { key: o.key, code: 412, message: 'version' });
        const v = ++version;
        const next = { key: cur.key, version: v, data: { ...cur.data, ...o, version: v } } as ZItem;
        items.set(cur.key, next);
        res.successful[i] = next;
      } else {
        const key = `N${++seq}`;
        const next = { key, version: ++version, data: { ...o, key, version } } as ZItem;
        items.set(key, next);
        res.successful[i] = next;
      }
    });
    return json(res);
  }
  return new Response('not found', { status: 404 });
}

beforeEach(() => {
  version = 10;
  seq = 0;
  collections = [
    { key: 'ROOT', version: 1, data: { key: 'ROOT', name: 'Ma revue', parentCollection: false } },
    { key: 'PUB', version: 1, data: { key: 'PUB', name: 'PubMed', parentCollection: 'ROOT' } },
    { key: 'ERU', version: 1, data: { key: 'ERU', name: 'Érudit', parentCollection: 'ROOT' } },
    { key: 'ERU2', version: 1, data: { key: 'ERU2', name: '2e requête', parentCollection: 'ERU' } },
    { key: 'OTHER', version: 1, data: { key: 'OTHER', name: 'Autre projet', parentCollection: false } },
  ];
  items = new Map(
    [
      item('A', 'Représentations sociales de la santé', ['PUB', 'OTHER']),
      item('B', 'Étude québécoise sur l’épuisement', ['ERU']),
      item('C', 'Troisième référence', ['ERU2']),
      { key: 'ATT', version: 1, data: { key: 'ATT', version: 1, itemType: 'attachment', parentItem: 'A', collections: [] } },
    ].map((i) => [i.key, i]),
  );
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => fakeZotero(url, init)));
});

describe('Zotero', () => {
  it('importe par source, puis synchronise collections, étiquettes et notes', async () => {
    const client = new ZoteroClient('key', { type: 'user', id: '1' });
    let p = newProject('Test');
    p.library = { type: 'user', id: '1', name: 'Moi' };
    p.sourceCollection = { key: 'ROOT', name: 'Ma revue' };

    const { records, sources } = await importFromZotero(client, p);
    p = mergeImport({ ...p, sources }, records).project;
    expect(Object.keys(p.records).sort()).toEqual(['A', 'B', 'C']);
    expect(p.records.C.sources).toEqual(['Érudit']); // sous-sous-collection rattachée à sa source
    expect(p.records.A.title).toBe('Représentations sociales de la santé');

    p.screening = {
      A: { decision: 'exclude', reasons: ['Hors sujet'], note: 'Adultes seulement', at: '' },
      B: { decision: 'include', reasons: [], note: '', at: '' },
    };
    const res = await pushToZotero(client, p, ['A', 'B']);
    expect(res.failed).toEqual([]);
    p = res.project;

    const names = collections.filter((c) => c.data.parentCollection === p.zoteroCollections.root).map((c) => c.data.name);
    expect(names).toContain('1 – Tri titre-résumé · Exclus');
    const a = items.get('A')!.data;
    expect(a.title).toBe('Représentations sociales de la santé'); // jamais modifié
    expect(a.collections).toEqual(['PUB', 'OTHER', p.zoteroCollections.screening_exclude]);
    expect(a.tags!.map((t) => t.tag)).toEqual(['à lire', 'LF:tri:exclu', 'LF:tri:raison:Hors sujet']);
    const note = items.get(p.zoteroNotes.A)!.data;
    expect(note.parentItem).toBe('A');
    expect(note.note).toContain('Adultes seulement');
    expect(p.zoteroNotes.B).toBeUndefined(); // pas de note sans raison ni commentaire

    // Changement d'avis : A passe en inclus -> retiré de « Exclus », ajouté à « Inclus », note mise à jour.
    p.screening.A = { decision: 'include', reasons: [], note: 'Finalement pertinent', at: '' };
    const res2 = await pushToZotero(client, p, ['A']);
    expect(res2.failed).toEqual([]);
    const a2 = items.get('A')!.data;
    expect(a2.collections).toEqual(['PUB', 'OTHER', p.zoteroCollections.screening_include]);
    expect(a2.tags!.map((t) => t.tag)).toEqual(['à lire', 'LF:tri:inclus']);
    expect(items.get(p.zoteroNotes.A)!.data.note).toContain('Finalement pertinent');

    // Réimport : les collections LitFlow ne sont pas prises pour des sources.
    const again = await importFromZotero(client, res2.project);
    expect(again.sources.map((s) => s.name).sort()).toEqual(['PubMed', 'Érudit']);
  });

  it('reprend les changements faits à la main dans Zotero', async () => {
    const client = new ZoteroClient('key', { type: 'user', id: '1' });
    let p = newProject('Test');
    p.library = { type: 'user', id: '1', name: 'Moi' };
    p.sourceCollection = { key: 'ROOT', name: 'Ma revue' };
    const imp = await importFromZotero(client, p);
    p = mergeImport({ ...p, sources: imp.sources }, imp.records).project;
    p.sync = { ...p.sync, sourceMap: imp.sourceMap, libraryVersion: imp.libraryVersion };
    const d = (decision: 'include' | 'exclude') => ({ decision, reasons: [], note: 'ma note', at: '' });
    p.screening = { A: d('include'), B: d('include'), C: d('include') };
    p = (await pushToZotero(client, p, ['A', 'B', 'C'])).project;
    const cols = p.zoteroCollections;

    // Dans Zotero : A reçoit l'étiquette « exclu » + une raison (l'ancienne étiquette reste),
    // B est glissé dans la collection « Exclus » (il reste aussi dans « Inclus »),
    // C a été re-modifié dans LitFlow (en attente) : LitFlow garde la main.
    const edit = (key: string, fn: (data: ZItem['data']) => void) => {
      const it = items.get(key)!;
      const v = ++version;
      const data = { ...it.data, version: v };
      fn(data);
      items.set(key, { key, version: v, data });
    };
    edit('A', (x) => x.tags!.push({ tag: 'LF:tri:exclu' }, { tag: 'LF:tri:raison:Hors période' }));
    edit('B', (x) => x.collections!.push(cols.screening_exclude));
    edit('C', (x) => (x.tags = x.tags!.filter((t) => t.tag !== 'LF:tri:inclus')));
    p.sync.pending = ['C'];
    // Nouvelle référence ajoutée dans la sous-collection PubMed.
    items.set('D', { ...item('D', 'Nouvelle étude', ['PUB']), version: ++version });

    const { incoming, libraryVersion } = await fetchChanges(client, p);
    const res = applyChanges(p, incoming, libraryVersion);
    expect(res.changed.sort()).toEqual(['A', 'B']);
    expect(res.added).toBe(1);
    expect(res.project.screening.A).toMatchObject({ decision: 'exclude', reasons: ['Hors période'], note: 'ma note' });
    expect(res.project.screening.B.decision).toBe('exclude');
    expect(res.project.screening.C.decision).toBe('include');
    expect(res.project.records.D.sources).toEqual(['PubMed']);
    expect(res.project.sync.libraryVersion).toBe(version);

    // Au prochain envoi, Zotero est nettoyé (une seule décision par étape).
    const pushed = await pushToZotero(client, res.project, ['A', 'B']);
    expect(pushed.failed).toEqual([]);
    expect(items.get('A')!.data.tags!.map((t) => t.tag)).toEqual(['à lire', 'LF:tri:exclu', 'LF:tri:raison:Hors période']);
    expect(items.get('B')!.data.collections).toEqual(['ERU', cols.screening_exclude]);
  });

  it('sauvegarde le projet dans Zotero et le reprend sur un autre appareil', async () => {
    const client = new ZoteroClient('key', { type: 'user', id: '1' });
    let p = newProject('Revue iPad');
    p.library = { type: 'user', id: '1', name: 'Moi' };
    p.sourceCollection = { key: 'ROOT', name: 'Ma revue' };
    p.question = 'Quelle est la question ?';
    p.inclusionCriteria = ['Adultes'];
    p.reasons.screening.exclude.push('Ma raison à moi');
    const imp = await importFromZotero(client, p);
    p = mergeImport({ ...p, sources: imp.sources }, imp.records).project;
    p.sources = p.sources.map((s) => (s.name === 'Érudit' ? { ...s, kind: 'other' } : s));
    p.screening = { A: { decision: 'exclude', reasons: ['Hors sujet', 'Adultes'], note: 'Note de lecture', at: '2026-01-01' } };
    p = (await pushToZotero(client, p, ['A'])).project;

    const saved = await saveSnapshot(client, p);
    expect(saved).not.toBeNull();
    p = { ...p, zoteroCollections: saved!.zoteroCollections, sync: { ...p.sync, ...saved!.sync } };
    expect(await saveSnapshot(client, p)).toBeNull(); // rien n'a changé : pas de nouvelle écriture

    // Plus tard, dans Zotero : B est exclu à la main.
    const b = items.get('B')!;
    items.set('B', { ...b, version: ++version, data: { ...b.data, tags: [...b.data.tags!, { tag: 'LF:tri:exclu' }] } });

    // Nouvel appareil : rien en local.
    const found = await readSnapshots(client, { type: 'user', id: '1', name: 'Moi' });
    expect(found).toHaveLength(1);
    expect(found[0].project.name).toBe('Revue iPad');
    const restored = await restoreSnapshot(client, found[0]);
    expect(restored.id).toBe(p.id);
    expect(restored.question).toBe('Quelle est la question ?');
    expect(restored.reasons.screening.exclude).toContain('Ma raison à moi');
    expect(restored.sources.find((s) => s.name === 'Érudit')!.kind).toBe('other');
    expect(Object.keys(restored.records).sort()).toEqual(['A', 'B', 'C']);
    expect(restored.screening.A).toMatchObject({ decision: 'exclude', reasons: ['Hors sujet', 'Adultes'], note: 'Note de lecture' });
    expect(restored.screening.B.decision).toBe('exclude');
  });
});
