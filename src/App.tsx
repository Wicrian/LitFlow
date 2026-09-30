import { useEffect, useMemo, useState } from 'react';
import type { Project, Settings } from './types';
import { deleteProject, listProjects, loadSettings, saveProject, saveSettings } from './lib/storage';
import { ProjectProvider, useProject } from './store';
import { Home } from './components/Home';
import { SettingsDialog } from './components/SettingsDialog';
import { Protocol } from './components/Protocol';
import { ImportView } from './components/ImportView';
import { Dedup } from './components/Dedup';
import { Review } from './components/Review';
import { Records } from './components/Records';
import { Prisma } from './components/Prisma';
import { fulltextKeys, screeningKeys } from './lib/prisma';
import { findDuplicateGroups } from './lib/dedup';

type View = 'protocol' | 'import' | 'dedup' | 'screening' | 'fulltext' | 'records' | 'prisma';

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const refresh = () => listProjects().then(setProjects);
  useEffect(() => void refresh(), []);

  const open = async (p: Project) => {
    await saveProject(p);
    setCurrent(p);
  };

  return (
    <>
      {current ? (
        <ProjectProvider key={current.id} initial={current} settings={settings}>
          <ProjectShell
            onHome={() => {
              setCurrent(null);
              void refresh();
            }}
            onSettings={() => setShowSettings(true)}
          />
        </ProjectProvider>
      ) : (
        <>
          <header className="topbar">
            <Brand onClick={() => undefined} />
            <span className="spacer" />
            <button className="btn" onClick={() => setShowSettings(true)}>
              ⚙️ Connexion Zotero
            </button>
          </header>
          <Home
            projects={projects}
            settings={settings}
            onOpen={open}
            onDelete={async (id) => {
              await deleteProject(id);
              void refresh();
            }}
            onSettings={() => setShowSettings(true)}
          />
        </>
      )}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(s) => {
            saveSettings(s);
            setSettings(s);
          }}
        />
      )}
    </>
  );
}

function Brand({ onClick }: { onClick: () => void }) {
  return (
    <span className="brand" onClick={onClick}>
      <img src="./favicon.svg" alt="" /> LitFlow
    </span>
  );
}

function ProjectShell({ onHome, onSettings }: { onHome: () => void; onSettings: () => void }) {
  const { project, syncStatus, syncNow, client, pullNow, pullInfo, clearPullInfo } = useProject();
  const hasRecords = Object.keys(project.records).length > 0;
  const [view, setView] = useState<View>(hasRecords ? 'screening' : project.library ? 'import' : 'protocol');

  const screen = screeningKeys(project);
  const ft = fulltextKeys(project);
  const dupOpen = useMemo(
    () =>
      findDuplicateGroups(Object.values(project.records).filter((r) => !(r.key in project.duplicates))).filter(
        (g) => !project.notDuplicateGroups.includes(g.id),
      ).length,
    [project.records, project.duplicates, project.notDuplicateGroups],
  );

  const tabs: [View, string, string?][] = [
    ['protocol', '1. Protocole'],
    ['import', '2. Identification'],
    ['dedup', '3. Doublons', dupOpen ? `${dupOpen} à vérifier` : undefined],
    ['screening', '4. Tri titre-résumé', `${screen.filter((k) => project.screening[k]).length}/${screen.length}`],
    ['fulltext', '5. Texte intégral', `${ft.filter((k) => project.fulltext[k] || k in project.notRetrieved).length}/${ft.length}`],
    ['records', 'Références', String(Object.keys(project.records).length)],
    ['prisma', 'PRISMA'],
  ];

  const dotClass = { off: 'off', idle: '', pending: 'pending', syncing: 'pending', error: 'error' }[syncStatus.state];
  const syncLabel =
    syncStatus.state === 'off'
      ? project.library
        ? 'Zotero non connecté'
        : 'Hors ligne (sans Zotero)'
      : syncStatus.state === 'syncing'
        ? `${syncStatus.message ?? ''} ${syncStatus.total ? `${syncStatus.done}/${syncStatus.total}` : ''}`
        : syncStatus.state === 'error'
          ? 'Erreur de synchronisation'
          : syncStatus.state === 'pending'
            ? syncStatus.message
            : 'Synchronisé avec Zotero';

  return (
    <>
      <header className="topbar">
        <Brand onClick={onHome} />
        <strong className="hide-mobile" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</strong>
        <span className="spacer" />
        <span className="row small muted" title={syncStatus.message}>
          <span className={`sync-dot ${dotClass}`} /> <span className="hide-mobile">{syncLabel}</span>
        </span>
        {client && (
          <button
            className="btn small"
            title="Envoyer les décisions vers Zotero et lire les changements faits dans Zotero"
            onClick={async () => {
              await syncNow();
              await pullNow();
            }}
          >
            ⟳ <span className="hide-mobile">Synchroniser</span>
          </button>
        )}
        <button className="btn small" onClick={onSettings} title="Connexion Zotero">
          ⚙️
        </button>
      </header>
      <nav className="tabs">
        {tabs.map(([id, label, count]) => (
          <button key={id} className={`tab ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
            {label}
            {count && <span className="count">{count}</span>}
          </button>
        ))}
      </nav>
      <main>
        {pullInfo && (
          <div className="notice row" style={{ marginBottom: '1rem' }}>
            Reçu de Zotero : {pullInfo.changed > 0 && `${pullInfo.changed} décision(s) modifiée(s) dans Zotero`}
            {pullInfo.changed > 0 && pullInfo.added > 0 && ' · '}
            {pullInfo.added > 0 && `${pullInfo.added} nouvelle(s) référence(s)`}
            <span className="spacer" />
            <button className="btn small" onClick={clearPullInfo}>
              OK
            </button>
          </div>
        )}
        {syncStatus.state === 'error' && <div className="notice error" style={{ marginBottom: '1rem' }}>{syncStatus.message}</div>}
        {view === 'protocol' && <Protocol />}
        {view === 'import' && <ImportView onSettings={onSettings} onDone={() => setView('dedup')} />}
        {view === 'dedup' && <Dedup onDone={() => setView('screening')} />}
        {view === 'screening' && <Review stage="screening" />}
        {view === 'fulltext' && <Review stage="fulltext" />}
        {view === 'records' && <Records />}
        {view === 'prisma' && <Prisma />}
      </main>
    </>
  );
}
