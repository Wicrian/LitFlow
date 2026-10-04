// Client minimal de l'API Web Zotero v3 (https://www.zotero.org/support/dev/web_api/v3/start).
// Tout passe par HTTPS directement depuis le navigateur : aucun serveur LitFlow
// n'est nécessaire et la clé API ne quitte jamais votre ordinateur (sauf vers zotero.org).

import type { ZoteroLibrary } from '../types';

const BASE = 'https://api.zotero.org';

export interface ZCollection {
  key: string;
  version: number;
  data: { key: string; name: string; parentCollection: string | false };
  meta?: { numItems?: number; numCollections?: number };
}

export interface ZItemData {
  key: string;
  version: number;
  itemType: string;
  title?: string;
  creators?: { creatorType: string; firstName?: string; lastName?: string; name?: string }[];
  abstractNote?: string;
  date?: string;
  DOI?: string;
  url?: string;
  publicationTitle?: string;
  bookTitle?: string;
  proceedingsTitle?: string;
  university?: string;
  publisher?: string;
  language?: string;
  pages?: string;
  numPages?: string;
  extra?: string;
  tags?: { tag: string; type?: number }[];
  collections?: string[];
  parentItem?: string;
  note?: string;
  contentType?: string;
  linkMode?: string;
  [k: string]: unknown;
}

export interface ZItem {
  key: string;
  version: number;
  data: ZItemData;
}

export class ZoteroError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ZoteroClient {
  /** Dernière version de bibliothèque renvoyée par Zotero (en-tête Last-Modified-Version). */
  libraryVersion: number | null = null;

  constructor(
    private apiKey: string,
    public library: Pick<ZoteroLibrary, 'type' | 'id'> | null = null,
  ) {}

  private get prefix(): string {
    if (!this.library) throw new Error('Aucune bibliothèque Zotero sélectionnée');
    return `/${this.library.type === 'group' ? 'groups' : 'users'}/${this.library.id}`;
  }

  async request(path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Zotero-API-Version', '3');
    headers.set('Zotero-API-Key', this.apiKey);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const res = await fetch(BASE + path, { ...init, headers });

    // Respect des limites de débit de Zotero.
    const backoff = Number(res.headers.get('Backoff') || 0);
    if (backoff) await sleep(backoff * 1000);
    if ((res.status === 429 || res.status === 503) && attempt < 5) {
      const retry = Number(res.headers.get('Retry-After') || 2 ** attempt);
      await sleep(retry * 1000);
      return this.request(path, init, attempt + 1);
    }
    const lmv = Number(res.headers.get('Last-Modified-Version'));
    if (lmv) this.libraryVersion = Math.max(this.libraryVersion ?? 0, lmv);
    if (res.status === 304) return res;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const hint =
        res.status === 403
          ? ' — vérifiez que la clé API a les droits de lecture ET d’écriture sur cette bibliothèque.'
          : '';
      throw new ZoteroError(`Zotero ${res.status}: ${text || res.statusText}${hint}`, res.status);
    }
    return res;
  }

  async json<T>(path: string, init?: RequestInit): Promise<T> {
    return (await this.request(path, init)).json() as Promise<T>;
  }

  /** Récupère toutes les pages d'une liste (100 par requête). */
  async all<T>(path: string, onProgress?: (done: number, total: number) => void): Promise<T[]> {
    const out: T[] = [];
    let start = 0;
    const sep = path.includes('?') ? '&' : '?';
    for (;;) {
      const res = await this.request(`${path}${sep}limit=100&start=${start}`);
      const page = (await res.json()) as T[];
      out.push(...page);
      const total = Number(res.headers.get('Total-Results') || out.length);
      onProgress?.(out.length, total);
      if (page.length === 0 || out.length >= total) break;
      start += page.length;
    }
    return out;
  }

  // ---- Compte et bibliothèques ----

  async currentKey(): Promise<{ userID: number; username: string; access: unknown }> {
    return this.json('/keys/current');
  }

  async groups(userId: string): Promise<{ id: number; data: { name: string } }[]> {
    return this.json(`/users/${userId}/groups`);
  }

  // ---- Collections ----

  collections(): Promise<ZCollection[]> {
    return this.all<ZCollection>(`${this.prefix}/collections`);
  }

  async createCollection(name: string, parentCollection?: string): Promise<string> {
    const res = await this.json<{ successful: Record<string, ZCollection>; failed: Record<string, { message: string }> }>(
      `${this.prefix}/collections`,
      { method: 'POST', body: JSON.stringify([{ name, parentCollection: parentCollection || false }]) },
    );
    const ok = res.successful['0'];
    if (!ok) throw new Error(`Création de la collection « ${name} » impossible : ${res.failed['0']?.message}`);
    return ok.key;
  }

  /** Renomme (ou déplace) une collection. */
  async updateCollection(key: string, version: number, data: { name?: string; parentCollection?: string | false }): Promise<void> {
    await this.request(`${this.prefix}/collections/${key}`, {
      method: 'PATCH',
      headers: { 'If-Unmodified-Since-Version': String(version) },
      body: JSON.stringify(data),
    });
  }

  /** Supprime une collection. Les références qu'elle contenait restent dans la bibliothèque. */
  async deleteCollection(key: string, version: number): Promise<void> {
    await this.request(`${this.prefix}/collections/${key}`, {
      method: 'DELETE',
      headers: { 'If-Unmodified-Since-Version': String(version) },
    });
  }

  // ---- Items ----

  /** Items de premier niveau d'une collection (sans pièces jointes ni notes). */
  collectionItems(collectionKey: string, onProgress?: (done: number, total: number) => void): Promise<ZItem[]> {
    return this.all<ZItem>(`${this.prefix}/collections/${collectionKey}/items/top?format=json`, onProgress);
  }

  /** Items de premier niveau modifiés depuis une version de la bibliothèque. */
  itemsSince(version: number): Promise<ZItem[]> {
    return this.all<ZItem>(`${this.prefix}/items/top?since=${version}&format=json`);
  }

  /** Items portant une étiquette donnée (y compris les notes indépendantes). */
  itemsWithTag(tag: string): Promise<ZItem[]> {
    return this.all<ZItem>(`${this.prefix}/items?tag=${encodeURIComponent(tag)}&format=json`);
  }

  itemsByKeys(keys: string[]): Promise<ZItem[]> {
    return this.json<ZItem[]>(`${this.prefix}/items?itemKey=${keys.join(',')}&format=json&limit=50`);
  }

  children(itemKey: string): Promise<ZItem[]> {
    return this.json<ZItem[]>(`${this.prefix}/items/${itemKey}/children?format=json`);
  }

  /**
   * Met à jour ou crée jusqu'à 50 objets en une requête. Pour une mise à jour,
   * chaque objet contient `key` et `version` et seuls les champs fournis sont
   * modifiés (sémantique PATCH).
   */
  async writeItems(
    objects: Partial<ZItemData>[],
  ): Promise<{ successful: Record<string, ZItem>; unchanged: Record<string, string>; failed: Record<string, { key?: string; code: number; message: string }> }> {
    return this.json(`${this.prefix}/items`, { method: 'POST', body: JSON.stringify(objects) });
  }
}

/** Lien qui ouvre l'item dans Zotero sur l'ordinateur. */
export function zoteroSelectLink(lib: ZoteroLibrary | null, itemKey: string): string {
  if (lib?.type === 'group') return `zotero://select/groups/${lib.id}/items/${itemKey}`;
  return `zotero://select/library/items/${itemKey}`;
}

export function zoteroOpenPdfLink(lib: ZoteroLibrary | null, attachmentKey: string): string {
  if (lib?.type === 'group') return `zotero://open-pdf/groups/${lib.id}/items/${attachmentKey}`;
  return `zotero://open-pdf/library/items/${attachmentKey}`;
}
