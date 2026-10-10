import { useMemo, useState } from 'react';
import { Copy, ExternalLink, NotebookPen, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { SearchConcept, SearchDatabase, SearchRun, SearchState } from '../types';
import { conceptsFromProtocol, DB_PROFILES, genericEquation, profileFor, searchJournalCsv, translate } from '../lib/search';
import { download, safeFileName } from '../lib/export';
import { normalizeForCompare } from '../lib/text';
import { useProject } from '../store';
import { Portal } from './Portal';

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function CopyButton({ text, label = 'Copier' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn small"
      onClick={async () => {
        await copy(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      <Copy size={14} /> {done ? 'Copié ✓' : label}
    </button>
  );
}

export function SearchStrategy() {
  const { project: p, update } = useProject();
  const s = p.search;
  const set = (fn: (s: SearchState) => SearchState) => update((cur) => ({ ...cur, search: fn(cur.search) }));

  return (
    <div className="stack">
      <Concepts s={s} set={set} />
      <Databases s={s} set={set} />
      <Journal s={s} set={set} />
      {p.question && <div className="small muted">Question de recherche : {p.question}</div>}
    </div>
  );
}

type SetSearch = (fn: (s: SearchState) => SearchState) => void;

// ---------------------------------------------------------------------------
// 1. Concepts et mots-clés

function Concepts({ s, set }: { s: SearchState; set: SetSearch }) {
  const { project: p } = useProject();
  const equation = genericEquation(s);
  const setConcept = (id: string, fn: (c: SearchConcept) => SearchConcept) =>
    set((x) => ({ ...x, concepts: x.concepts.map((c) => (c.id === id ? fn(c) : c)) }));

  return (
    <section className="panel stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>1. Concepts et mots-clés</h2>
        <span className="spacer" />
        <button
          className="btn small"
          onClick={() => {
            const fromP = conceptsFromProtocol(p);
            if (!fromP.length) return alert('Remplissez d’abord les éléments de votre question (PICO, SPIDER…) dans l’onglet Protocole.');
            if (s.concepts.length && !confirm('Remplacer vos concepts par ceux du protocole ?')) return;
            set((x) => ({ ...x, concepts: fromP }));
          }}
        >
          Reprendre les éléments du protocole
        </button>
      </div>
      <p className="small muted">
        Découpez votre question en concepts : une colonne par concept, avec ses synonymes et variantes. Les mots d’une même
        colonne sont reliés par <strong>OU</strong>, les colonnes entre elles par <strong>ET</strong>. Écrivez <code>*</code>{' '}
        pour la troncature (<code>municipal*</code>) ; les expressions de plusieurs mots sont mises entre guillemets
        automatiquement. Vous pourrez ensuite ajuster l’équation de chaque base.
      </p>
      <div className="concepts">
        {s.concepts.map((c, i) => (
          <div key={c.id} className="concept-wrap">
            {i > 0 && <span className="concept-and">ET</span>}
            <div className="concept-col">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  type="text"
                  className="concept-name"
                  value={c.name}
                  placeholder="Nom du concept"
                  onChange={(e) => setConcept(c.id, (x) => ({ ...x, name: e.target.value }))}
                />
                <button
                  className="icon-btn"
                  title="Supprimer ce concept"
                  onClick={() => confirm(`Supprimer le concept « ${c.name} » ?`) && set((x) => ({ ...x, concepts: x.concepts.filter((y) => y.id !== c.id) }))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {c.terms.map((t, j) => (
                <div key={j} className="term-row">
                  {j > 0 && <span className="term-or">OU</span>}
                  <input
                    type="text"
                    value={t}
                    onChange={(e) => setConcept(c.id, (x) => ({ ...x, terms: x.terms.map((y, k) => (k === j ? e.target.value : y)) }))}
                  />
                  <button className="icon-btn" title="Retirer" onClick={() => setConcept(c.id, (x) => ({ ...x, terms: x.terms.filter((_, k) => k !== j) }))}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <AddTerm onAdd={(terms) => setConcept(c.id, (x) => ({ ...x, terms: [...x.terms, ...terms.filter((t) => !x.terms.includes(t))] }))} />
            </div>
          </div>
        ))}
        <button
          className="concept-col concept-add"
          onClick={() => set((x) => ({ ...x, concepts: [...x.concepts, { id: uid(), name: `Concept ${x.concepts.length + 1}`, terms: [] }] }))}
        >
          <Plus /> Concept
        </button>
      </div>
      <div className="row">
        <span className="small muted">Chercher dans :</span>
        <div className="seg">
          {(
            [
              ['tiab', 'Titre + résumé (recommandé)'],
              ['title', 'Titre seulement'],
              ['all', 'Tous les champs'],
            ] as [SearchState['field'], string][]
          ).map(([k, l]) => (
            <button key={k} className={s.field === k ? 'on' : ''} onClick={() => set((x) => ({ ...x, field: k }))}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {equation && (
        <div className="equation">
          <div className="small muted">Équation générale</div>
          <code>{equation}</code>
          <CopyButton text={equation} />
        </div>
      )}
    </section>
  );
}

function AddTerm({ onAdd }: { onAdd: (t: string[]) => void }) {
  const [v, setV] = useState('');
  const add = () => {
    const terms = v
      .split(/[\n;]/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (terms.length) onAdd(terms);
    setV('');
  };
  return (
    <div className="term-row">
      <input
        type="text"
        value={v}
        placeholder="+ mot-clé (Entrée)"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        onBlur={add}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (/[\n;]/.test(text)) {
            e.preventDefault();
            onAdd(text.split(/[\n;]/).map((x) => x.trim()).filter(Boolean));
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Bases de données

function Databases({ s, set }: { s: SearchState; set: SetSearch }) {
  const [custom, setCustom] = useState(false);
  const enabled = new Set(s.databases.map((d) => d.profileId).filter(Boolean));
  const setDb = (id: string, fn: (d: SearchDatabase) => SearchDatabase) =>
    set((x) => ({ ...x, databases: x.databases.map((d) => (d.id === id ? fn(d) : d)) }));

  return (
    <section className="panel stack">
      <h2 style={{ margin: 0 }}>2. L’équation dans chaque base</h2>
      <p className="small muted">
        Choisissez vos bases : LitFlow traduit l’équation dans leur syntaxe et explique comment la saisir, en un seul
        copier-coller ou ligne par ligne dans le formulaire de recherche avancée. Vous pouvez modifier chaque équation :
        votre version est enregistrée.
      </p>
      <div className="chips">
        {DB_PROFILES.map((prof) => (
          <span
            key={prof.id}
            className={`chip ${enabled.has(prof.id) ? 'on' : ''}`}
            onClick={() =>
              set((x) =>
                enabled.has(prof.id)
                  ? { ...x, databases: x.databases.filter((d) => d.profileId !== prof.id) }
                  : { ...x, databases: [...x.databases, { id: uid(), profileId: prof.id, name: prof.name, override: null, overrideBase: null, notes: '' }] },
              )
            }
          >
            {enabled.has(prof.id) ? '✓ ' : ''}
            {prof.name}
          </span>
        ))}
        <button className="btn small" onClick={() => setCustom(true)}>
          <Plus size={14} /> Autre base
        </button>
      </div>
      {s.databases.map((db) => (
        <DatabaseCard key={db.id} s={s} db={db} setDb={setDb} set={set} />
      ))}
      {custom && <CustomDbDialog onClose={() => setCustom(false)} onAdd={(db) => set((x) => ({ ...x, databases: [...x.databases, db] }))} />}
    </section>
  );
}

function DatabaseCard({ s, db, setDb, set }: { s: SearchState; db: SearchDatabase; setDb: (id: string, fn: (d: SearchDatabase) => SearchDatabase) => void; set: SetSearch }) {
  const prof = profileFor(db);
  const tr = useMemo(() => translate(s, prof), [s, prof]);
  const final = db.override ?? tr.query;
  const autoChanged = db.override !== null && db.overrideBase !== tr.query;
  const status = { officiel: 'Règles officielles', observé: 'Règles observées', 'à vérifier': 'Règles à vérifier' }[prof.status];

  return (
    <div className="db-card stack">
      <div className="row">
        <strong style={{ fontSize: '1.05rem' }}>{db.name}</strong>
        <span className={`badge ${prof.status === 'officiel' ? 'include' : prof.status === 'observé' ? 'maybe' : ''}`}>{status}</span>
        {prof.help && (
          <a className="small" href={prof.help} target="_blank" rel="noreferrer">
            Aide de la base <ExternalLink size={12} />
          </a>
        )}
        <span className="spacer" />
        <button className="icon-btn" title="Retirer cette base" onClick={() => set((x) => ({ ...x, databases: x.databases.filter((d) => d.id !== db.id) }))}>
          <Trash2 size={15} />
        </button>
      </div>
      <textarea
        className="db-query"
        value={final}
        placeholder="Ajoutez des mots-clés dans vos concepts pour générer l’équation."
        onChange={(e) => setDb(db.id, (d) => ({ ...d, override: e.target.value, overrideBase: tr.query }))}
      />
      <div className="row">
        <CopyButton text={final} label="Copier l’équation" />
        {db.override !== null && (
          <button className="btn small" onClick={() => setDb(db.id, (d) => ({ ...d, override: null, overrideBase: null }))}>
            <RotateCcw size={14} /> Revenir à la traduction automatique
          </button>
        )}
        {db.override !== null && <span className="badge">Modifiée à la main</span>}
        <span className="spacer" />
        <button
          className="btn small dark"
          disabled={!final}
          onClick={() =>
            set((x) => ({ ...x, runs: [...x.runs, { id: uid(), dbId: db.id, date: today(), query: final, results: null, filters: '', notes: '' }] }))
          }
        >
          <NotebookPen size={14} /> Noter cette recherche au journal
        </button>
      </div>
      {autoChanged && (
        <div className="notice warn small">
          Vos concepts ont changé depuis que vous avez modifié cette équation : la traduction automatique serait maintenant
          différente. Revenez à la traduction automatique, ou ajustez votre version.
        </div>
      )}
      {tr.warnings.length > 0 && (
        <ul className="small db-warnings">
          {tr.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {tr.lines.length > 0 && (
        <details>
          <summary className="small">
            <strong>Mode d’emploi ligne par ligne</strong> (formulaire de recherche avancée)
          </summary>
          <ol className="lines">
            {tr.lines.map((l, i) => (
              <li key={i}>
                {l.operator && <div className="small">Ajoutez une ligne et choisissez l’opérateur <strong>{l.operator}</strong>.</div>}
                <div className="small muted">
                  {l.label}
                  {l.field && (
                    <>
                      {' '}
                      · champ : <strong>{l.field}</strong>
                    </>
                  )}
                </div>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <code className="line-text">{l.text}</code>
                  <CopyButton text={l.text} />
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
      <input
        type="text"
        value={db.notes}
        placeholder="Notes pour cette base (vocabulaire contrôlé ajouté, particularités…)"
        onChange={(e) => setDb(db.id, (d) => ({ ...d, notes: e.target.value }))}
      />
    </div>
  );
}

function CustomDbDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (db: SearchDatabase) => void }) {
  const [name, setName] = useState('');
  const [lang, setLang] = useState<'en' | 'fr'>('en');
  const [trunc, setTrunc] = useState('*');
  const [quotes, setQuotes] = useState(true);
  const [parens, setParens] = useState(true);
  const [help, setHelp] = useState('');
  return (
    <Portal><div className="overlay" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h2>Ajouter une base de données</h2>
        <p className="small muted">Indiquez ce que la base accepte (cherchez « aide », « recherche avancée » ou « opérateurs » sur son site).</p>
        <label className="field">
          <span>Nom de la base</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Isidore, Persée, OpenEdition…" />
        </label>
        <label className="field">
          <span>Opérateurs</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'fr')}>
            <option value="en">AND / OR (anglais, le plus courant)</option>
            <option value="fr">ET / OU (français)</option>
          </select>
        </label>
        <label className="field">
          <span>Symbole de troncature (laisser vide si la base n’en a pas)</span>
          <input type="text" value={trunc} onChange={(e) => setTrunc(e.target.value.slice(0, 1))} style={{ width: 80 }} />
        </label>
        <label className="row">
          <input type="checkbox" checked={quotes} onChange={(e) => setQuotes(e.target.checked)} /> Reconnaît les expressions entre guillemets
        </label>
        <label className="row">
          <input type="checkbox" checked={parens} onChange={(e) => setParens(e.target.checked)} /> Reconnaît les parenthèses
        </label>
        <label className="field">
          <span>Lien vers l’aide (facultatif)</span>
          <input type="text" value={help} onChange={(e) => setHelp(e.target.value)} />
        </label>
        <div className="row">
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => {
              onAdd({
                id: uid(),
                profileId: '',
                name: name.trim(),
                custom: { and: lang === 'fr' ? 'ET' : 'AND', or: lang === 'fr' ? 'OU' : 'OR', trunc, quotes, parens, help: help.trim() || undefined },
                override: null,
                overrideBase: null,
                notes: '',
              });
              onClose();
            }}
          >
            Ajouter
          </button>
        </div>
      </div>
    </div></Portal>
  );
}

// ---------------------------------------------------------------------------
// 3. Journal des recherches

function Journal({ s, set }: { s: SearchState; set: SetSearch }) {
  const { project: p } = useProject();
  const setRun = (id: string, patch: Partial<SearchRun>) => set((x) => ({ ...x, runs: x.runs.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  // Rapproche une base d'une source Zotero de même nom (pour comparer les chiffres).
  const imported = (dbName: string) => {
    const n = normalizeForCompare(dbName).split(' ')[0];
    const src = p.sources.find((x) => normalizeForCompare(x.name).includes(n) || n.includes(normalizeForCompare(x.name)));
    return src ? Object.values(p.records).filter((r) => r.sources.includes(src.name)).length : null;
  };

  return (
    <section className="panel stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>3. Journal des recherches</h2>
        <span className="spacer" />
        {s.runs.length > 0 && (
          <button className="btn small" onClick={() => download(`Recherches-${safeFileName(p.name)}.csv`, searchJournalCsv(p), 'text/csv;charset=utf-8')}>
            Exporter le journal (CSV)
          </button>
        )}
      </div>
      <p className="small muted">
        Pour chaque recherche lancée : la date, l’équation exacte, le nombre de résultats, les filtres utilisés (années,
        langues, types de documents…) et vos notes. C’est ce que demandent les lignes directrices PRISMA-S pour décrire une
        recherche.
      </p>
      {!s.runs.length && <div className="small muted">Aucune recherche notée. Utilisez « Noter cette recherche au journal » sous une base.</div>}
      {s.runs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Base</th>
                <th>Date</th>
                <th>Résultats</th>
                <th>Filtres / limites</th>
                <th>Notes</th>
                <th>Équation</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.runs.map((r) => {
                const db = s.databases.find((d) => d.id === r.dbId);
                const imp = db ? imported(db.name) : null;
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{db?.name ?? '?'}</strong>
                      {imp !== null && <div className="small muted">{imp} dans Zotero</div>}
                    </td>
                    <td>
                      <input type="date" value={r.date} onChange={(e) => setRun(r.id, { date: e.target.value })} />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={r.results ?? ''}
                        onChange={(e) => setRun(r.id, { results: e.target.value === '' ? null : Math.max(0, +e.target.value) })}
                      />
                    </td>
                    <td>
                      <input type="text" value={r.filters} placeholder="ex. 2015–2025, français/anglais" onChange={(e) => setRun(r.id, { filters: e.target.value })} />
                    </td>
                    <td>
                      <input type="text" value={r.notes} onChange={(e) => setRun(r.id, { notes: e.target.value })} />
                    </td>
                    <td>
                      <details>
                        <summary className="small">Voir</summary>
                        <code className="line-text">{r.query}</code>
                      </details>
                    </td>
                    <td>
                      <button className="icon-btn" title="Supprimer" onClick={() => confirm('Supprimer cette ligne du journal ?') && set((x) => ({ ...x, runs: x.runs.filter((y) => y.id !== r.id) }))}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
