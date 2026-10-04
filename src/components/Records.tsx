import { useMemo, useState } from 'react';
import type { Decision, RecordItem, Stage } from '../types';
import { applyFilters, emptyFilters, sortRecords, type Filters, type SortKey } from '../lib/filters';
import { fulltextKeys } from '../lib/prisma';
import { authorsShort } from '../lib/text';
import { download, exportProjectJson, recordsCsv, safeFileName } from '../lib/export';
import { useProject } from '../store';
import { zoteroSelectLink } from '../zotero/api';
import { itemTypeLabel } from '../zotero/mapping';
import { FilterBar } from './FilterBar';
import { DECISION_UI, ReasonSheet } from './Review';
import { ClassifyPanel } from './ClassifyPanel';
import { categoryLabel, orderedCategories, toggleCategory, toggleMarker } from '../lib/organisation';

const PAGE = 100;

export function Records() {
  const { project: p, decide, markDirty, update } = useProject();
  const [bulkCat, setBulkCat] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sort, setSort] = useState<{ key: SortKey | ''; dir: 1 | -1 }>({ key: '', dir: 1 });
  const [page, setPage] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showDup, setShowDup] = useState(false);
  const [bulk, setBulk] = useState<{ stage: Stage; decision: Decision; reason: string }>({ stage: 'screening', decision: 'exclude', reason: '' });

  const all = useMemo(() => Object.values(p.records).filter((r) => showDup || !(r.key in p.duplicates)), [p.records, p.duplicates, showDup]);
  const rows = useMemo(() => sortRecords(p, applyFilters(p, all, filters), sort.key, sort.dir), [p, all, filters, sort]);
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);

  const th = (key: SortKey, label: string) => (
    <th onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : 1 })}>
      {label} {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
    </th>
  );

  const applyBulk = () => {
    const eligible = bulk.stage === 'fulltext' ? new Set(fulltextKeys(p)) : null;
    const keys = rows.filter((r) => !(r.key in p.duplicates) && (!eligible || eligible.has(r.key))).map((r) => r.key);
    const label = DECISION_UI[bulk.decision].label.toLowerCase();
    if (!keys.length || !confirm(`${label} ${keys.length} référence(s) ${bulk.reason ? `avec la raison « ${bulk.reason} »` : ''} ?`)) return;
    for (const k of keys) decide(bulk.stage, k, { decision: bulk.decision, reasons: bulk.reason ? [bulk.reason] : [], note: p[bulk.stage][k]?.note ?? '' });
    markDirty(keys);
  };

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row">
          <h2 style={{ margin: 0 }}>Références</h2>
          <span className="muted">{rows.length} affichée(s) sur {all.length}</span>
          <span className="spacer" />
          <label className="row small">
            <input type="checkbox" checked={showDup} onChange={(e) => setShowDup(e.target.checked)} /> Afficher les doublons
          </label>
          <button className="btn small" onClick={() => download(`${safeFileName(p.name)}.csv`, recordsCsv(p), 'text/csv;charset=utf-8')}>
            Exporter CSV (Excel)
          </button>
          <button className="btn small" onClick={() => exportProjectJson(p)}>
            Sauvegarder le projet (.json)
          </button>
        </div>
        <FilterBar records={all} filters={filters} onChange={(f) => (setFilters(f), setPage(0))} status={['screening', 'fulltext']} />
        <details>
          <summary className="small">Décision groupée sur les références filtrées</summary>
          <div className="row" style={{ marginTop: '0.5rem' }}>
            <select style={{ width: 'auto' }} value={bulk.stage} onChange={(e) => setBulk({ ...bulk, stage: e.target.value as Stage })}>
              <option value="screening">Tri titre-résumé</option>
              <option value="fulltext">Texte intégral</option>
            </select>
            <select style={{ width: 'auto' }} value={bulk.decision} onChange={(e) => setBulk({ ...bulk, decision: e.target.value as Decision })}>
              <option value="exclude">Exclure</option>
              <option value="include">Inclure</option>
              <option value="maybe">Incertain</option>
            </select>
            <input
              type="text"
              style={{ width: 260 }}
              list="bulk-reasons"
              placeholder="Raison (ex. Hors période)"
              value={bulk.reason}
              onChange={(e) => setBulk({ ...bulk, reason: e.target.value })}
            />
            <datalist id="bulk-reasons">
              {p.reasons[bulk.stage][bulk.decision].map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <button className="btn" onClick={applyBulk}>
              Appliquer aux {rows.length} références filtrées
            </button>
          </div>
          <p className="small muted">
            Utile par exemple pour exclure d’un coup les documents antérieurs à une date, dans une langue non retenue ou d’un
            type non pertinent. Chaque décision reste modifiable individuellement.
          </p>
        </details>
        {(p.organisation.categories.length > 0 || p.organisation.markers.length > 0) && (
          <details>
            <summary className="small">Classer d’un coup les références filtrées</summary>
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <select style={{ width: 'auto' }} value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
                <option value="">— Catégorie ou marqueur —</option>
                {orderedCategories(p.organisation).map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>
                    Catégorie : {categoryLabel(p.organisation, c)}
                  </option>
                ))}
                {p.organisation.markers.map((m) => (
                  <option key={m.id} value={`m:${m.id}`}>
                    Marqueur : {m.name}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                disabled={!bulkCat || !rows.length}
                onClick={() => {
                  const [kind, id] = bulkCat.split(':');
                  const keys = rows.map((r) => r.key);
                  if (!confirm(`Ajouter ${keys.length} référence(s) ${kind === 'c' ? 'à cette catégorie' : 'à ce marqueur'} ?`)) return;
                  update((cur) => {
                    let o = cur.organisation;
                    for (const k of keys) {
                      if (kind === 'c' && !(o.assignments[k] ?? []).includes(id)) o = toggleCategory(o, k, id);
                      if (kind === 'm' && !(o.markerAssignments[k] ?? []).includes(id)) o = toggleMarker(o, k, id);
                    }
                    return { ...cur, organisation: o };
                  });
                  markDirty(keys);
                }}
              >
                Appliquer aux {rows.length} références filtrées
              </button>
            </div>
          </details>
        )}
      </section>

      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              {th('title', 'Titre')}
              {th('author', 'Auteurs')}
              {th('year', 'Année')}
              <th>Type</th>
              {th('source', 'Source')}
              {th('pages', 'Pages')}
              <th>Tri</th>
              <th>Texte intégral</th>
              {(p.organisation.name || p.organisation.markers.length > 0) && <th>Classement</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="clickable" onClick={() => setOpenKey(r.key)}>
                <td>
                  {r.title}
                  {r.key in p.duplicates && <span className="badge"> doublon</span>}
                </td>
                <td className="small">{authorsShort(r.creators)}</td>
                <td>{r.year ?? ''}</td>
                <td className="small">{itemTypeLabel(r.itemType)}</td>
                <td className="small">{r.sources.join(', ')}</td>
                <td>{r.pageCount ?? ''}</td>
                <td>
                  <DecisionBadge d={p.screening[r.key]?.decision} />
                </td>
                <td>{r.key in p.notRetrieved ? <span className="badge">introuvable</span> : <DecisionBadge d={p.fulltext[r.key]?.decision} />}</td>
                {(p.organisation.name || p.organisation.markers.length > 0) && (
                  <td className="small">
                    {(p.organisation.assignments[r.key] ?? []).map((id) => p.organisation.categories.find((c) => c.id === id)?.name).filter(Boolean).join(', ')}{' '}
                    {(p.organisation.markerAssignments[r.key] ?? []).map((id) => {
                      const m = p.organisation.markers.find((x) => x.id === id);
                      return m ? <span key={id} className="marker-dot" style={{ background: m.color, marginLeft: 3 }} title={m.name} /> : null;
                    })}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > PAGE && (
          <div className="row" style={{ justifyContent: 'center', marginTop: '0.75rem' }}>
            <button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>
              ‹
            </button>
            <span className="small">
              Page {page + 1} / {Math.ceil(rows.length / PAGE)}
            </span>
            <button className="btn small" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>
              ›
            </button>
          </div>
        )}
      </section>

      {openKey && p.records[openKey] && <RecordDetail r={p.records[openKey]} onClose={() => setOpenKey(null)} />}
    </div>
  );
}

function DecisionBadge({ d }: { d?: Decision }) {
  if (!d) return <span className="muted small">—</span>;
  return <span className={`badge ${d}`}>{DECISION_UI[d].label}</span>;
}

function RecordDetail({ r, onClose }: { r: RecordItem; onClose: () => void }) {
  const { project: p, decide } = useProject();
  const [sheet, setSheet] = useState<{ stage: Stage; decision: Decision } | null>(null);
  const eligibleFt = fulltextKeys(p).includes(r.key);

  const stageBlock = (stage: Stage, label: string, enabled: boolean) => {
    const d = p[stage][r.key];
    return (
      <div className="stack">
        <strong>{label}</strong>
        {!enabled ? (
          <span className="small muted">Non concerné (référence non incluse au tri ou doublon).</span>
        ) : (
          <>
            <div className="row">
              {(['exclude', 'maybe', 'include'] as Decision[]).map((dec) => (
                <button
                  key={dec}
                  className={`btn small ${d?.decision === dec ? dec : ''}`}
                  onClick={() => {
                    decide(stage, r.key, { decision: dec, reasons: d?.decision === dec ? d.reasons : [], note: d?.note ?? '' });
                    setSheet({ stage, decision: dec });
                  }}
                >
                  {DECISION_UI[dec].icon} {DECISION_UI[dec].label}
                </button>
              ))}
              {d && (
                <button className="btn small" onClick={() => decide(stage, r.key, null)}>
                  Effacer
                </button>
              )}
            </div>
            {d && (
              <div className="small">
                {d.reasons.length > 0 && <div>Raisons : {d.reasons.join(' ; ')}</div>}
                {d.note && <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{d.note}</div>}
                <div className="muted">le {new Date(d.at).toLocaleString('fr-CA')}</div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h2>{r.title}</h2>
        <div className="muted">
          {authorsShort(r.creators, 10)} · {r.year ?? 's.d.'} · {itemTypeLabel(r.itemType)} {r.publication && <>· <em>{r.publication}</em></>}
        </div>
        <div className="row small">
          {p.library && <a href={zoteroSelectLink(p.library, r.key)}>Ouvrir dans Zotero</a>}
          {r.doi && <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">DOI : {r.doi}</a>}
          <span className="muted">Sources : {r.sources.join(', ')}</span>
        </div>
        <div style={{ whiteSpace: 'pre-wrap', maxHeight: '30vh', overflow: 'auto' }}>{r.abstract || <span className="muted">Pas de résumé.</span>}</div>
        <ClassifyPanel recordKey={r.key} always />
        {r.key in p.duplicates ? (
          <div className="notice">Doublon de : {p.records[p.duplicates[r.key]]?.title}</div>
        ) : (
          <div className="grid2">
            {stageBlock('screening', 'Tri titre-résumé', true)}
            {stageBlock('fulltext', 'Texte intégral', eligibleFt)}
          </div>
        )}
        <div className="row">
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
      {sheet && (
        <div onClick={(e) => e.stopPropagation()}>
          <ReasonSheet
            stage={sheet.stage}
            decisionKey={r.key}
            decision={sheet.decision}
            onClose={() => setSheet(null)}
            onChangeDecision={(dec) => {
              decide(sheet.stage, r.key, { decision: dec, reasons: [], note: p[sheet.stage][r.key]?.note ?? '' });
              setSheet({ ...sheet, decision: dec });
            }}
          />
        </div>
      )}
    </div>
  );
}
