// « Pour bien démarrer » : une petite liste dans un coin de la vraie interface.
// Chaque étape mène au bon écran ; elle se coche toute seule une fois faite.

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { guideSteps, type ViewId } from '../lib/guide';
import { useProject } from '../store';
import { Portal } from './Portal';

export function Guide({ openDuplicates, onGo }: { openDuplicates: number; onGo: (v: ViewId) => void }) {
  const { project: p, update } = useProject();
  const [open, setOpen] = useState(true);
  const steps = guideSteps(p, openDuplicates);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const close = () => update((cur) => ({ ...cur, guide: { ...cur.guide!, active: false } }));
  // En allant à une étape, la liste se replie pour laisser la place au travail.
  const goTo = (v: ViewId) => {
    setOpen(false);
    onGo(v);
  };

  return (
    <Portal><aside className={`guide ${open ? 'open' : ''}`}>
      <div className="guide-head">
        <button className="guide-toggle" onClick={() => setOpen((o) => !o)}>
          <strong>Pour bien démarrer</strong>
          <span className="badge">
            {done}/{steps.length}
          </span>
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <button className="guide-close" onClick={close} title="Masquer le guide (bouton « Guide » pour le rouvrir)">
          <X size={15} />
        </button>
      </div>
      <div className="guide-progress">
        <span style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      {!open && next && (
        <button className="guide-next" onClick={() => goTo(next.view)}>
          Prochaine étape : {next.label} →
        </button>
      )}
      {open && (
        <>
          <ol className="guide-list">
            {steps.map((s) => (
              <li key={s.id} className={`${s.done ? 'done' : ''} ${s === next ? 'next' : ''}`}>
                <button onClick={() => goTo(s.view)}>
                  <span className="guide-check">{s.done ? <Check size={13} /> : null}</span>
                  <span>
                    {s.label}
                    {s === next && <span className="small muted guide-hint">{s.hint}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {!next ? (
            <div className="guide-end">
              🎉 Vous connaissez l’essentiel !{' '}
              <button className="btn small" onClick={close}>
                Fermer le guide
              </button>
            </div>
          ) : (
            <button className="btn small dark" style={{ alignSelf: 'flex-start' }} onClick={() => goTo(next.view)}>
              Y aller →
            </button>
          )}
        </>
      )}
    </aside></Portal>
  );
}
