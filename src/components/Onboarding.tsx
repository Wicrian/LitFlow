// Démarrage d'une nouvelle revue, en 3 écrans courts :
//   1. Jusqu'où voulez-vous aller ?  2. Vos articles dans Zotero  3. Ce qui vous attend.
// Ensuite, tout se passe dans la vraie interface (guide « Pour bien démarrer »).

import { useState } from 'react';
import { X } from 'lucide-react';
import type { ReviewMode } from '../types';
import { MODES } from '../lib/guide';
import { useProject } from '../store';
import { ImportView } from './ImportView';

type Step = 'mode' | 'zotero' | 'preview';

export function Onboarding({ onSettings, onFinish }: { onSettings: () => void; onFinish: (fullInterface: boolean) => void }) {
  const { project: p, update, settings } = useProject();
  const [step, setStep] = useState<Step>(p.mode ? 'zotero' : 'mode');
  const mode = p.mode ?? 'organise';
  const records = Object.keys(p.records).length;

  const choose = (m: ReviewMode) => {
    update((cur) => ({ ...cur, mode: m, reviewType: m === 'systematic' ? cur.reviewType : 'narrative' }));
    setStep('zotero');
  };

  return (
    <div className="overlay onboarding">
      <div className="onb-card stack">
        <div className="row">
          <div className="onb-dots">
            {(['mode', 'zotero', 'preview'] as Step[]).map((s) => (
              <span key={s} className={s === step ? 'on' : ''} />
            ))}
          </div>
          <span className="spacer" />
          <button className="btn small" onClick={() => onFinish(true)} title="Fermer le démarrage et afficher toutes les étapes">
            Interface complète <X size={14} />
          </button>
        </div>

        {step === 'mode' && (
          <>
            <h1 className="onb-title">Jusqu’où voulez-vous aller ?</h1>
            <p className="muted">Chaque niveau comprend le précédent. Vous pourrez changer à tout moment, sans rien perdre.</p>
            <div className="stack" style={{ gap: '0.6rem' }}>
              {MODES.map((m) => (
                <button key={m.id} className={`onb-level ${p.mode === m.id ? 'on' : ''}`} onClick={() => choose(m.id)}>
                  <span className="onb-emoji">{m.emoji}</span>
                  <span className="onb-text">
                    <strong>{m.title}</strong>
                    <span className="small muted">{m.hint}</span>
                  </span>
                  <span className="onb-chips">
                    {(['Ranger', 'Trier', 'PRISMA'] as const).map((c) => (
                      <span key={c} className={`onb-chip ${m.includes.includes(c) ? 'on' : ''}`}>
                        {m.includes.includes(c) ? '✓ ' : ''}
                        {c}
                      </span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'zotero' && (
          <>
            <h1 className="onb-title">Où sont vos articles ?</h1>
            {!settings.apiKey ? (
              <div className="stack">
                <p className="muted">LitFlow lit vos articles directement dans Zotero. Il faut d’abord le relier, une seule fois.</p>
                <div className="row">
                  <button className="btn primary" onClick={onSettings}>
                    Connecter mon Zotero
                  </button>
                  <span className="small muted">Une fenêtre vous guide pour créer votre clé (nom conseillé : « LitFlow »).</span>
                </div>
              </div>
            ) : (
              <ImportView compact onSettings={onSettings} onDone={() => setStep('preview')} />
            )}
            <div className="row">
              <button className="btn small" onClick={() => setStep('mode')}>
                ← Retour
              </button>
              <span className="spacer" />
              <button className={`btn ${records ? 'dark' : 'small'}`} onClick={() => setStep('preview')}>
                {records ? `Continuer avec ${records} article(s) →` : 'Plus tard →'}
              </button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <h1 className="onb-title">Voici ce qui vous attend</h1>
            <p className="muted">Trois gestes à connaître. Ce sont des exemples : vos vrais articles vous attendent juste après.</p>
            <div className="onb-demos">
              <Demo kind="dedup" title="Doublons" text="Choisissez la notice à garder : celle qui a vos notes est proposée." />
              {mode !== 'organise' && <Demo kind="swipe" title="Tri" text="Glissez la carte : → garder, ← écarter, ↑ incertain." />}
              <Demo kind="circle" title="Organisation" text="Glissez chaque article vers une bulle de votre plan." />
            </div>
            <div className="row">
              <button className="btn small" onClick={() => setStep('zotero')}>
                ← Retour
              </button>
              <span className="spacer" />
              <button className="btn dark" onClick={() => onFinish(false)}>
                C’est parti →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Petite animation qui montre un geste (marquée « Exemple »). */
function Demo({ kind, title, text }: { kind: 'swipe' | 'dedup' | 'circle'; title: string; text: string }) {
  return (
    <div className="onb-demo">
      <div className={`demo-stage demo-${kind}`} aria-hidden>
        <span className="demo-tag">Exemple</span>
        {kind === 'swipe' && (
          <>
            <div className="demo-card">
              <i />
              <i />
              <i className="short" />
            </div>
            <span className="demo-stamp">INCLURE</span>
          </>
        )}
        {kind === 'dedup' && (
          <>
            <div className="demo-mini keep">
              <i />
              <i className="short" />
              <b>📝 2</b>
            </div>
            <div className="demo-mini">
              <i />
              <i className="short" />
            </div>
          </>
        )}
        {kind === 'circle' && (
          <>
            <span className="demo-bubble b1" />
            <span className="demo-bubble b2" />
            <span className="demo-bubble b3" />
            <div className="demo-card small" />
          </>
        )}
      </div>
      <strong>{title}</strong>
      <span className="small muted">{text}</span>
    </div>
  );
}
