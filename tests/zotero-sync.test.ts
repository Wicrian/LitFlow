// Test d'intégration : import + synchronisation contre un faux serveur Zotero en mémoire.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newProject } from '../src/lib/frameworks';
import { ZoteroClient, type ZCollection, type ZItem } from '../src/zotero/api';
import { mergeImport } from '../src/zotero/mapping';
import { importFromZotero, pushToZotero } from '../src/zotero/sync';

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
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', ...headers } });

  if (method === 'GET' && path === '/collections') return json(collections, { 'Total-Results': String(collections.length) });
  const m = path.match(/^\/collections\/(\w+)\/items\/top$/);
  if (method === 'GET' && m) {
    const all = [...items.values()].filter((i) => i.data.collections?.includes(m[1]) && !i.data.parentItem);
    const start = Number(u.searchParams.get('start') ?? 0);
    const limit = Number(u.searchParams.get('limit') ?? 100);
    return json(all.slice(start, start + limit), { 'Total-Results': String(all.length) });
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
});
