// Accès à l'IA locale depuis l'interface : calcul de « plongements » (vecteurs
// qui représentent le sens d'un texte), avec cache dans le navigateur pour ne
// jamais recalculer deux fois le même texte.
import { createStore, getMany, setMany } from 'idb-keyval';

export type Vector = Float32Array;
export type Progress = (info: { phase: 'download' | 'analyse'; done: number; total: number }) => void;

const MODEL_VERSION = 'e5-small-q8';
const cache = createStore('litflow-ai', 'embeddings');

/** Permet aux tests (et aux curieux) de brancher un autre calcul de vecteurs. */
declare global {
  var __LITFLOW_EMBED__: ((texts: string[]) => Promise<Vector[]>) | undefined;
}

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (v: Vector[]) => void; reject: (e: Error) => void }>();
let onDownload: Progress | undefined;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onDownload?.({ phase: 'download', done: m.loaded, total: m.total });
      else if (m.type === 'result') waiting.get(m.id)?.resolve(m.vectors);
      else if (m.type === 'error') waiting.get(m.id)?.reject(new Error(m.message));
      if (m.type !== 'progress') waiting.delete(m.id);
    };
  }
  return worker;
}

function runBatch(texts: string[]): Promise<Vector[]> {
  if (globalThis.__LITFLOW_EMBED__) return globalThis.__LITFLOW_EMBED__(texts);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, texts });
  });
}

function hash(s: string): string {
  // FNV-1a 53 bits : suffisant pour identifier un texte dans le cache.
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Calcule les vecteurs d'une liste de textes. Le modèle e5 attend le préfixe
 * « query: » pour une question/un critère et « passage: » pour un document.
 */
export async function embed(texts: string[], onProgress?: Progress): Promise<Vector[]> {
  onDownload = onProgress;
  const keys = texts.map((t) => `${MODEL_VERSION}|${hash(t)}`);
  let cached: (Vector | undefined)[] = [];
  try {
    cached = await getMany<Vector>(keys, cache);
  } catch {
    cached = [];
  }
  const out: Vector[] = new Array(texts.length);
  const todo: number[] = [];
  texts.forEach((_, i) => (cached[i] ? (out[i] = cached[i]!) : todo.push(i)));

  const BATCH = 16;
  for (let b = 0; b < todo.length; b += BATCH) {
    const idx = todo.slice(b, b + BATCH);
    const vecs = await runBatch(idx.map((i) => texts[i].slice(0, 2000)));
    idx.forEach((i, j) => (out[i] = vecs[j]));
    try {
      await setMany(idx.map((i, j) => [keys[i], vecs[j]]), cache);
    } catch {
      /* cache indisponible : pas grave */
    }
    onProgress?.({ phase: 'analyse', done: Math.min(b + BATCH, todo.length), total: todo.length });
  }
  return out;
}
