import type { RecordItem } from '../types';
import { facetValues, type Filters, type StatusFilter } from '../lib/filters';
import { itemTypeLabel } from '../zotero/mapping';

const LANG: Record<string, string> = { fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', pt: 'Portugais', it: 'Italien', '?': 'Non précisée' };
const STATUS: [StatusFilter, string][] = [
  ['all', 'Toutes'],
  ['undecided', 'Sans décision'],
  ['include', 'Incluses'],
  ['exclude', 'Exclues'],
  ['maybe', 'Incertaines'],
];

interface Props {
  records: RecordItem[];
  filters: Filters;
  onChange: (f: Filters) => void;
  /** Filtres de statut à afficher. */
  status?: ('screening' | 'fulltext')[];
}

export function FilterBar({ records, filters: f, onChange, status = [] }: Props) {
  const facets = facetValues(records);
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });

  return (
    <div className="filters">
      <label className="field" style={{ gridColumn: 'span 2' }}>
        <span>Recherche (titre, résumé, auteur, revue, DOI)</span>
        <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="ex. santé mentale" />
      </label>
      {status.includes('screening') && (
        <label className="field">
          <span>Tri titre-résumé</span>
          <select value={f.screening} onChange={(e) => set({ screening: e.target.value as StatusFilter })}>
            {STATUS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      {status.includes('fulltext') && (
        <label className="field">
          <span>Texte intégral</span>
          <select value={f.fulltext} onChange={(e) => set({ fulltext: e.target.value as StatusFilter })}>
            {[...STATUS, ['notretrieved', 'Introuvables'] as [StatusFilter, string]].map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      <Multi label="Type de document" values={facets.types} selected={f.types} render={itemTypeLabel} onChange={(types) => set({ types })} />
      <Multi label="Langue" values={facets.languages} selected={f.languages} render={(l) => LANG[l] ?? l} onChange={(languages) => set({ languages })} />
      <Multi label="Source" values={facets.sources} selected={f.sources} onChange={(sources) => set({ sources })} />
      <label className="field">
        <span>Années</span>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input type="number" value={f.yearMin} placeholder="de" onChange={(e) => set({ yearMin: e.target.value })} />
          <input type="number" value={f.yearMax} placeholder="à" onChange={(e) => set({ yearMax: e.target.value })} />
        </div>
      </label>
      <label className="field">
        <span>Nombre de pages</span>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input type="number" value={f.pagesMin} placeholder="min" onChange={(e) => set({ pagesMin: e.target.value })} />
          <input type="number" value={f.pagesMax} placeholder="max" onChange={(e) => set({ pagesMax: e.target.value })} />
        </div>
      </label>
      <label className="field">
        <span>Résumé</span>
        <select value={f.abstract} onChange={(e) => set({ abstract: e.target.value as Filters['abstract'] })}>
          <option value="">Peu importe</option>
          <option value="yes">Avec résumé</option>
          <option value="no">Sans résumé</option>
        </select>
      </label>
      <label className="field">
        <span>Étiquette Zotero</span>
        <input type="text" value={f.tag} onChange={(e) => set({ tag: e.target.value })} />
      </label>
    </div>
  );
}

function Multi({
  label,
  values,
  selected,
  onChange,
  render = (v) => v,
}: {
  label: string;
  values: [string, number][];
  selected: string[];
  onChange: (v: string[]) => void;
  render?: (v: string) => string;
}) {
  return (
    <div className="field">
      <span className="small muted" style={{ display: 'block', marginBottom: '0.2rem' }}>
        {label}
      </span>
      <details style={{ position: 'relative' }}>
        <summary className="btn" style={{ width: '100%', justifyContent: 'space-between' }}>
          {selected.length ? `${selected.length} sélectionné(s)` : 'Tous'}
        </summary>
        <div className="panel" style={{ position: 'absolute', zIndex: 10, minWidth: 240, maxHeight: 300, overflow: 'auto', padding: '0.5rem' }}>
          {values.map(([v, n]) => (
            <label key={v} className="row small" style={{ flexWrap: 'nowrap' }}>
              <input
                type="checkbox"
                checked={selected.includes(v)}
                onChange={(e) => onChange(e.target.checked ? [...selected, v] : selected.filter((x) => x !== v))}
              />
              {render(v)} <span className="muted">({n})</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button className="btn small" onClick={() => onChange([])}>
              Tout désélectionner
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
