import { orderedCategories, toggleCategory, toggleMarker } from '../lib/organisation';
import { useProject } from '../store';

/**
 * Classement rapide d'une référence : catégories du plan et marqueurs.
 * Utilisable à toutes les étapes (tri, texte intégral, références).
 */
export function ClassifyPanel({ recordKey, always = false }: { recordKey: string; always?: boolean }) {
  const { project: p, update, markDirty } = useProject();
  const o = p.organisation;
  const cats = orderedCategories(o);
  if (!always && !cats.length && !o.markers.length) return null;
  const mine = o.assignments[recordKey] ?? [];
  const marks = o.markerAssignments[recordKey] ?? [];

  return (
    <div className="classify stack">
      {cats.length > 0 ? (
        <div className="row" style={{ gap: '0.35rem' }}>
          <span className="small muted">Classer :</span>
          {cats.map((c) => (
            <button
              key={c.id}
              className={`chip ${mine.includes(c.id) ? 'on' : ''}`}
              onClick={() => {
                update((cur) => ({ ...cur, organisation: toggleCategory(cur.organisation, recordKey, c.id) }));
                markDirty([recordKey]);
              }}
            >
              {c.parent ? '↳ ' : ''}
              {c.name}
            </button>
          ))}
        </div>
      ) : (
        always && <div className="small muted">Pas encore de plan de classement : créez-le dans l’onglet Organisation.</div>
      )}
      {o.markers.length > 0 && (
        <div className="row" style={{ gap: '0.35rem' }}>
          <span className="small muted">Marqueurs :</span>
          {o.markers.map((m) => (
            <button
              key={m.id}
              className={`chip ${marks.includes(m.id) ? 'on' : ''}`}
              onClick={() => {
                update((cur) => ({ ...cur, organisation: toggleMarker(cur.organisation, recordKey, m.id) }));
                markDirty([recordKey]);
              }}
            >
              <span className="marker-dot" style={{ background: m.color }} /> {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
