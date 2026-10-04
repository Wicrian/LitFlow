import { Check, HelpCircle, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Decision, Project, RecordItem, Stage, StageDecision } from '../types';
import { applyFilters, emptyFilters, sortRecords, type Filters, type SortKey } from '../lib/filters';
import { fulltextKeys, recordKind, screeningKeys } from '../lib/prisma';
import { authorsShort, highlight, splitKeywords } from '../lib/text';
import { useProject } from '../store';
import { zoteroOpenPdfLink, zoteroSelectLink, type ZItem } from '../zotero/api';
import { itemTypeLabel } from '../zotero/mapping';
import { FilterBar } from './FilterBar';
import { ClassifyPanel } from './ClassifyPanel';
import { AiProgressText, useAiProgress } from './AiProgress';
import { runSuggestions } from '../ai/run';
import { cohenKappa, kappaLabel } from '../lib/agreement';

const DECISION_ICON: Record<Decision, ReactNode> = { exclude: <X />, maybe: <HelpCircle />, include: <Check /> };

export const DECISION_UI: Record<Decision, { label: string; icon: string; key: string }> = {
  exclude: { label: 'Exclure', icon: '✕', key: '←' },
  maybe: { label: 'Incertain', icon: '?', key: '↑' },
  include: { label: 'Inclure', icon: '✓', key: '→' },
};

type HistoryEntry = { key: string; prev?: StageDecision; prevNotRetrieved?: string };

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
};

export function Review({ stage }: { stage: Stage }) {
  const { project: p, decide, update, markDirty } = useProject();
  const [filters, setFilters] = useState<Filters>(() => ({ ...emptyFilters(), [stage]: 'undecided' }));
  const [sort, setSort] = useState<SortKey | ''>('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ key: string; decision: Decision } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [aiDisagree, setAiDisagree] = useState(false);

  const decisions = p[stage];
  const baseKeys = useMemo(() => (stage === 'screening' ? screeningKeys(p) : fulltextKeys(p)), [stage, p]);
  const pool = useMemo(() => baseKeys.map((k) => p.records[k]), [baseKeys, p.records]);
  const queue = useMemo(() => {
    let rs = applyFilters(p, pool, filters);
    if (aiDisagree) rs = rs.filter((r) => isAiDisagreement(p, r.key));
    return sortRecords(p, rs, sort, 1).map((r) => r.key);
  }, [p, pool, filters, sort, aiDisagree]);

  const cur = currentKey && queue.includes(currentKey) ? currentKey : queue[0] ?? null;
  const idx = cur ? queue.indexOf(cur) : -1;
  const record = cur ? p.records[cur] : null;

  const counts = useMemo(() => {
    const c = { include: 0, exclude: 0, maybe: 0, none: 0, notRetrieved: 0 };
    for (const k of baseKeys) {
      if (stage === 'fulltext' && k in p.notRetrieved) c.notRetrieved++;
      else c[decisions[k]?.decision ?? 'none']++;
    }
    return c;
  }, [baseKeys, decisions, p.notRetrieved, stage]);

  const go = (delta: number) => {
    if (idx < 0) return;
    const next = queue[Math.min(Math.max(idx + delta, 0), queue.length - 1)];
    if (next) setCurrentKey(next);
  };

  const makeDecision = (decision: Decision, key = cur) => {
    if (!key) return;
    const i = queue.indexOf(key);
    const prev = decisions[key];
    setHistory((h) => [...h.slice(-49), { key, prev, prevNotRetrieved: p.notRetrieved[key] }]);
    const keepReasons = prev?.decision === decision ? prev.reasons : [];
    decide(stage, key, { decision, reasons: keepReasons, note: noteDrafts[key] ?? prev?.note ?? '' });
    if (stage === 'fulltext' && key in p.notRetrieved) toggleNotRetrieved(key, false);
    // Passe à la référence suivante de la file.
    setCurrentKey(queue[i + 1] ?? queue[i - 1] ?? null);
    if (p.askReason[decision]) setSheet({ key, decision });
  };

  const toggleNotRetrieved = (key: string, value: boolean) => {
    update((x) => {
      const notRetrieved = { ...x.notRetrieved };
      if (value) notRetrieved[key] = new Date().toISOString().slice(0, 10);
      else delete notRetrieved[key];
      return { ...x, notRetrieved };
    });
    markDirty([key]);
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    decide(stage, last.key, last.prev ? { decision: last.prev.decision, reasons: last.prev.reasons, note: last.prev.note } : null);
    if (stage === 'fulltext') toggleNotRetrieved(last.key, last.prevNotRetrieved !== undefined);
    setSheet(null);
    // Si le filtre masque la référence restaurée, on l'affiche quand même en élargissant la file.
    setCurrentKey(last.key);
    if (!last.prev && filters[stage] !== 'undecided' && filters[stage] !== 'all') setFilters({ ...filters, [stage]: 'all' });
  };

  // Raccourcis clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !isTyping(e) && !sheet) {
          e.preventDefault();
          undo();
        }
        return;
      }
      const map: Record<string, () => void> = {
        ArrowRight: () => makeDecision('include'),
        i: () => makeDecision('include'),
        ArrowLeft: () => makeDecision('exclude'),
        e: () => makeDecision('exclude'),
        ArrowUp: () => makeDecision('maybe'),
        u: () => makeDecision('maybe'),
        '?': () => makeDecision('maybe'),
        ArrowDown: () => go(1),
        s: () => go(1),
        p: () => go(-1),
        z: () => undo(),
        Backspace: () => undo(),
      };
      const fn = map[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const total = baseKeys.length;
  const otherCount = stage === 'fulltext' ? baseKeys.filter((k) => recordKind(p, p.records[k]) === 'other').length : 0;
  const includeWords = [...splitKeywords(p.highlightInclude), ...p.framework.elements.flatMap((el) => splitKeywords(el.keywords))];
  const excludeWords = splitKeywords(p.highlightExclude);

  return (
    <div className="review">
      <div className="stack">
        <div className="panel stack" style={{ padding: '0.9rem 1.1rem' }}>
          <div className="row">
            <div className="seg">
              {(
                [
                  ['undecided', 'À trier'],
                  ['maybe', 'Incertaines'],
                  ['include', 'Incluses'],
                  ['exclude', 'Exclues'],
                  ...(stage === 'fulltext' ? [['notretrieved', 'Introuvables']] : []),
                  ['all', 'Toutes'],
                ] as [Filters['screening'], string][]
              ).map(([k, l]) => (
                <button key={k} className={filters[stage] === k ? 'on' : ''} onClick={() => setFilters({ ...filters, [stage]: k })}>
                  {l}
                </button>
              ))}
            </div>
            <span className="spacer" />
            <span className="muted small">{queue.length} dans la file</span>
            <select style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="">Ordre de Zotero</option>
              <option value="title">Titre</option>
              <option value="year">Année</option>
              <option value="author">Premier auteur</option>
              <option value="publication">Revue</option>
              <option value="source">Source</option>
              <option value="abstract">Longueur du résumé</option>
            </select>
            <button className={`btn small ${showFilters ? 'primary' : ''}`} onClick={() => setShowFilters(!showFilters)}>
              Filtres
            </button>
          </div>
          <div className="progress" title={`${counts.include} inclus · ${counts.exclude} exclus · ${counts.maybe} incertains`}>
            <div style={{ width: `${(counts.include / total) * 100 || 0}%`, background: 'var(--include)' }} />
            <div style={{ width: `${(counts.maybe / total) * 100 || 0}%`, background: 'var(--maybe)' }} />
            <div style={{ width: `${(counts.exclude / total) * 100 || 0}%`, background: 'var(--exclude)' }} />
            <div style={{ width: `${(counts.notRetrieved / total) * 100 || 0}%`, background: 'var(--muted)' }} />
          </div>
          {showFilters && (
            <>
              <FilterBar records={pool} filters={filters} onChange={setFilters} />
              <div className="row">
                <button className="btn small" onClick={() => setFilters({ ...emptyFilters(), [stage]: filters[stage] })}>
                  Réinitialiser les filtres
                </button>
              </div>
            </>
          )}
        </div>

        {stage === 'fulltext' && otherCount > 0 && (
          <div className="notice small">
            {otherCount} référence(s) de ce total viennent de sources de type « autre méthode » (recherche par citations,
            sites web…) : selon PRISMA 2020, elles passent directement au texte intégral, sans tri titre-résumé. Si c’est
            une erreur, changez le type de la source dans l’onglet <strong>2. Identification</strong> (tableau « Sources »).
          </div>
        )}
        {total === 0 ? (
          <div className="panel muted">
            {stage === 'screening'
              ? 'Aucune référence à trier : importez d’abord vos références depuis Zotero (onglet Identification).'
              : 'Aucune référence à évaluer : incluez d’abord des références au tri titre-résumé.'}
          </div>
        ) : !record ? (
          <div className="panel">
            <strong>🎉 Aucune référence dans cette file.</strong>
            <p className="muted">
              Changez le filtre (ex. « Incertaines » pour revenir sur vos doutes, ou « Toutes » pour relire vos décisions).
            </p>
          </div>
        ) : (
          <>
            <SwipeCard key={record.key} onSwipe={(d) => makeDecision(d, record.key)}>
              <RecordCard
                r={record}
                decision={decisions[record.key]}
                notRetrieved={stage === 'fulltext' && record.key in p.notRetrieved}
                includeWords={includeWords}
                excludeWords={excludeWords}
                showLinks={stage === 'fulltext'}
              />
            </SwipeCard>
            <div className="actions">
              {(['exclude', 'maybe', 'include'] as Decision[]).map((d) => (
                <button key={d} className={`decide ${d}`} onClick={() => makeDecision(d)}>
                  <span className="disc">{DECISION_ICON[d]}</span>
                  <span>
                    {DECISION_UI[d].label} <kbd>{DECISION_UI[d].key}</kbd>
                  </span>
                </button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn small" onClick={() => go(-1)} disabled={idx <= 0}>
                ‹ Précédente <kbd>P</kbd>
              </button>
              <span className="small muted">
                {idx + 1} / {queue.length}
              </span>
              <button className="btn small" onClick={() => go(1)} disabled={idx >= queue.length - 1}>
                Passer <kbd>↓</kbd> ›
              </button>
              <button className="btn small" onClick={undo} disabled={!history.length}>
                ↶ Annuler <kbd>Z</kbd>
              </button>
              {decisions[record.key] && (
                <button className="btn small" onClick={() => setSheet({ key: record.key, decision: decisions[record.key].decision })}>
                  ✎ Raisons / note
                </button>
              )}
            </div>
            <ClassifyPanel recordKey={record.key} />
            {stage === 'fulltext' && (
              <FulltextPanel
                r={record}
                note={noteDrafts[record.key] ?? decisions[record.key]?.note ?? ''}
                onNote={(note) => {
                  setNoteDrafts({ ...noteDrafts, [record.key]: note });
                  const d = decisions[record.key];
                  if (d) decide(stage, record.key, { decision: d.decision, reasons: d.reasons, note });
                }}
                notRetrieved={record.key in p.notRetrieved}
                onNotRetrieved={(v) => {
                  setHistory((h) => [...h.slice(-49), { key: record.key, prev: decisions[record.key], prevNotRetrieved: p.notRetrieved[record.key] }]);
                  toggleNotRetrieved(record.key, v);
                  if (v) {
                    decide(stage, record.key, null);
                    setCurrentKey(queue[idx + 1] ?? queue[idx - 1] ?? null);
                  }
                }}
              />
            )}
          </>
        )}
      </div>

      <aside className="stack">
        <Sidebar stage={stage} counts={counts} total={total} history={history} onJump={(k) => setCurrentKey(k)} />
        {stage === 'screening' && p.ai.enabled && (
          <AiPanel
            disagreeOnly={aiDisagree}
            onDisagreeOnly={(v) => {
              setAiDisagree(v);
              if (v) setFilters({ ...filters, screening: 'all' });
            }}
          />
        )}
      </aside>

      {sheet && (
        <ReasonSheet
          stage={stage}
          decisionKey={sheet.key}
          decision={sheet.decision}
          onClose={() => setSheet(null)}
          onChangeDecision={(d) => {
            const prev = decisions[sheet.key];
            decide(stage, sheet.key, { decision: d, reasons: [], note: prev?.note ?? '' });
            setSheet({ ...sheet, decision: d });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Carte à glisser : droite = inclure, gauche = exclure, haut = incertain. */
function SwipeCard({ onSwipe, children }: { onSwipe: (d: Decision) => void; children: ReactNode }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [d, setD] = useState({ x: 0, y: 0 });
  const [flying, setFlying] = useState<Decision | null>(null);
  const THRESHOLD = 110;

  const decisionFor = (x: number, y: number): Decision | null =>
    x > THRESHOLD ? 'include' : x < -THRESHOLD ? 'exclude' : y < -THRESHOLD && Math.abs(x) < THRESHOLD ? 'maybe' : null;

  const end = () => {
    if (!start.current) return;
    start.current = null;
    const dec = decisionFor(d.x, d.y);
    if (!dec) return setD({ x: 0, y: 0 });
    setFlying(dec);
    setTimeout(() => onSwipe(dec), 200);
  };

  const transform = flying
    ? flying === 'maybe'
      ? 'translate(0, -120%)'
      : `translate(${flying === 'include' ? 140 : -140}%, 0) rotate(${flying === 'include' ? 20 : -20}deg)`
    : `translate(${d.x}px, ${Math.min(d.y, 0)}px) rotate(${d.x / 25}deg)`;
  const op = (v: number) => Math.min(Math.max(v / THRESHOLD, 0), 1);

  return (
    <div className="deck">
      <div
        className={`card ${start.current ? 'dragging' : ''} ${flying || !start.current ? 'animating' : ''}`}
        style={{ transform, opacity: flying ? 0 : 1 }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('a,button,input,textarea,select')) return;
          start.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => start.current && setD({ x: e.clientX - start.current.x, y: e.clientY - start.current.y })}
        onPointerUp={end}
        onPointerCancel={() => {
          start.current = null;
          setD({ x: 0, y: 0 });
        }}
      >
        <div className="stamp include" style={{ opacity: flying === 'include' ? 1 : op(d.x) }}>Inclure</div>
        <div className="stamp exclude" style={{ opacity: flying === 'exclude' ? 1 : op(-d.x) }}>Exclure</div>
        <div className="stamp maybe" style={{ opacity: flying === 'maybe' ? 1 : Math.abs(d.x) < THRESHOLD ? op(-d.y) : 0 }}>Incertain</div>
        {children}
      </div>
    </div>
  );
}

function Highlighted({ text, include, exclude }: { text: string; include: string[]; exclude: string[] }) {
  const segs = useMemo(() => highlight(text, include, exclude), [text, include, exclude]);
  return (
    <>
      {segs.map((s, i) => (s.mark ? <mark key={i} className={s.mark}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}

function RecordCard({
  r,
  decision,
  notRetrieved,
  includeWords,
  excludeWords,
  showLinks,
}: {
  r: RecordItem;
  decision?: StageDecision;
  notRetrieved?: boolean;
  includeWords: string[];
  excludeWords: string[];
  showLinks: boolean;
}) {
  const { project: p } = useProject();
  return (
    <>
      <div className="row small" style={{ marginBottom: '0.5rem' }}>
        {decision && (
          <span className={`badge ${decision.decision}`}>
            {DECISION_UI[decision.decision].label}
            {decision.reasons.length ? ` · ${decision.reasons.join(', ')}` : ''}
          </span>
        )}
        {notRetrieved && <span className="badge">Texte introuvable</span>}
        {!showLinks && <AiBadge recordKey={r.key} decided={!!decision} />}
        <span className="badge">{itemTypeLabel(r.itemType)}</span>
        {r.sources.map((s) => (
          <span key={s} className="badge">
            {s}
          </span>
        ))}
      </div>
      <h2>
        <Highlighted text={r.title || '(sans titre)'} include={includeWords} exclude={excludeWords} />
      </h2>
      <div className="meta">
        {authorsShort(r.creators, 6) || 'Auteur inconnu'} · {r.year ?? 's.d.'}
        {r.publication && <> · <em>{r.publication}</em></>}
        {r.pageCount && <> · {r.pageCount} p.</>}
        {r.language && <> · {r.language}</>}
      </div>
      <div className="abstract">
        {r.abstract ? (
          <Highlighted text={r.abstract} include={includeWords} exclude={excludeWords} />
        ) : (
          <span className="muted">Pas de résumé dans Zotero.</span>
        )}
      </div>
      <div className="row small" style={{ marginTop: '0.75rem' }}>
        {p.library && <a href={zoteroSelectLink(p.library, r.key)}>Ouvrir dans Zotero</a>}
        {r.doi && (
          <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">
            DOI
          </a>
        )}
        {r.url && showLinks && (
          <a href={r.url} target="_blank" rel="noreferrer">
            Lien
          </a>
        )}
        {r.zoteroTags.filter((t) => !t.startsWith(`${p.sync.tagPrefix}:`)).slice(0, 8).map((t) => (
          <span key={t} className="muted">#{t}</span>
        ))}
      </div>
    </>
  );
}

function FulltextPanel({
  r,
  note,
  onNote,
  notRetrieved,
  onNotRetrieved,
}: {
  r: RecordItem;
  note: string;
  onNote: (n: string) => void;
  notRetrieved: boolean;
  onNotRetrieved: (v: boolean) => void;
}) {
  const { project: p, client } = useProject();
  const [attachments, setAttachments] = useState<ZItem[] | null>(null);

  useEffect(() => {
    setAttachments(null);
    if (!client) return;
    let alive = true;
    client
      .children(r.key)
      .then((c) => alive && setAttachments(c.filter((x) => x.data.itemType === 'attachment')))
      .catch(() => alive && setAttachments([]));
    return () => {
      alive = false;
    };
  }, [client, r.key]);

  return (
    <div className="panel stack">
      <div className="row">
        <strong>Texte intégral</strong>
        {attachments === null && client && <span className="small muted">Recherche des pièces jointes…</span>}
        {attachments?.map((a) => (
          <a key={a.key} className="btn small" href={a.data.contentType === 'application/pdf' ? zoteroOpenPdfLink(p.library, a.key) : zoteroSelectLink(p.library, a.key)}>
            📄 {String(a.data.title || a.data.filename || 'Pièce jointe')}
          </a>
        ))}
        {attachments?.length === 0 && <span className="small muted">Aucune pièce jointe dans Zotero.</span>}
        <span className="spacer" />
        <label className="row small">
          <input type="checkbox" checked={notRetrieved} onChange={(e) => onNotRetrieved(e.target.checked)} />
          Texte intégral introuvable
        </label>
      </div>
      <label className="field">
        <span>Notes de lecture (enregistrées avec la décision et envoyées dans la note Zotero)</span>
        <textarea value={note} onChange={(e) => onNote(e.target.value)} style={{ minHeight: '7rem' }} />
      </label>
    </div>
  );
}

function Sidebar({
  stage,
  counts,
  total,
  history,
  onJump,
}: {
  stage: Stage;
  counts: { include: number; exclude: number; maybe: number; none: number; notRetrieved: number };
  total: number;
  history: HistoryEntry[];
  onJump: (k: string) => void;
}) {
  const { project: p } = useProject();
  return (
    <>
      <div className="panel stack small">
        <div className="row">
          <strong style={{ fontSize: '1rem' }}>Avancement</strong>
          <span className="spacer" />
          <span className="badge">{total ? Math.round(((total - counts.none) / total) * 100) : 0} %</span>
        </div>
        <div className="tiles">
          <div className="tile t1">
            <div className="tile-label">Incluses</div>
            <div className="tile-value">{counts.include}</div>
          </div>
          <div className="tile t2">
            <div className="tile-label">Exclues</div>
            <div className="tile-value">{counts.exclude}</div>
          </div>
          <div className="tile t3">
            <div className="tile-label">Incertaines</div>
            <div className="tile-value">{counts.maybe}</div>
          </div>
          <div className="tile t4">
            <div className="tile-label">{stage === 'fulltext' && counts.notRetrieved ? `À trier · ${counts.notRetrieved} introuv.` : 'À trier'}</div>
            <div className="tile-value">{counts.none}</div>
          </div>
        </div>
      </div>
      {(p.question || p.inclusionCriteria.length > 0 || p.exclusionCriteria.length > 0) && (
        <details className="panel small" open>
          <summary>
            <strong>Protocole</strong>
          </summary>
          {p.question && <p>{p.question}</p>}
          {p.framework.elements.some((e) => e.description) && (
            <ul>
              {p.framework.elements.filter((e) => e.description).map((e, i) => (
                <li key={i}>
                  <strong>{e.letter}</strong> : {e.description}
                </li>
              ))}
            </ul>
          )}
          {p.inclusionCriteria.length > 0 && (
            <>
              <div style={{ color: 'var(--include)' }}>Inclusion</div>
              <ul>{p.inclusionCriteria.map((c) => <li key={c}>{c}</li>)}</ul>
            </>
          )}
          {p.exclusionCriteria.length > 0 && (
            <>
              <div style={{ color: 'var(--exclude)' }}>Exclusion</div>
              <ul>{p.exclusionCriteria.map((c) => <li key={c}>{c}</li>)}</ul>
            </>
          )}
        </details>
      )}
      <details className="panel small">
        <summary>
          <strong>Raccourcis</strong>
        </summary>
        <ul>
          <li>Glisser à droite ou <kbd>→</kbd> / <kbd>I</kbd> : inclure</li>
          <li>Glisser à gauche ou <kbd>←</kbd> / <kbd>E</kbd> : exclure</li>
          <li>Glisser vers le haut ou <kbd>↑</kbd> / <kbd>U</kbd> : incertain</li>
          <li><kbd>↓</kbd> passer · <kbd>P</kbd> précédente · <kbd>Z</kbd> annuler</li>
          <li>Raisons : <kbd>1</kbd>–<kbd>9</kbd>, <kbd>Entrée</kbd> valider, <kbd>Échap</kbd> passer</li>
        </ul>
      </details>
      {history.length > 0 && (
        <div className="panel small stack">
          <strong>Dernières décisions</strong>
          {[...history].reverse().slice(0, 8).map((h, i) => {
            const d = p[stage][h.key];
            return (
              <div key={i} className="row" style={{ flexWrap: 'nowrap', cursor: 'pointer' }} onClick={() => onJump(h.key)}>
                {d ? <span className={`badge ${d.decision}`}>{DECISION_UI[d.decision].icon}</span> : <span className="badge">·</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.records[h.key]?.title}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

export function ReasonSheet({
  stage,
  decisionKey,
  decision,
  onClose,
  onChangeDecision,
}: {
  stage: Stage;
  decisionKey: string;
  decision: Decision;
  onClose: () => void;
  onChangeDecision: (d: Decision) => void;
}) {
  const { project: p, decide, rememberReason } = useProject();
  const current = p[stage][decisionKey];
  const [selected, setSelected] = useState<string[]>(current?.reasons ?? []);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState(current?.note ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setSelected(current?.decision === decision ? current.reasons : []), [decision]); // eslint-disable-line react-hooks/exhaustive-deps

  const criteria = decision === 'exclude' ? p.exclusionCriteria : decision === 'include' ? p.inclusionCriteria : [];
  const options = [...new Set([...p.reasons[stage][decision], ...criteria])];

  const toggle = (r: string) => setSelected((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));
  const addDraft = () => {
    const v = draft.trim();
    if (!v) return;
    rememberReason(stage, decision, v);
    setSelected((s) => (s.includes(v) ? s : [...s, v]));
    setDraft('');
  };
  const save = () => {
    const reasons = draft.trim() ? [...selected, draft.trim()] : selected;
    if (draft.trim()) rememberReason(stage, decision, draft.trim());
    decide(stage, decisionKey, { decision, reasons: [...new Set(reasons)], note });
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (e.target as HTMLElement).tagName !== 'TEXTAREA')) {
        e.preventDefault();
        save();
        return;
      }
      if (isTyping(e)) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && options[n - 1]) {
        e.preventDefault();
        toggle(options[n - 1]);
      } else if (e.key === '/' || e.key === 'r') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const r = p.records[decisionKey];
  return (
    <div className="overlay" onClick={save}>
      <div className="sheet stack" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          {(['exclude', 'maybe', 'include'] as Decision[]).map((d) => (
            <button key={d} className={`btn small ${d === decision ? d : ''}`} onClick={() => d !== decision && onChangeDecision(d)}>
              {DECISION_UI[d].icon} {DECISION_UI[d].label}
            </button>
          ))}
        </div>
        <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r?.title}
        </div>
        <strong>Pourquoi ? (facultatif)</strong>
        <div className="chips">
          {options.map((o, i) => (
            <span key={o} className={`chip ${selected.includes(o) ? 'on' : ''}`} onClick={() => toggle(o)}>
              {i < 9 && <kbd>{i + 1}</kbd>} {o}
            </span>
          ))}
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            placeholder="Nouvelle raison (mémorisée pour la suite)…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && draft.trim()) {
                e.preventDefault();
                e.stopPropagation();
                addDraft();
              }
            }}
          />
          <button className="btn small" onClick={addDraft} disabled={!draft.trim()}>
            Ajouter
          </button>
        </div>
        <textarea placeholder="Note (facultative)" value={note} onChange={(e) => setNote(e.target.value)} />
        {decision === 'exclude' && selected.length > 1 && (
          <div className="small muted">La première raison sélectionnée est utilisée dans le diagramme PRISMA.</div>
        )}
        <div className="row">
          <button className="btn primary" onClick={save}>
            Valider <kbd>Entrée</kbd>
          </button>
          <button className="btn" onClick={onClose}>
            Passer <kbd>Échap</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant IA

/** Suggestion faite avant la décision humaine, et différente d'elle. */
function isAiDisagreement(p: Project, key: string): boolean {
  const s = p.ai.suggestions[key];
  const d = p.screening[key];
  return !!s && !!d && s.decision !== d.decision;
}

function AiBadge({ recordKey, decided }: { recordKey: string; decided: boolean }) {
  const { project: p } = useProject();
  const s = p.ai.suggestions[recordKey];
  if (!p.ai.enabled || !s || p.ai.show === 'never' || (p.ai.show === 'after' && !decided)) return null;
  return (
    <span className={`badge ${s.decision}`} title={`${s.reason}\n(${s.mode === 'learned' ? 'appris de vos décisions' : 'comparaison avec vos critères'}, score ${s.score.toFixed(2)})`}>
      🤖 IA : {DECISION_UI[s.decision].label.toLowerCase()} ?{s.reason ? ` — ${s.reason}` : ''}
    </span>
  );
}

function AiPanel({ disagreeOnly, onDisagreeOnly }: { disagreeOnly: boolean; onDisagreeOnly: (v: boolean) => void }) {
  const { project: p, update } = useProject();
  const ai = useAiProgress();
  const keys = screeningKeys(p);
  const suggested = keys.filter((k) => p.ai.suggestions[k]);
  const pending = keys.filter((k) => !p.screening[k] && !p.ai.suggestions[k]).length;
  // Accord mesuré seulement sur les décisions prises APRÈS la suggestion.
  const pairs = keys
    .filter((k) => p.ai.suggestions[k] && p.screening[k] && (p.ai.suggestions[k].at ?? '') <= p.screening[k].at)
    .map((k) => [p.ai.suggestions[k].decision, p.screening[k].decision] as [Decision, Decision]);
  const agreement = cohenKappa(pairs);
  const disagreements = keys.filter((k) => isAiDisagreement(p, k)).length;
  const decidedCount = keys.filter((k) => p.screening[k] && p.screening[k].decision !== 'maybe').length;

  return (
    <div className="panel stack small">
      <strong>🤖 Assistant IA (local)</strong>
      <div className="muted">
        {suggested.length} suggestion(s) · {pending} sans suggestion
        {p.ai.learn && decidedCount < 6 && <> · l’IA apprendra de vos décisions après ~3 inclusions et 3 exclusions</>}
      </div>
      <button
        className="btn small"
        disabled={ai.running}
        onClick={() =>
          ai.run(async (onProgress) => {
            const suggestions = await runSuggestions(p, onProgress);
            update((cur) => ({ ...cur, ai: { ...cur.ai, suggestions: { ...cur.ai.suggestions, ...suggestions }, lastRun: new Date().toISOString() } }));
          })
        }
      >
        {suggested.length ? 'Mettre à jour les suggestions' : 'Lancer les suggestions'}
      </button>
      <AiProgressText state={ai} />
      {agreement.n > 0 && (
        <div>
          Accord avec l’IA : <strong>{Math.round(agreement.observed * 100)} %</strong> sur {agreement.n} décision(s)
          {agreement.kappa !== null && (
            <>
              {' '}· kappa = {agreement.kappa.toFixed(2)} ({kappaLabel(agreement.kappa)})
            </>
          )}
        </div>
      )}
      {disagreements > 0 && (
        <label className="row">
          <input type="checkbox" checked={disagreeOnly} onChange={(e) => onDisagreeOnly(e.target.checked)} />
          Revoir les {disagreements} désaccord(s) avec l’IA
        </label>
      )}
      <div className="muted">
        L’IA compare le sens des textes à vos critères et à vos décisions. Elle se trompe souvent : c’est un deuxième avis,
        pas une décision.
      </div>
    </div>
  );
}
