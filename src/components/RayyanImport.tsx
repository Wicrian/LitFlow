import { useMemo, useState } from 'react';
import type { Decision } from '../types';
import { matchRayyan, parseRayyan, planRayyanImport, reviewersOf, type RayyanRecord } from '../lib/rayyan';
import { useProject } from '../store';

const LABEL: Record<Decision, string> = { include: 'incluses', exclude: 'exclues', maybe: 'incertaines' };

/** Reprendre les décisions d'une revue faite dans Rayyan. */
export function RayyanImport() {
  const { project: p, update, markDirty } = useProject();
  const [rayyan, setRayyan] = useState<RayyanRecord[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [acceptClose, setAcceptClose] = useState(true);
  const [done, setDone] = useState('');

  const records = useMemo(() => Object.values(p.records), [p.records]);
  const matches = useMemo(() => (rayyan ? matchRayyan(rayyan, records) : []), [rayyan, records]);
  const reviewers = useMemo(() => (rayyan ? reviewersOf(rayyan) : []), [rayyan]);
  const who = reviewer || reviewers[0] || '';
  const plan = useMemo(() => planRayyanImport(p, matches, who, { overwrite, acceptClose }), [p, matches, who, overwrite, acceptClose]);

  const count = (k: string | null) => matches.filter((m) => m.kind === k).length;
  const byDecision: Record<Decision, number> = { include: 0, exclude: 0, maybe: 0 };
  Object.values(plan.decisions).forEach((d) => byDecision[d.decision]++);
  const close = matches.filter((m) => m.kind === 'close');
  const missing = matches.filter((m) => !m.kind);
  const toApply = Object.keys(plan.decisions).length;

  const apply = () => {
    const at = new Date().toISOString();
    const keys = [...Object.keys(plan.decisions), ...Object.keys(plan.duplicates)];
    update((cur) => {
      const screening = { ...cur.screening };
      const rayyanLabels = { ...cur.rayyanLabels };
      const reasons = new Set(cur.reasons.screening.exclude);
      for (const [k, d] of Object.entries(plan.decisions)) {
        screening[k] = { decision: d.decision, reasons: d.reasons, note: cur.screening[k]?.note ?? '', at };
        if (d.labels.length) rayyanLabels[k] = d.labels;
        d.reasons.forEach((r) => reasons.add(r));
      }
      return {
        ...cur,
        screening,
        rayyanLabels,
        duplicates: { ...cur.duplicates, ...plan.duplicates },
        reasons: { ...cur.reasons, screening: { ...cur.reasons.screening, exclude: [...reasons] } },
      };
    });
    markDirty(keys);
    setDone(
      `${toApply} décision(s) importée(s)` +
        (Object.keys(plan.duplicates).length ? ` et ${Object.keys(plan.duplicates).length} doublon(s) marqué(s)` : '') +
        '. Elles partent maintenant vers Zotero (étiquettes LF: et collections).',
    );
    setRayyan(null);
  };

  return (
    <section className="panel stack">
      <h2>Reprendre un tri fait dans Rayyan</h2>
      <p className="small muted">
        Dans Rayyan : <strong>Export</strong> › toutes les références › format <strong>CSV</strong>, puis choisissez ici le
        fichier <code>articles.csv</code> (dans le .zip téléchargé). Seules vos <strong>décisions</strong> (et raisons
        d’exclusion, labels) sont reprises : chaque ligne est rapprochée de la référence Zotero correspondante, dont le
        titre et les accents d’origine sont conservés.
      </p>
      <div className="row">
        <label className="btn">
          Choisir le fichier articles.csv
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setError('');
              setDone('');
              try {
                setRayyan(parseRayyan(await f.text()));
                setFileName(f.name);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </label>
        {rayyan && <span className="small muted">{fileName} : {rayyan.length} référence(s) Rayyan</span>}
      </div>
      {error && <div className="notice error">{error}</div>}
      {done && <div className="notice">{done}</div>}

      {rayyan && (
        <>
          <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="tile t1">
              <div className="tile-label">Retrouvées par DOI</div>
              <div className="tile-value">{count('doi')}</div>
            </div>
            <div className="tile t4">
              <div className="tile-label">Retrouvées par titre</div>
              <div className="tile-value">{count('title')}</div>
            </div>
            <div className="tile t3">
              <div className="tile-label">Titre proche (à vérifier)</div>
              <div className="tile-value">{close.length}</div>
            </div>
            <div className="tile t2">
              <div className="tile-label">Introuvables dans Zotero</div>
              <div className="tile-value">{missing.length}</div>
            </div>
          </div>

          {reviewers.length > 1 && (
            <label className="field" style={{ maxWidth: 360 }}>
              <span>Décisions de quelle personne ?</span>
              <select value={who} onChange={(e) => setReviewer(e.target.value)}>
                {reviewers.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          )}

          {close.length > 0 && (
            <details>
              <summary className="small">
                <strong>Voir les {close.length} rapprochements par titre proche</strong> (souvent des chapitres : Rayyan ajoute le
                titre du livre)
              </summary>
              <table style={{ marginTop: '0.5rem' }}>
                <thead>
                  <tr>
                    <th>Dans Rayyan</th>
                    <th>Dans Zotero</th>
                  </tr>
                </thead>
                <tbody>
                  {close.map((m) => (
                    <tr key={m.rayyan.rayyanKey}>
                      <td className="small">{m.rayyan.title}</td>
                      <td className="small">{p.records[m.keys[0]]?.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {missing.length > 0 && (
            <details>
              <summary className="small">
                <strong>Voir les {missing.length} références introuvables</strong> (elles ne seront pas importées)
              </summary>
              <ul className="small">
                {missing.map((m) => (
                  <li key={m.rayyan.rayyanKey}>
                    {m.rayyan.title} {m.rayyan.year ? `(${m.rayyan.year})` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <label className="row small">
            <input type="checkbox" checked={acceptClose} onChange={(e) => setAcceptClose(e.target.checked)} />
            Importer aussi les rapprochements par titre proche
          </label>
          <label className="row small">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            Remplacer les décisions déjà prises dans LitFlow
            {plan.skippedExisting > 0 && !overwrite && <span className="muted"> ({plan.skippedExisting} gardée(s) telles quelles)</span>}
          </label>

          <div className="notice small">
            À importer : <strong>{toApply}</strong> décision(s) de tri titre-résumé — {byDecision.include} {LABEL.include},{' '}
            {byDecision.exclude} {LABEL.exclude}, {byDecision.maybe} {LABEL.maybe}.
            {Object.keys(plan.duplicates).length > 0 && (
              <>
                {' '}
                Rayyan avait fusionné des doublons : <strong>{Object.keys(plan.duplicates).length}</strong> référence(s) Zotero en
                double seront marquées « doublon ».
              </>
            )}
          </div>
          <div className="row">
            <button className="btn primary" disabled={!toApply} onClick={apply}>
              Importer les décisions
            </button>
            <button className="btn" onClick={() => setRayyan(null)}>
              Annuler
            </button>
          </div>
        </>
      )}
    </section>
  );
}
