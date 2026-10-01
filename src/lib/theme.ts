// Ambiances de couleurs. Les couleurs elles-mêmes sont dans styles.css
// (un bloc [data-theme='…'] par ambiance).

export const THEMES = [
  { id: 'innovation', name: 'Innovation', hint: 'Mauve translucide', swatch: ['#c7bfe6', '#8b6cf0', '#1f1e26'] },
  { id: 'classique', name: 'Classique', hint: 'Blanc et gris, sobre et élégant', swatch: ['#ececee', '#ffffff', '#111a2e'] },
  { id: 'moderne', name: 'Moderne', hint: 'Jaune, bleu et mauve sur gris', swatch: ['#f6d57a', '#c9d7e8', '#e2d3ec'] },
  { id: 'chaleureux', name: 'Chaleureux', hint: 'Beige, sable et orangé', swatch: ['#e9dccd', '#f0a35e', '#2a2018'] },
  { id: 'ado', name: 'Plein air', hint: 'Ciel bleu, jaune soleil et prairie', swatch: ['#a9d0f5', '#f9c933', '#4caf50'] },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
const KEY = 'litflow.theme';

export function loadTheme(): ThemeId {
  try {
    const t = localStorage.getItem(KEY);
    if (t && THEMES.some((x) => x.id === t)) return t as ThemeId;
  } catch {
    /* stockage indisponible */
  }
  return 'innovation';
}

export function applyTheme(t: ThemeId) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignoré */
  }
}
