// Stockage local : tout reste dans le navigateur de l'utilisateur (IndexedDB).
// Rien n'est envoyé ailleurs que vers api.zotero.org.
import { createStore, del, entries, get, set } from 'idb-keyval';
import type { Project, Settings } from '../types';
import { upgradeProject } from './frameworks';

const store = createStore('litflow', 'projects');
const SETTINGS_KEY = 'litflow.settings';

export async function listProjects(): Promise<Project[]> {
  const all = await entries<string, Project>(store);
  return all.map(([, p]) => upgradeProject(p)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const p = await get<Project>(id, store);
  return p && upgradeProject(p);
}

export const saveProject = (p: Project) => set(p.id, p, store);
export const deleteProject = (id: string) => del(id, store);

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { apiKey: '', userId: '', username: '', ...JSON.parse(raw) };
  } catch {
    /* stockage indisponible (navigation privée…) */
  }
  return { apiKey: '', userId: '', username: '' };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignoré */
  }
}
