// Travailleur (Web Worker) qui fait tourner le modèle d'IA dans le navigateur,
// sans bloquer l'interface. Le modèle est téléchargé une seule fois depuis
// Hugging Face puis gardé en cache par le navigateur ; les textes analysés
// ne quittent jamais l'ordinateur.

// Modèle multilingue (français, anglais, espagnol…) d'environ 120 Mo.
const MODEL_ID = 'Xenova/multilingual-e5-small';
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';

type Extractor = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>;

let extractor: Promise<Extractor> | null = null;

function load(): Promise<Extractor> {
  extractor ??= (async () => {
    const tf = await import(/* @vite-ignore */ TRANSFORMERS_URL);
    return tf.pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (e.status === 'progress' && e.total) postMessage({ type: 'progress', loaded: e.loaded, total: e.total, file: e.file });
      },
    }) as Promise<Extractor>;
  })();
  return extractor;
}

self.onmessage = async (e: MessageEvent<{ id: number; texts: string[] }>) => {
  const { id, texts } = e.data;
  try {
    const model = await load();
    const out = await model(texts, { pooling: 'mean', normalize: true });
    const dim = out.dims[out.dims.length - 1];
    const vectors = texts.map((_, i) => out.data.slice(i * dim, (i + 1) * dim));
    postMessage({ type: 'result', id, vectors }, { transfer: vectors.map((v) => v.buffer) });
  } catch (err) {
    extractor = null;
    postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
