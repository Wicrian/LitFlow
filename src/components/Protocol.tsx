import { useState } from 'react';
import type { Decision, FrameworkId, ReviewType, Stage } from '../types';
import { FRAMEWORKS, REVIEW_TYPES, frameworkElements } from '../lib/frameworks';
import { useProject } from '../store';

const DECISIONS: [Decision, string][] = [
  ['include', 'Inclure'],
  ['exclude', 'Exclure'],
  ['maybe', 'Incertain'],
];

export function Protocol() {
  const { project: p, update } = useProject();
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => update((x) => ({ ...x, [k]: v }));

  return (
    <div className="stack">
      <section className="panel stack">
        <h2>Protocole de la revue</h2>
        <div className="grid2">
          <label className="field">
            <span>Nom du projet</span>
            <input type="text" value={p.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="field">
            <span>Type de revue</span>
            <select value={p.reviewType} onChange={(e) => set('reviewType', e.target.value as ReviewType)}>
              {Object.entries(REVIEW_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Question de recherche</span>
          <textarea value={p.question} onChange={(e) => set('question', e.target.value)} />
        </label>
      </section>

      <section className="panel stack">
        <div className="row">
          <h2 style={{ margin: 0 }}>Cadre de la question</h2>
          <select
            style={{ width: 'auto' }}
            value={p.framework.id}
            onChange={(e) => {
              const id = e.target.value as FrameworkId;
              const filled = p.framework.elements.some((el) => el.description || el.keywords);
              if (filled && !confirm('Changer de cadre efface les éléments saisis. Continuer ?')) return;
              set('framework', { id, elements: frameworkElements(id) });
            }}
          >
            {Object.entries(FRAMEWORKS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </select>
          <span className="small muted">{FRAMEWORKS[p.framework.id].hint}</span>
        </div>
        <p className="small muted">
          Les mots-clés de chaque élément sont surlignés en vert pendant le tri. Séparez-les par des virgules ; « * » permet la
          troncature (ex. « infirmi* »). Les accents et majuscules sont ignorés.
        </p>
        {p.framework.elements.map((el, i) => {
          const change = (patch: Partial<typeof el>) =>
            set('framework', { ...p.framework, elements: p.framework.elements.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="grid2" style={{ alignItems: 'end' }}>
              <label className="field">
                <span>
                  <strong>{el.letter}</strong> – {p.framework.id === 'CUSTOM' ? (
                    <input type="text" style={{ width: '60%' }} value={el.label} onChange={(e) => change({ label: e.target.value })} />
                  ) : (
                    el.label
                  )}
                </span>
                <input type="text" value={el.description} placeholder={FRAMEWORKS[p.framework.id].elements[i]?.[2] ?? ''} onChange={(e) => change({ description: e.target.value })} />
              </label>
              <label className="field">
                <span>Mots-clés à surligner</span>
                <input type="text" value={el.keywords} onChange={(e) => change({ keywords: e.target.value })} />
              </label>
            </div>
          );
        })}
        {p.framework.id === 'CUSTOM' && (
          <button
            className="btn small"
            onClick={() =>
              set('framework', {
                ...p.framework,
                elements: [...p.framework.elements, { letter: String.fromCharCode(65 + p.framework.elements.length), label: 'Élément', description: '', keywords: '' }],
              })
            }
          >
            + Ajouter un élément
          </button>
        )}
      </section>

      <section className="panel stack">
        <h2>Critères d’inclusion et d’exclusion</h2>
        <div className="grid2">
          <ListEditor label="Critères d’inclusion" items={p.inclusionCriteria} onChange={(v) => set('inclusionCriteria', v)} />
          <ListEditor label="Critères d’exclusion" items={p.exclusionCriteria} onChange={(v) => set('exclusionCriteria', v)} />
        </div>
        <div className="grid2">
          <label className="field">
            <span>Autres mots à surligner en vert (inclusion)</span>
            <input type="text" value={p.highlightInclude} onChange={(e) => set('highlightInclude', e.target.value)} />
          </label>
          <label className="field">
            <span>Mots à surligner en rouge (exclusion)</span>
            <input type="text" value={p.highlightExclude} placeholder="ex. animal*, rat, souris, éditorial" onChange={(e) => set('highlightExclude', e.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel stack">
        <h2>Raisons mémorisées</h2>
        <p className="small muted">
          Ces raisons s’affichent comme boutons après chaque décision (touches 1 à 9). Vous pouvez aussi en créer de nouvelles
          pendant le tri : elles sont ajoutées ici automatiquement.
        </p>
        {(['screening', 'fulltext'] as Stage[]).map((stage) => (
          <div key={stage} className="stack">
            <h3>{stage === 'screening' ? 'Tri titre-résumé' : 'Texte intégral'}</h3>
            <div className="grid2">
              {DECISIONS.map(([d, label]) => (
                <ListEditor
                  key={d}
                  label={label}
                  items={p.reasons[stage][d]}
                  onChange={(v) => set('reasons', { ...p.reasons, [stage]: { ...p.reasons[stage], [d]: v } })}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="row">
          <span className="small">Demander une raison après :</span>
          {DECISIONS.map(([d, label]) => (
            <label key={d} className="row small">
              <input type="checkbox" checked={p.askReason[d]} onChange={(e) => set('askReason', { ...p.askReason, [d]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <h2>🤖 Assistant IA local (facultatif)</h2>
        <p className="small muted">
          Un petit modèle d’IA multilingue (environ 120 Mo, téléchargé une seule fois) tourne <strong>dans votre
          navigateur</strong> : vos références ne sont envoyées à aucun service. Il peut repérer des doublons que les règles
          classiques manquent (titre traduit, prépublication…) et proposer une décision de tri avec une raison, à partir de
          vos critères ci-dessus puis de vos propres décisions. Il joue le rôle d’un deuxième avis, sans jamais décider à
          votre place.
        </p>
        <label className="row">
          <input type="checkbox" checked={p.ai.enabled} onChange={(e) => set('ai', { ...p.ai, enabled: e.target.checked })} />
          Activer l’assistant IA
        </label>
        {p.ai.enabled && (
          <>
            <label className="field" style={{ maxWidth: 520 }}>
              <span>Afficher la suggestion de l’IA pendant le tri</span>
              <select value={p.ai.show} onChange={(e) => set('ai', { ...p.ai, show: e.target.value as typeof p.ai.show })}>
                <option value="before">Avant ma décision (l’IA comme pré-tri)</option>
                <option value="after">Après ma décision seulement (évite d’être influencé·e : plus rigoureux)</option>
                <option value="never">Jamais (seulement la mesure d’accord)</option>
              </select>
            </label>
            <label className="row">
              <input type="checkbox" checked={p.ai.learn} onChange={(e) => set('ai', { ...p.ai, learn: e.target.checked })} />
              L’IA apprend de mes décisions déjà prises (recommandé)
            </label>
            {Object.keys(p.ai.suggestions).length > 0 && (
              <div>
                <button
                  className="btn small danger"
                  onClick={() => confirm('Effacer toutes les suggestions de l’IA ?') && set('ai', { ...p.ai, suggestions: {}, lastRun: null })}
                >
                  Effacer les suggestions ({Object.keys(p.ai.suggestions).length})
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel stack">
        <h2>Synchronisation avec Zotero</h2>
        <label className="row">
          <input type="checkbox" checked={p.sync.auto} onChange={(e) => set('sync', { ...p.sync, auto: e.target.checked })} />
          Envoyer automatiquement chaque décision vers Zotero (quelques secondes après)
        </label>
        <label className="row">
          <input type="checkbox" checked={p.sync.writeNotes} onChange={(e) => set('sync', { ...p.sync, writeNotes: e.target.checked })} />
          Créer une note « LitFlow » dans Zotero avec les raisons et vos notes de lecture
        </label>
        <label className="field" style={{ maxWidth: 360 }}>
          <span>Préfixe des étiquettes Zotero (ex. « LF » → « LF:tri:exclu »)</span>
          <input type="text" value={p.sync.tagPrefix} onChange={(e) => set('sync', { ...p.sync, tagPrefix: e.target.value.replace(/:/g, '') })} />
        </label>
        <div className="notice small">
          <strong>Dans les deux sens :</strong> vous pouvez aussi décider directement dans Zotero, par exemple pendant la
          lecture du texte intégral. Ajoutez l’étiquette <code>{p.sync.tagPrefix || 'LF'}:texte:exclu</code> (ou{' '}
          <code>:inclus</code>, <code>:incertain</code>, <code>:introuvable</code>) et, si vous voulez, une raison{' '}
          <code>{p.sync.tagPrefix || 'LF'}:texte:raison:Mauvaise population</code>. Glisser l’item dans une collection
          « LitFlow – … » fonctionne aussi. LitFlow relit Zotero toutes les 45 secondes (et à chaque clic sur ⟳) ; au tri
          titre-résumé, utilisez <code>{p.sync.tagPrefix || 'LF'}:tri:…</code>.
        </div>
        <p className="small muted">
          Si vous menez plusieurs revues dans la même bibliothèque, donnez un préfixe différent à chacune. Changer le préfixe
          après avoir synchronisé laisse les anciennes étiquettes dans Zotero.
        </p>
      </section>
    </div>
  );
}

export function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft('');
  };
  return (
    <div>
      <div className="small muted" style={{ marginBottom: '0.3rem' }}>
        {label}
      </div>
      <div className="chips" style={{ marginBottom: '0.4rem' }}>
        {items.map((it, i) => (
          <span key={it} className="chip" title="Cliquer pour retirer" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            {it} ✕
          </span>
        ))}
      </div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input type="text" value={draft} placeholder="Ajouter…" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn small" onClick={add} disabled={!draft.trim()}>
          +
        </button>
      </div>
    </div>
  );
}
