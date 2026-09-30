/**
 * Normalise un texte UNIQUEMENT pour le comparer (détection des doublons,
 * recherche). Le texte affiché et envoyé à Zotero n'est jamais modifié :
 * « Représentations sociales » reste « Représentations sociales ».
 */
export function normalizeForCompare(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function normalizeDoi(doi: string): string {
  return (doi || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '');
}

/** Coefficient de Dice sur les bigrammes de caractères (0 à 1). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let inter = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) {
      grams.set(g, n - 1);
      inter++;
    }
  }
  return (2 * inter) / (a.length + b.length - 2);
}

export function splitKeywords(s: string): string[] {
  return (s || '')
    .split(/[,;\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export type Segment = { text: string; mark?: 'include' | 'exclude' };

/**
 * Découpe un texte en segments surlignés. La recherche ignore les accents et
 * la casse, et accepte un astérisque final comme troncature (ex. « enfan* »).
 */
export function highlight(text: string, include: string[], exclude: string[]): Segment[] {
  if (!text) return [];
  const terms = [
    ...include.map((k) => ({ k, mark: 'include' as const })),
    ...exclude.map((k) => ({ k, mark: 'exclude' as const })),
  ].filter((t) => t.k.length > 1);
  if (!terms.length) return [{ text }];

  // Comparaison caractère par caractère sur une version sans accents mais de même longueur.
  const folded = Array.from(text)
    .map((c) => c.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().charAt(0) || c)
    .join('');
  const chars = Array.from(text);
  const marks: (Segment['mark'] | undefined)[] = new Array(chars.length);

  for (const { k, mark } of terms) {
    const trunc = k.endsWith('*');
    const needle = normalizeForCompare(trunc ? k.slice(0, -1) : k);
    if (!needle) continue;
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(needle).replace(/ /g, '[^\\p{L}\\p{N}]+')}${trunc ? '[\\p{L}\\p{N}]*' : '(?![\\p{L}\\p{N}])'}`,
      'gu',
    );
    for (const m of folded.matchAll(re)) {
      const start = Array.from(folded.slice(0, m.index)).length;
      const len = Array.from(m[0]).length;
      for (let i = start; i < start + len; i++) marks[i] ??= mark;
    }
  }

  const out: Segment[] = [];
  for (let i = 0; i < chars.length; i++) {
    const last = out[out.length - 1];
    if (last && last.mark === marks[i]) last.text += chars[i];
    else out.push({ text: chars[i], mark: marks[i] });
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function authorsShort(creators: { lastName?: string; name?: string }[], max = 3): string {
  const names = creators.map((c) => c.lastName || c.name || '').filter(Boolean);
  if (names.length === 0) return '';
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} et al.`;
}

export function parsePageCount(pages: string, numPages?: string): number | null {
  if (numPages && /^\d+$/.test(numPages.trim())) return parseInt(numPages, 10);
  const m = (pages || '').match(/^\s*(\d+)\s*[-–—]\s*(\d+)\s*$/);
  if (!m) return null;
  let [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  // « 1234-45 » signifie 1234-1245
  if (b < a && m[2].length < m[1].length) b = parseInt(m[1].slice(0, m[1].length - m[2].length) + m[2], 10);
  return b >= a ? b - a + 1 : null;
}

export function parseYear(date: string): number | null {
  const m = (date || '').match(/(1[5-9]\d\d|20\d\d)/);
  return m ? parseInt(m[1], 10) : null;
}
