import { useState } from 'react';
import { applyTheme, loadTheme, THEMES, type ThemeId } from '../lib/theme';

/** Choix de l'ambiance de couleurs. */
export function ThemePicker({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState<ThemeId>(loadTheme);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h2>Ambiance de couleurs</h2>
        <p className="small muted">Le style change seulement l’apparence : vos revues et vos décisions ne sont pas touchées.</p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-card ${current === t.id ? 'on' : ''}`}
              onClick={() => {
                applyTheme(t.id);
                setCurrent(t.id);
              }}
            >
              <span className="theme-swatch">
                {t.swatch.map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </span>
              <strong>{t.name}</strong>
              <span className="small muted">{t.hint}</span>
            </button>
          ))}
        </div>
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
