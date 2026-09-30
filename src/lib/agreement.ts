// Mesures d'accord entre deux évaluateurs (personne/personne ou personne/IA).

export interface Agreement {
  n: number;
  /** Proportion d'accord observée (0 à 1). */
  observed: number;
  /** Kappa de Cohen (-1 à 1), `null` si non calculable. */
  kappa: number | null;
}

/** Kappa de Cohen pour des paires de catégories (ex. inclure/exclure/incertain). */
export function cohenKappa<T extends string>(pairs: [T, T][]): Agreement {
  const n = pairs.length;
  if (!n) return { n, observed: 0, kappa: null };
  const cats = [...new Set(pairs.flat())];
  const agree = pairs.filter(([a, b]) => a === b).length;
  const po = agree / n;
  const pe = cats.reduce((s, c) => s + (pairs.filter(([a]) => a === c).length / n) * (pairs.filter(([, b]) => b === c).length / n), 0);
  return { n, observed: po, kappa: pe === 1 ? null : (po - pe) / (1 - pe) };
}

/** Interprétation usuelle (Landis et Koch, 1977). */
export function kappaLabel(k: number | null): string {
  if (k === null) return 'non calculable';
  if (k < 0) return 'désaccord';
  if (k <= 0.2) return 'accord très faible';
  if (k <= 0.4) return 'accord faible';
  if (k <= 0.6) return 'accord modéré';
  if (k <= 0.8) return 'accord fort';
  return 'accord presque parfait';
}
