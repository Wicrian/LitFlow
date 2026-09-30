import { useMemo, useState } from 'react';
import { runAiDuplicates } from '../ai/run';
import { AiProgressText, useAiProgress } from './AiProgress';
import type { RecordItem } from '../types';
import { findDuplicateGroups, type DuplicateGroup } from '../lib/dedup';
import { authorsShort } from '../lib/text';
import { useProject } from '../store';
import { itemTypeLabel } from '../zotero/mapping';

const REASON: Record<DuplicateGroup['reason'], string> = {
  doi: 'Même DOI',
  title: 'Même titre',
  similar: 'Titres très proches (même année, même auteur)',
  ai: 'IA : titres de même sens (traduction, prépublication…)',
};

export function Dedup({ onDone }: { onDone: () => void }) {
  const { project: p, update, markDirty } = useProject();
  const [keepChoice, setKeepChoice] = useState<Record<string, string>>({});
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [aiGroups, setAiGroups] = useState<(DuplicateGroup & { score: number })[] | null>(null);
  const ai = useAiProgress();

  const groups = useMemo(
    () =>
      findDuplicateGroups(Object.values(p.records).filter((r) => !(r.key in p.duplicates))).filter(
        (g) => !p.notDuplicateGroups.includes(g.id),
      ),
    [p.records, p.duplicates, p.notDuplicateGroups],
  );

  const confirm = (gs: DuplicateGroup[]) => {
    const dups: Record<string, string> = {};
    for (const g of gs) {
      const keep = keepChoice[g.id] ?? g.suggestedKeep;
      for (const k of g.keys) if (k !== keep) dups[k] = keep;
    }
    update((cur) => ({ ...cur, duplicates: { ...cur.duplicates, ...dups } }));
    markDirty(Object.keys(dups));
  };

  const dismiss = (g: DuplicateGroup) => update((cur) => ({ ...cur, notDuplicateGroups: [...cur.notDuplicateGroups, g.id] }));

  const restore = (key: string) => {
    update((cur) => {
      const duplicates = { ...cur.duplicates };
      delete duplicates[key];
      return { ...cur, duplicates };
    });
    markDirty([key]);
  };

  const doiGroups = groups.filter((g) => g.reason === 'doi');
  const ruleIds = new Set(groups.map((g) => g.id));
  const visibleAi = (aiGroups ?? []).filter(
    (g) => !ruleIds.has(g.id) && !p.notDuplicateGroups.includes(g.id) && g.keys.filter((k) => !(k in p.duplicates)).length > 1,
  );
  const allGroups: (DuplicateGroup & { score?: number })[] = [...groups, ...visibleAi];
  const confirmed = Object.entries(p.duplicates);

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row">
          <h2 style={{ margin: 0 }}>Doublons</h2>
          <span className="spacer" />
          {doiGroups.length > 0 && (
            <button className="btn" onClick={() => confirm(doiGroups)}>
              Confirmer les {doiGroups.length} groupes « même DOI »
            </button>
          )}
          {groups.length > 0 && (
            <button className="btn" onClick={() => confirm(groups)}>
              Tout confirmer ({groups.length})
            </button>
          )}
        </div>
        <p className="small muted">
          La comparaison ignore accents, majuscules et ponctuation, mais les notices ne sont jamais modifiées. Cliquez sur la
          notice à <strong>conserver</strong> (encadrée en vert, la plus complète est proposée). Les autres sont placées dans
          la collection Zotero « 0 – Doublons » avec l’étiquette « {p.sync.tagPrefix}:doublon » ; vous pourrez ensuite, si
          vous le souhaitez, les fusionner avec l’outil de doublons de Zotero.
        </p>
        {groups.length === 0 && (
          <div className="notice">
            Aucun doublon potentiel à vérifier. {confirmed.length} doublon(s) confirmé(s).{' '}
            <button className="btn small" onClick={onDone}>
              Commencer le tri →
            </button>
          </div>
        )}
      </section>

      {p.ai.enabled && (
        <section className="panel stack">
          <div className="row">
            <strong>🤖 Doublons « de sens » avec l’IA locale</strong>
            <span className="spacer" />
            <label className="row small">
              Seuil
              <input
                type="range"
                min={0.8}
                max={0.99}
                step={0.01}
                value={p.ai.dupThreshold}
                onChange={(e) => update((cur) => ({ ...cur, ai: { ...cur.ai, dupThreshold: +e.target.value } }))}
              />
              {p.ai.dupThreshold.toFixed(2)}
            </label>
            <button
              className="btn"
              disabled={ai.running}
              onClick={() => ai.run(async (onProgress) => setAiGroups(await runAiDuplicates(p, onProgress)))}
            >
              {aiGroups ? 'Relancer' : 'Chercher'}
            </button>
          </div>
          <p className="small muted">
            L’IA compare le sens des titres (même traduits en anglais, ou avec une formulation différente). Elle ne fait que
            proposer : vérifiez chaque groupe. Seuil plus bas = plus de propositions, mais plus d’erreurs.
          </p>
          <AiProgressText state={ai} />
          {aiGroups && <div className="small">{visibleAi.length} groupe(s) proposé(s) par l’IA en plus des règles classiques.</div>}
        </section>
      )}

      {allGroups.map((g) => {
        const keep = keepChoice[g.id] ?? g.suggestedKeep;
        return (
          <section key={g.id} className="panel stack">
            <div className="row">
              <span className="badge">{REASON[g.reason]}</span>
              {g.score !== undefined && <span className="small muted">similarité {g.score.toFixed(2)}</span>}
              <span className="spacer" />
              <button className="btn small" onClick={() => dismiss(g)}>
                Ce ne sont pas des doublons
              </button>
              <button className="btn small primary" onClick={() => confirm([g])}>
                Confirmer
              </button>
            </div>
            <div className="dup-group">
              {g.keys.filter((k) => !(k in p.duplicates)).map((k) => (
                <DupItem key={k} r={p.records[k]} keep={k === keep} onClick={() => setKeepChoice({ ...keepChoice, [g.id]: k })} />
              ))}
            </div>
          </section>
        );
      })}

      {confirmed.length > 0 && (
        <section className="panel stack">
          <button className="btn small" onClick={() => setShowConfirmed(!showConfirmed)}>
            {showConfirmed ? '▾' : '▸'} Doublons confirmés ({confirmed.length})
          </button>
          {showConfirmed && (
            <table>
              <tbody>
                {confirmed.map(([dup, keep]) => (
                  <tr key={dup}>
                    <td>
                      {p.records[dup]?.title}
                      <div className="small muted">{p.records[dup]?.sources.join(', ')}</div>
                    </td>
                    <td className="small muted">
                      doublon de : {p.records[keep]?.title} ({p.records[keep]?.sources.join(', ')})
                    </td>
                    <td>
                      <button className="btn small" onClick={() => restore(dup)}>
                        Annuler
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

function DupItem({ r, keep, onClick }: { r: RecordItem; keep: boolean; onClick: () => void }) {
  return (
    <div className={`dup-item ${keep ? 'keep' : ''}`} onClick={onClick}>
      <div className="row small">
        <span className={`badge ${keep ? 'include' : ''}`}>{keep ? 'À conserver' : 'Doublon'}</span>
        <span className="muted">{r.sources.join(', ')}</span>
      </div>
      <div className="title">{r.title}</div>
      <div className="muted">
        {authorsShort(r.creators)} · {r.year ?? 's.d.'} · {itemTypeLabel(r.itemType)}
      </div>
      <div className="muted">{r.publication}</div>
      {r.doi && <div className="small">DOI : {r.doi}</div>}
      <div className="small muted">
        {r.abstract ? `Résumé : ${r.abstract.length} caractères` : 'Pas de résumé'} · clé {r.key}
      </div>
    </div>
  );
}
