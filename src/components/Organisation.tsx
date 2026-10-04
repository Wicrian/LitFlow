import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Category, Organisation as Org, RecordItem } from '../types';
import {
  categoryLabel,
  deleteCategory,
  emptyOrganisation,
  deleteMarker,
  fromTemplate,
  MARKER_COLORS,
  moveToCategory,
  newCategory,
  newMarker,
  orderedCategories,
  ORG_TEMPLATES,
  renameCategory,
  type DeleteStrategy,
} from '../lib/organisation';
import { fulltextKeys } from '../lib/prisma';
import { authorsShort, normalizeForCompare } from '../lib/text';
import { useProject } from '../store';
import type { ZCollection } from '../zotero/api';
import { adoptExistingRoot, organisationRootName } from '../zotero/organisationSync';
import { ClassifyPanel } from './ClassifyPanel';
import { CircleView } from './CircleView';

type Scope = 'review' | 'screening' | 'all' | 'excluded';
const NONE = '__none';

export function Organisation() {
  const { project: p } = useProject();
  if (!p.organisation.name) return <OrganisationSetup />;
  return <Board />;
}

// ---------------------------------------------------------------------------
// Création du plan

function OrganisationSetup() {
  const { project: p, update, client } = useProject();
  const [template, setTemplate] = useState('memoire');
  const [name, setName] = useState('');
  const [collections, setCollections] = useState<ZCollection[] | null>(null);
  const [rootKey, setRootKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    client?.collections().then(setCollections).catch((e) => setError(String(e.message ?? e)));
  }, [client]);

  const tpl = ORG_TEMPLATES.find((t) => t.id === template)!;
  // Exclues : la collection de résultats de recherche (et ses sous-collections, qui sont les sources)
  // et la collection « LitFlow – projet » : les reprendre comme organisation les mélangerait au tri.
  const ours = new Set([...Object.values(p.zoteroCollections), p.sourceCollection?.key].filter(Boolean));
  const tree: { c: ZCollection; depth: number }[] = [];
  const walk = (parent: string | false, depth: number) =>
    (collections ?? [])
      .filter((c) => c.data.parentCollection === parent && !ours.has(c.key))
      .sort((a, b) => a.data.name.localeCompare(b.data.name, 'fr'))
      .forEach((c) => {
        tree.push({ c, depth });
        if (depth < 3) walk(c.key, depth + 1);
      });
  walk(false, 0);

  return (
    <div className="stack">
      <section className="panel stack">
        <h2>Organiser vos références à votre façon</h2>
        <p className="muted">
          Choisissez la façon d’organiser vos références qui vous convient : par sections de mémoire, par concepts, par type
          d’étude, par suivi de lecture… Ce classement peut s’utiliser seul ou se combiner avec le parcours de revue
          systématique (identification, doublons, tri, texte intégral, diagramme PRISMA) : vous pouvez commencer par l’un,
          ajouter l’autre ensuite, ou ne jamais utiliser le tri. Une référence peut être classée à tout moment, quelle que
          soit sa décision de tri (par exemple : exclue pour la question de recherche, mais gardée pour la méthodologie).
        </p>
        <ul className="small muted" style={{ margin: 0 }}>
          <li>
            <strong>Catégories</strong> → des sous-collections Zotero, dans « LitFlow – {p.name} › 4 – Organisation · … ».
          </li>
          <li>
            <strong>Marqueurs</strong> (⭐ Important, 📌 À citer…) → des étiquettes Zotero <code>{p.sync.tagPrefix}:marqueur:…</code>.
          </li>
        </ul>
      </section>

      <section className="panel stack">
        <h3>Partir d’un modèle</h3>
        <div className="theme-grid">
          {ORG_TEMPLATES.map((t) => (
            <button key={t.id} className={`theme-card ${template === t.id ? 'on' : ''}`} onClick={() => setTemplate(t.id)}>
              <strong>{t.name}</strong>
              <span className="small muted">{t.hint}</span>
            </button>
          ))}
        </div>
        <div className="small muted">Catégories proposées : {tpl.categories(p).map((c) => (typeof c === 'string' ? c : c[0])).join(' · ') || '(aucune)'}</div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1, minWidth: 240 }}>
            <span>Nom du plan (modifiable ensuite)</span>
            <input type="text" value={name} placeholder={tpl.name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn primary" onClick={() => update((cur) => ({ ...cur, organisation: fromTemplate(cur, template, name) }))}>
            Créer le plan
          </button>
        </div>
      </section>

      {client && (
        <section className="panel stack">
          <h3>… ou reprendre une collection Zotero existante</h3>
          <p className="small muted">
            Si vous avez déjà rangé vos références dans Zotero, choisissez la collection qui contient vos dossiers
            d’organisation : ses sous-collections (sur deux niveaux) deviennent les catégories, et les références déjà rangées
            le restent. LitFlow continuera ensuite à développer cette collection avec vos ajouts. La collection de vos
            résultats de recherche{p.sourceCollection ? ` (« ${p.sourceCollection.name} »)` : ''} n’est pas proposée : elle sert
            déjà à l’identification.
          </p>
          {error && <div className="notice error">{error}</div>}
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 1, minWidth: 240 }}>
              <span>Collection d’organisation</span>
              <select value={rootKey} onChange={(e) => setRootKey(e.target.value)}>
                <option value="">{collections ? '— Choisir —' : 'Chargement…'}</option>
                {tree.map(({ c, depth }) => (
                  <option key={c.key} value={c.key}>
                    {'  '.repeat(depth * 2)}
                    {depth ? '└ ' : ''}
                    {c.data.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn"
              disabled={!rootKey || !collections}
              onClick={() => update((cur) => ({ ...cur, organisation: adoptExistingRoot(cur, collections!, rootKey, name) }))}
            >
              Reprendre cette collection
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tableau en colonnes

function Board() {
  const { project: p, update, markDirty } = useProject();
  const o = p.organisation;
  // Vue par défaut : la plus avancée du parcours de revue s'il est utilisé, sinon toutes les références.
  const [scope, setScope] = useState<Scope>(() =>
    Object.values(p.fulltext).some((d) => d.decision === 'include')
      ? 'review'
      : Object.values(p.screening).some((d) => d.decision !== 'exclude')
        ? 'screening'
        : 'all',
  );
  const [markerFilter, setMarkerFilter] = useState<string[]>([]);
  const [view, setViewState] = useState<'circle' | 'columns'>(() => {
    try {
      return localStorage.getItem('litflow.orgView') === 'columns' ? 'columns' : 'circle';
    } catch {
      return 'circle';
    }
  });
  const setView = (v: 'circle' | 'columns') => {
    setViewState(v);
    try {
      localStorage.setItem('litflow.orgView', v);
    } catch {
      /* ignoré */
    }
  };
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [drag, setDrag] = useState<{ key: string; from: string; x: number; y: number; over: string | null; copy: boolean } | null>(null);
  const dragStart = useRef<{ key: string; from: string; x: number; y: number } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  dragRef.current = drag;

  const setOrg = (fn: (o: Org) => Org, dirtyKeys: string[] = []) => {
    update((cur) => ({ ...cur, organisation: fn(cur.organisation) }));
    if (dirtyKeys.length) markDirty(dirtyKeys);
  };

  // Références visibles selon l'étape PRISMA choisie.
  const visible = useMemo(() => {
    const ft = new Set(fulltextKeys(p));
    const nq = normalizeForCompare(q);
    return Object.values(p.records).filter((r) => {
      if (r.key in p.duplicates) return false;
      const s = p.screening[r.key]?.decision;
      if (scope === 'review' && p.fulltext[r.key]?.decision !== 'include') return false;
      if (scope === 'screening' && !(s === 'include' || s === 'maybe' || (ft.has(r.key) && !s))) return false;
      if (scope === 'excluded' && s !== 'exclude' && p.fulltext[r.key]?.decision !== 'exclude') return false;
      if (markerFilter.length && !markerFilter.every((m) => (o.markerAssignments[r.key] ?? []).includes(m))) return false;
      if (nq && !normalizeForCompare(`${r.title} ${authorsShort(r.creators)}`).includes(nq)) return false;
      return true;
    });
  }, [p, scope, markerFilter, q, o.markerAssignments]);

  const cats = orderedCategories(o);
  const columns: { id: string; cat: Category | null; items: RecordItem[] }[] = [
    { id: NONE, cat: null, items: visible.filter((r) => !(o.assignments[r.key] ?? []).length) },
    ...cats.map((c) => ({ id: c.id, cat: c, items: visible.filter((r) => (o.assignments[r.key] ?? []).includes(c.id)) })),
  ];

  // ---- Glisser-déposer (souris) ; au doigt : toucher une carte ouvre le menu de classement ----
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = dragStart.current;
      if (!s) return;
      if (!dragRef.current && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
      const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null;
      const next = { key: s.key, from: s.from, x: e.clientX, y: e.clientY, over, copy: e.altKey || e.ctrlKey || e.metaKey };
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
      const s = dragStart.current;
      const d = dragRef.current;
      dragStart.current = null;
      dragRef.current = null;
      if (!s) return;
      setDrag(null);
      if (!d) return setOpenKey(s.key); // simple clic : menu de classement
      if (!d.over || d.over === d.from) return;
      const to = d.over === NONE ? null : d.over;
      setOrg((org) => {
        // Vers « À classer » : retire seulement la catégorie d'origine.
        if (to === null) return moveToCategory(org, d.key, d.from, null);
        return moveToCategory(org, d.key, d.copy || d.from === NONE ? null : d.from, to);
      }, [d.key]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });

  const addCategory = (parent: string | null = null) => {
    const name = prompt(parent ? 'Nom de la sous-catégorie :' : 'Nom de la nouvelle catégorie :');
    if (name?.trim()) setOrg((org) => ({ ...org, categories: [...org.categories, newCategory(name, parent)], structureDirty: true }));
  };

  return (
    <div className="stack">
      <section className="panel stack" style={{ padding: '0.9rem 1.1rem' }}>
        <div className="row">
          <strong style={{ fontSize: '1.05rem' }}>{o.name}</strong>
          <button
            className="btn small"
            title="Renommer le plan"
            onClick={() => {
              const n = prompt('Nouveau nom du plan :', o.name);
              if (n?.trim()) setOrg((org) => ({ ...org, name: n.trim(), structureDirty: true }));
            }}
          >
            <Pencil size={14} />
          </button>
          <span className="small muted">
            {o.rootMode === 'litflow' ? `Zotero : LitFlow – ${p.name} › ${organisationRootName(o)}` : 'Zotero : collection existante'}
          </span>
          <button
            className="btn small"
            onClick={() => {
              if (
                !confirm(
                  'Changer de plan d’organisation ?\n\n' +
                    'LitFlow arrête simplement d’utiliser ce plan : rien n’est supprimé ni modifié dans Zotero ' +
                    '(collections et références restent telles quelles). Vos marqueurs sont conservés.\n\n' +
                    'Vous pourrez ensuite choisir un autre modèle ou une autre collection.',
                )
              )
                return;
              update((cur) => ({
                ...cur,
                organisation: { ...emptyOrganisation(), markers: cur.organisation.markers, markerAssignments: cur.organisation.markerAssignments },
              }));
            }}
          >
            Changer de plan
          </button>
          <span className="spacer" />
          <input type="search" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
        </div>
        <div className="row">
          <div className="seg">
            <button className={view === 'circle' ? 'on' : ''} onClick={() => setView('circle')}>
              ◎ Tri en cercle
            </button>
            <button className={view === 'columns' ? 'on' : ''} onClick={() => setView('columns')}>
              ▥ Colonnes
            </button>
          </div>
          <div className="seg">
            {(
              [
                ['review', 'Incluses dans la revue'],
                ['screening', 'Retenues au tri'],
                ['excluded', 'Exclues'],
                ['all', 'Toutes'],
              ] as [Scope, string][]
            ).map(([k, l]) => (
              <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>
                {l}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <span className="small muted">{visible.length} référence(s)</span>
        </div>
        <MarkerBar selected={markerFilter} onToggle={(id) => setMarkerFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))} />
        {view === 'columns' && (
          <div className="small muted">
            Glissez une carte vers une colonne pour la classer (maintenez <kbd>Alt</kbd> pour la copier dans une 2e catégorie).
            Cliquez — ou touchez sur tablette — pour choisir catégories et marqueurs.
          </div>
        )}
      </section>

      {view === 'circle' && <CircleView visible={visible} onAddCategory={() => addCategory(null)} />}

      {view === 'columns' && (
      <div className="board">
        {columns.map((col) => (
          <div key={col.id} className={`board-col ${col.cat?.parent ? 'sub' : ''} ${drag?.over === col.id ? 'over' : ''}`} data-drop={col.id}>
            <div className="board-head">
              <span className="board-title" title={col.cat ? categoryLabel(o, col.cat) : ''}>
                {col.cat ? (col.cat.parent ? <span className="muted">↳ </span> : null) : null}
                {col.cat ? col.cat.name : 'À classer'}
              </span>
              <span className="badge">{col.items.length}</span>
              {col.cat && (
                <span className="board-tools">
                  <button
                    title="Renommer"
                    onClick={() => {
                      const n = prompt('Nouveau nom :', col.cat!.name);
                      if (n?.trim()) setOrg((org) => renameCategory(org, col.cat!.id, n));
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  {!col.cat.parent && (
                    <button title="Ajouter une sous-catégorie" onClick={() => addCategory(col.cat!.id)}>
                      <Plus size={14} />
                    </button>
                  )}
                  <button title="Supprimer" onClick={() => setDeleting(col.cat)}>
                    <Trash2 size={14} />
                  </button>
                </span>
              )}
            </div>
            <div className="board-cards">
              {col.items.slice(0, 200).map((r) => (
                <BoardCard
                  key={r.key}
                  r={r}
                  dragging={drag?.key === r.key && drag.from === col.id}
                  onPointerDown={(e) => {
                    if (e.pointerType !== 'mouse') return;
                    dragStart.current = { key: r.key, from: col.id, x: e.clientX, y: e.clientY };
                  }}
                  onTap={(e) => e.pointerType !== 'mouse' && setOpenKey(r.key)}
                />
              ))}
              {col.items.length > 200 && <div className="small muted">… et {col.items.length - 200} autres (utilisez les filtres)</div>}
              {!col.items.length && <div className="small muted board-empty">Déposez des références ici</div>}
            </div>
          </div>
        ))}
        <button className="board-col board-add" onClick={() => addCategory(null)}>
          <Plus /> Nouvelle catégorie
        </button>
      </div>
      )}

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {drag.copy ? '＋ ' : ''}
          {p.records[drag.key]?.title}
        </div>
      )}
      {openKey && p.records[openKey] && <ClassifyDialog recordKey={openKey} onClose={() => setOpenKey(null)} />}
      {deleting && <DeleteCategoryDialog cat={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function BoardCard({
  r,
  dragging,
  onPointerDown,
  onTap,
}: {
  r: RecordItem;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onTap: (e: React.PointerEvent) => void;
}) {
  const { project: p } = useProject();
  const s = p.screening[r.key]?.decision;
  const f = p.fulltext[r.key]?.decision;
  const markers = (p.organisation.markerAssignments[r.key] ?? []).map((id) => p.organisation.markers.find((m) => m.id === id)).filter(Boolean);
  return (
    <div className={`board-card ${dragging ? 'dragging' : ''}`} onPointerDown={onPointerDown} onPointerUp={onTap}>
      <div className="board-card-title">{r.title || '(sans titre)'}</div>
      <div className="small muted">
        {authorsShort(r.creators, 2)} · {r.year ?? 's.d.'}
      </div>
      <div className="row" style={{ gap: '0.25rem', marginTop: '0.3rem' }}>
        {f ? <span className={`badge ${f}`}>{f === 'include' ? 'Revue' : f === 'exclude' ? 'Exclue (texte)' : 'Incertaine'}</span> : s ? <span className={`badge ${s}`}>{s === 'include' ? 'Tri : inclue' : s === 'exclude' ? 'Tri : exclue' : 'Tri : ?'}</span> : null}
        {markers.map((m) => (
          <span key={m!.id} className="marker-dot" style={{ background: m!.color }} title={m!.name} />
        ))}
      </div>
    </div>
  );
}

/** Barre des marqueurs : filtrer, ajouter, renommer, supprimer. */
export function MarkerBar({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const { project: p, update, markDirty } = useProject();
  const o = p.organisation;
  return (
    <div className="row" style={{ gap: '0.35rem' }}>
      <span className="small muted">Marqueurs :</span>
      {o.markers.map((m) => (
        <span
          key={m.id}
          className={`chip ${selected.includes(m.id) ? 'on' : ''}`}
          onClick={() => onToggle(m.id)}
          onDoubleClick={() => {
            const n = prompt('Renommer le marqueur :', m.name);
            if (!n?.trim()) return;
            const keys = Object.keys(o.markerAssignments).filter((k) => o.markerAssignments[k].includes(m.id));
            update((cur) => ({ ...cur, organisation: { ...cur.organisation, markers: cur.organisation.markers.map((x) => (x.id === m.id ? { ...x, name: n.trim() } : x)) } }));
            markDirty(keys);
          }}
          title="Cliquer : filtrer · Double-cliquer : renommer"
        >
          <span className="marker-dot" style={{ background: m.color }} /> {m.name}
          <span
            className="muted"
            onClick={(e) => {
              e.stopPropagation();
              const n = Object.values(o.markerAssignments).filter((ids) => ids.includes(m.id)).length;
              if (!confirm(`Supprimer le marqueur « ${m.name} » ?${n ? `\nIl sera retiré de ${n} référence(s) (les références ne sont pas supprimées).` : ''}`)) return;
              const res = deleteMarker(o, m.id);
              update((cur) => ({ ...cur, organisation: deleteMarker(cur.organisation, m.id).org }));
              markDirty(res.affected);
            }}
          >
            ✕
          </span>
        </span>
      ))}
      <button
        className="btn small"
        onClick={() => {
          const n = prompt('Nom du nouveau marqueur (ex. « À relire », « Concept : pouvoir local ») :');
          if (n?.trim())
            update((cur) => ({
              ...cur,
              organisation: { ...cur.organisation, markers: [...cur.organisation.markers, newMarker(n, MARKER_COLORS[cur.organisation.markers.length % MARKER_COLORS.length])] },
            }));
        }}
      >
        <Plus size={14} /> Marqueur
      </button>
    </div>
  );
}

function ClassifyDialog({ recordKey, onClose }: { recordKey: string; onClose: () => void }) {
  const { project: p } = useProject();
  const r = p.records[recordKey];
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
        <strong>{r.title}</strong>
        <div className="small muted">
          {authorsShort(r.creators, 4)} · {r.year ?? 's.d.'} {r.publication && <>· {r.publication}</>}
        </div>
        <ClassifyPanel recordKey={recordKey} always />
        <div className="row">
          <span className="spacer" />
          <button className="btn dark" onClick={onClose}>
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteCategoryDialog({ cat, onClose }: { cat: Category; onClose: () => void }) {
  const { project: p, update, markDirty } = useProject();
  const o = p.organisation;
  const count = Object.values(o.assignments).filter((ids) => ids.includes(cat.id)).length;
  const others = orderedCategories(o).filter((c) => c.id !== cat.id);
  const [kind, setKind] = useState<DeleteStrategy['kind']>('unclassify');
  const [to, setTo] = useState(others[0]?.id ?? '');
  const subs = o.categories.filter((c) => c.parent === cat.id).length;

  const confirmDelete = () => {
    const strategy: DeleteStrategy = kind === 'move' ? { kind, to } : kind === 'marker' ? { kind } : { kind: 'unclassify' };
    const res = deleteCategory(o, cat.id, strategy);
    update((cur) => ({ ...cur, organisation: deleteCategory(cur.organisation, cat.id, strategy).org }));
    markDirty(res.affected);
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h2>Supprimer « {cat.name} »</h2>
        <p className="small muted">
          La sous-collection Zotero correspondante sera supprimée aussi. <strong>Les références ne sont jamais supprimées.</strong>
          {o.rootMode === 'existing' && (
            <>
              {' '}
              <strong>Attention :</strong> ce plan reprend une collection Zotero qui existait avant LitFlow ; c’est cette
              sous-collection-là qui sera supprimée.
            </>
          )}
          {subs > 0 && ` Ses ${subs} sous-catégorie(s) remonteront d’un niveau.`}
        </p>
        {count > 0 ? (
          <>
            <strong>Que faire des {count} référence(s) qu’elle contient ?</strong>
            <label className="row">
              <input type="radio" checked={kind === 'unclassify'} onChange={() => setKind('unclassify')} /> Les remettre « à classer »
            </label>
            <label className="row">
              <input type="radio" checked={kind === 'move'} onChange={() => setKind('move')} disabled={!others.length} /> Les déplacer vers
              <select style={{ width: 'auto' }} value={to} onChange={(e) => (setTo(e.target.value), setKind('move'))} disabled={!others.length}>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(o, c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="row">
              <input type="radio" checked={kind === 'marker'} onChange={() => setKind('marker')} /> Leur donner un marqueur « {cat.name} »
            </label>
          </>
        ) : (
          <p className="small">Cette catégorie est vide.</p>
        )}
        <div className="row">
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn danger" onClick={confirmDelete}>
            Supprimer la catégorie
          </button>
        </div>
      </div>
    </div>
  );
}
