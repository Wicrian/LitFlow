// Tri en cercle : une pile de références « à classer » au centre, les
// catégories en bulles tout autour.
//   * glisser la carte vers une bulle : elle y est rangée, la suivante arrive ;
//   * toucher des bulles : elles s'allument (✓), la carte reste au centre
//     pour aller dans plusieurs catégories, puis « Suivante → ».
// Une catégorie qui a des sous-catégories ouvre un second cercle.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Columns3, CornerDownLeft, SkipForward, Undo2 } from 'lucide-react';
import type { Category, RecordItem } from '../types';
import { setAssignment, toggleMarker } from '../lib/organisation';
import { authorsShort } from '../lib/text';
import { useProject } from '../store';
import { NotesBadge, ZoteroNotes } from './ZoteroNotes';

type Bubble = { id: string; label: string; cat: Category | null; kind: 'cat' | 'parent-all' | 'back' | 'add'; children: number };

export function CircleView({ visible, onAddCategory, onColumns }: { visible: RecordItem[]; onAddCategory: (parent: string | null) => void; onColumns: () => void }) {
  const { project: p, update, markDirty } = useProject();
  const o = p.organisation;
  const [skipped, setSkipped] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null); // catégorie dont on montre les sous-catégories
  const [history, setHistory] = useState<{ key: string; prev: string[] }[]>([]);
  const [drag, setDrag] = useState<{ dx: number; dy: number; over: string | null } | null>(null);
  const [flying, setFlying] = useState<{ dx: number; dy: number } | null>(null);
  const [pop, setPop] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  // À l'ouverture, amène le cercle à l'écran.
  useEffect(() => ringRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), []);

  // Pile : références non classées, celles « passées » à la fin.
  const stack = useMemo(() => {
    const todo = visible.filter((r) => !(o.assignments[r.key] ?? []).length);
    return [...todo.filter((r) => !skipped.includes(r.key)), ...skipped.map((k) => todo.find((r) => r.key === k)).filter((r): r is RecordItem => !!r)];
  }, [visible, o.assignments, skipped]);

  const cur = current && p.records[current] ? p.records[current] : stack[0] ?? null;
  const assigned = cur ? o.assignments[cur.key] ?? [] : [];
  const behind = stack.filter((r) => r.key !== cur?.key).slice(0, 2);

  const tops = o.categories.filter((c) => !c.parent);
  const focusCat = focus ? o.categories.find((c) => c.id === focus) : null;
  const bubbles: Bubble[] = focusCat
    ? [
        { id: 'back', label: 'Retour', cat: null, kind: 'back', children: 0 },
        { id: focusCat.id, label: `Tout « ${focusCat.name} »`, cat: focusCat, kind: 'parent-all', children: 0 },
        ...o.categories.filter((c) => c.parent === focusCat.id).map((c) => ({ id: c.id, label: c.name, cat: c, kind: 'cat' as const, children: 0 })),
        { id: 'add', label: '+ Sous-catégorie', cat: null, kind: 'add', children: 0 },
      ]
    : [
        ...tops.map((c) => ({ id: c.id, label: c.name, cat: c, kind: 'cat' as const, children: o.categories.filter((x) => x.parent === c.id).length })),
        { id: 'add', label: '+ Catégorie', cat: null, kind: 'add', children: 0 },
      ];
  // Les numéros 1–9 du clavier ne comptent que les vraies bulles.
  const keyed = bubbles.filter((b) => b.kind !== 'add');

  const count = (id: string) => visible.filter((r) => (o.assignments[r.key] ?? []).includes(id)).length;

  const assign = (key: string, ids: string[]) => {
    setHistory((h) => [...h.slice(-30), { key, prev: o.assignments[key] ?? [] }]);
    update((c) => ({ ...c, organisation: setAssignment(c.organisation, key, ids) }));
    markDirty([key]);
  };

  /** Range la carte dans une catégorie et passe à la suivante (glisser). */
  const dropInto = (id: string, dx: number, dy: number) => {
    if (!cur) return;
    setFlying({ dx, dy });
    setPop(id);
    const key = cur.key;
    setTimeout(() => {
      assign(key, [...new Set([...(o.assignments[key] ?? []), id])]);
      setFlying(null);
      setDrag(null);
      setCurrent(null);
      setFocus(null);
      setTimeout(() => setPop(null), 300);
    }, 220);
  };

  /** Toucher une bulle : coche / décoche, la carte reste. */
  const tapBubble = (b: Bubble) => {
    if (b.kind === 'back') return setFocus(null);
    if (b.kind === 'add') return onAddCategory(focusCat?.id ?? null);
    if (b.kind === 'cat' && b.children > 0) return setFocus(b.id);
    if (!cur) return;
    setCurrent(cur.key);
    assign(cur.key, assigned.includes(b.id) ? assigned.filter((x) => x !== b.id) : [...assigned, b.id]);
    setPop(b.id);
    setTimeout(() => setPop(null), 300);
  };

  const next = () => {
    setCurrent(null);
    setFocus(null);
  };
  const skip = () => {
    if (!cur) return;
    setSkipped((s) => [...s.filter((k) => k !== cur.key), cur.key]);
    next();
  };
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    update((c) => ({ ...c, organisation: setAssignment(c.organisation, last.key, last.prev) }));
    markDirty([last.key]);
    setCurrent(last.key);
  };

  // Clavier : 1–9 bulles, Entrée suivante, S passer, Z annuler, Retour arrière.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || e.ctrlKey || e.metaKey) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && keyed[n - 1]) {
        e.preventDefault();
        tapBubble(keyed[n - 1]);
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 's') skip();
      else if (e.key === 'z') undo();
      else if (e.key === 'Backspace' || e.key === 'Escape') setFocus(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- Glisser (souris et doigt : la carte du centre n'a pas de défilement) ----
  const bubbleUnder = (x: number, y: number) =>
    (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-bubble]')?.dataset.bubble ?? null;

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,a')) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!drag && Math.hypot(dx, dy) < 6) return;
    // Pendant la capture, la carte est sous le doigt : on la masque un instant pour trouver la bulle.
    const card = e.currentTarget as HTMLElement;
    card.style.pointerEvents = 'none';
    const over = bubbleUnder(e.clientX, e.clientY);
    card.style.pointerEvents = '';
    setDrag({ dx, dy, over });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || !drag) return setDrag(null);
    const b = bubbles.find((x) => x.id === drag.over);
    if (!b || b.kind === 'back' || b.kind === 'add') return setDrag(null);
    if (b.kind === 'cat' && b.children > 0) {
      // Déposée sur une catégorie qui a des sous-catégories : on ouvre le second cercle.
      setFocus(b.id);
      return setDrag(null);
    }
    // La carte s'envole vers le centre de la bulle.
    const target = document.querySelector<HTMLElement>(`[data-bubble="${b.id}"]`)?.getBoundingClientRect();
    const card = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = target ? drag.dx + target.left + target.width / 2 - (card.left + card.width / 2) : drag.dx;
    const dy = target ? drag.dy + target.top + target.height / 2 - (card.top + card.height / 2) : drag.dy;
    dropInto(b.id, dx, dy);
  };

  const n = bubbles.length;
  const s = cur?.key ? p.screening[cur.key]?.decision : undefined;
  const f = cur?.key ? p.fulltext[cur.key]?.decision : undefined;

  return (
    <div className="circle-wrap">
      <div className={`circle ${n > 10 ? 'many' : ''}`} ref={ringRef}>
        {bubbles.map((b, i) => {
          const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
          const on = cur && b.kind !== 'back' && b.kind !== 'add' && assigned.includes(b.id);
          const k = keyed.indexOf(b);
          return (
            <button
              key={b.id}
              data-bubble={b.id}
              className={`bubble ${b.kind} ${b.children ? 'has-subs' : ''} ${on ? 'on' : ''} ${drag?.over === b.id ? 'over' : ''} ${pop === b.id ? 'pop' : ''}`}
              style={{ left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%` }}
              onClick={() => tapBubble(b)}
              title={b.cat ? b.cat.name : ''}
            >
              {k >= 0 && k < 9 && <kbd className="bubble-key">{k + 1}</kbd>}
              {b.kind === 'back' ? <ArrowLeft size={18} /> : null}
              <span className="bubble-label">{b.label}</span>
              {b.kind !== 'back' && b.kind !== 'add' && (
                <span className="bubble-count">
                  {on ? '✓ ' : ''}
                  {count(b.id)}
                </span>
              )}
              {b.children > 0 && <span className="bubble-subs">{b.children} sous-cat. ▸</span>}
            </button>
          );
        })}

        <div className="circle-center">
          {cur ? (
            <>
              {behind.map((r, i) => (
                <div key={r.key} className="stack-card behind" style={{ transform: `translate(-50%, -50%) rotate(${i ? -5 : 4}deg) translateY(${(i + 1) * 6}px)` }} />
              ))}
              <div
                className={`stack-card top ${drag ? 'dragging' : ''} ${flying ? 'flying' : ''}`}
                style={{
                  transform: `translate(-50%, -50%) translate(${(flying ?? drag)?.dx ?? 0}px, ${(flying ?? drag)?.dy ?? 0}px) ${flying ? 'scale(0.2)' : drag ? 'rotate(3deg) scale(0.55)' : ''}`,
                  opacity: flying ? 0 : 1,
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => ((start.current = null), setDrag(null))}
              >
                <div className="stack-title">{cur.title || '(sans titre)'}</div>
                <div className="small muted">
                  {authorsShort(cur.creators, 3)} · {cur.year ?? 's.d.'}
                </div>
                {cur.abstract && <div className="stack-abstract small">{cur.abstract}</div>}
                <div className="row" style={{ gap: '0.25rem', marginTop: 'auto' }}>
                  <NotesBadge recordKey={cur.key} onOpen={() => setNotesFor(cur.key)} />
                  {(f || s) && <span className={`badge ${f ?? s}`}>{f ? (f === 'include' ? 'Dans la revue' : f === 'exclude' ? 'Exclue (texte)' : 'Incertaine') : s === 'include' ? 'Tri : inclue' : s === 'exclude' ? 'Tri : exclue' : 'Tri : ?'}</span>}
                </div>
              </div>
            </>
          ) : (
            <div className="stack-empty">
              <strong>🎉 Tout est classé</strong>
              <div className="small muted">dans cette vue. Passez en vue Colonnes pour revoir ou corriger.</div>
            </div>
          )}
        </div>
      </div>

      {notesFor && p.records[notesFor] && (
        <div className="overlay" onClick={() => setNotesFor(null)}>
          <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
            <strong>{p.records[notesFor].title}</strong>
            <ZoteroNotes recordKey={notesFor} defaultOpen />
            <div className="row">
              <span className="spacer" />
              <button className="btn dark" onClick={() => setNotesFor(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      {!cur && (
        <button className="btn" onClick={onColumns}>
          <Columns3 size={16} /> Passer en vue colonnes
        </button>
      )}
      {cur && (
        <div className="stack">
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn small" onClick={onColumns} title="Revoir le classement en colonnes">
              <Columns3 size={14} /> Vue colonnes
            </button>
            <button className="btn small" onClick={undo} disabled={!history.length}>
              <Undo2 size={14} /> Annuler <kbd>Z</kbd>
            </button>
            <button className="btn small" onClick={skip}>
              <SkipForward size={14} /> Passer <kbd>S</kbd>
            </button>
            <button className={`btn ${assigned.length ? 'dark' : ''}`} onClick={next} disabled={!assigned.length}>
              Suivante <ArrowRight size={16} /> <kbd>
                <CornerDownLeft size={10} />
              </kbd>
            </button>
          </div>
          <div className="small muted" style={{ textAlign: 'center' }}>
            {!o.categories.length
              ? 'Pas encore de catégorie : touchez « + Catégorie » dès qu’une idée de rangement vous vient en lisant cet article.'
              : `${stack.length} à classer · glissez la carte vers une bulle, ou touchez une ou plusieurs bulles puis « Suivante »`}
            {focusCat || !o.categories.some((c) => c.parent) ? '' : ' · une bulle « ▸ » ouvre ses sous-catégories'}
          </div>

          {o.markers.length > 0 && (
            <div className="row" style={{ justifyContent: 'center', gap: '0.35rem' }}>
              {o.markers.map((m) => {
                const on = (o.markerAssignments[cur.key] ?? []).includes(m.id);
                return (
                  <button
                    key={m.id}
                    className={`chip ${on ? 'on' : ''}`}
                    onClick={() => {
                      setCurrent(cur.key);
                      update((c) => ({ ...c, organisation: toggleMarker(c.organisation, cur.key, m.id) }));
                      markDirty([cur.key]);
                    }}
                  >
                    <span className="marker-dot" style={{ background: m.color }} /> {m.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
