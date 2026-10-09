import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ClipboardList, Copy, FileText, GitFork, Home as HomeIcon, Layers, LayoutGrid, Library, Palette, RefreshCw, Search, Settings as SettingsIcon, Sparkles, Table2 } from 'lucide-react';
import type { Project, Settings } from './types';
import { deleteProject, listProjects, loadSettings, saveProject, saveSettings } from './lib/storage';
import { ProjectProvider, useProject } from './store';
import { Home } from './components/Home';
import { SettingsDialog } from './components/SettingsDialog';
import { ThemePicker } from './components/ThemePicker';
import { Protocol } from './components/Protocol';
import { ImportView } from './components/ImportView';
import { Dedup } from './components/Dedup';
import { Review } from './components/Review';
import { Records } from './components/Records';
import { Prisma } from './components/Prisma';
import { Organisation } from './components/Organisation';
import { SearchStrategy } from './components/SearchStrategy';
import { fulltextKeys, screeningKeys } from './lib/prisma';
import { findDuplicateGroups } from './lib/dedup';
import { IS_TEST } from './lib/env';

type View = 'protocol' | 'search' | 'import' | 'dedup' | 'screening' | 'fulltext' | 'organisation' | 'records' | 'prisma';

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTheme, setShowTheme] = useState(false);

  const refresh = () => listProjects().then(setProjects);
  useEffect(() => void refresh(), []);

  const open = async (p: Project) => {
    await saveProject(p);
    setCurrent(p);
  };

  return (
    <>
      {IS_TEST && (
        <div className="test-banner">
          🧪 VERSION TEST : vos revues ici sont séparées de LitFlow officiel. Utilisez la démo ou une bibliothèque Zotero de test.
        </div>
      )}
      {current ? (
        <ProjectProvider key={current.id} initial={current} settings={settings}>
          <ProjectShell
            onHome={() => {
              setCurrent(null);
              void refresh();
            }}
            onSettings={() => setShowSettings(true)}
            onTheme={() => setShowTheme(true)}
          />
        </ProjectProvider>
      ) : (
        <Frame
          rail={
            <>
              <RailItem icon={<HomeIcon />} label="Accueil" active onClick={() => undefined} />
              <span className="spacer" />
              <RailItem icon={<Palette />} label="Style" onClick={() => setShowTheme(true)} />
              <RailItem icon={<SettingsIcon />} label="Zotero" onClick={() => setShowSettings(true)} />
            </>
          }
        >
          <Home
            projects={projects}
            settings={settings}
            onOpen={open}
            onDelete={async (id) => {
              await deleteProject(id);
              void refresh();
            }}
            onSettings={() => setShowSettings(true)}
            onTheme={() => setShowTheme(true)}
          />
        </Frame>
      )}
      {showTheme && <ThemePicker onClose={() => setShowTheme(false)} />}
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

/** Cadre commun : grand panneau arrondi avec une barre d'icônes à gauche. */
function Frame({ rail, children, onLogo }: { rail: ReactNode; children: ReactNode; onLogo?: () => void }) {
  return (
    <div className="app">
      <div className="frame">
        <aside className="rail">
          <button className="logo" onClick={onLogo} title="LitFlow – accueil">
            <Sparkles />
          </button>
          {rail}
        </aside>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

function RailItem({ icon, label, count, active, onClick, alert, badge }: { icon: ReactNode; label: string; count?: string; active?: boolean; alert?: boolean; badge?: string; onClick: () => void }) {
  return (
    <button className={`rail-item ${active ? 'active' : ''}`} onClick={onClick} title={label}>
      <span className="rail-icon">
        {icon}
        {alert && <span className="rail-alert" />}
      </span>
      <span className="rail-label">
        {label}
        {badge && <span className="rail-badge">{badge}</span>}
      </span>
      {count && <span className="rail-count">{count}</span>}
    </button>
  );
}

const VIEWS: Record<View, { label: string; title: string; subtitle: string; icon: ReactNode; badge?: string }> = {
  protocol: { label: 'Protocole', title: 'Protocole', subtitle: 'Question, cadre, critères et raisons de votre revue', icon: <ClipboardList /> },
  search: { label: 'Recherche', title: 'Stratégie de recherche', subtitle: 'Concepts, mots-clés et équation adaptée à chaque base de données', icon: <Search />, badge: 'test' },
  import: { label: 'Identification', title: 'Identification', subtitle: 'Vos références lues directement dans Zotero', icon: <Library /> },
  dedup: { label: 'Doublons', title: 'Doublons', subtitle: 'Repérer et écarter les notices en double', icon: <Copy /> },
  screening: { label: 'Tri', title: 'Tri titre-résumé', subtitle: 'Glissez : à droite inclure, à gauche exclure, en haut incertain', icon: <Layers /> },
  fulltext: { label: 'Texte intégral', title: 'Texte intégral', subtitle: 'Lisez dans Zotero, décidez ici ou par étiquettes', icon: <FileText /> },
  organisation: { label: 'Organisation', title: 'Organisation', subtitle: 'Votre propre classement — seul ou combiné à la revue systématique', icon: <LayoutGrid /> },
  records: { label: 'Références', title: 'Références', subtitle: 'Toutes vos références, filtrables et exportables', icon: <Table2 /> },
  prisma: { label: 'PRISMA', title: 'Diagramme PRISMA 2020', subtitle: 'Calculé automatiquement à partir de vos décisions', icon: <GitFork /> },
};

/** Les étapes regroupées en grandes familles, comme sur la page d'accueil. */
const GROUPS: { label: string; views: View[] }[] = [
  { label: 'Préparer', views: ['protocol', 'search'] },
  { label: 'Trier', views: ['import', 'dedup', 'screening', 'fulltext'] },
  { label: 'Organiser', views: ['organisation'] },
  { label: 'Résultats', views: ['records', 'prisma'] },
];

function ProjectShell({ onHome, onSettings, onTheme }: { onHome: () => void; onSettings: () => void; onTheme: () => void }) {
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

  const counts: Partial<Record<View, string>> = {
    dedup: dupOpen ? String(dupOpen) : undefined,
    screening: `${screen.filter((k) => project.screening[k]).length}/${screen.length}`,
    fulltext: `${ft.filter((k) => project.fulltext[k] || k in project.notRetrieved).length}/${ft.length}`,
    records: String(Object.keys(project.records).length),
    organisation: project.organisation.name ? String(Object.keys(project.organisation.assignments).length) : undefined,
    search: project.search.databases.length ? String(project.search.databases.length) : undefined,
  };

  const dotClass = { off: 'off', idle: '', pending: 'pending', syncing: 'pending', error: 'error' }[syncStatus.state];
  const syncLabel =
    syncStatus.state === 'off'
      ? project.library
        ? 'Zotero non connecté'
        : 'Sans Zotero'
      : syncStatus.state === 'syncing'
        ? `${syncStatus.message ?? ''} ${syncStatus.total ? `${syncStatus.done}/${syncStatus.total}` : ''}`
        : syncStatus.state === 'error'
          ? 'Erreur de synchronisation'
          : syncStatus.state === 'pending'
            ? syncStatus.message
            : 'Synchronisé avec Zotero';

  const v = VIEWS[view];
  return (
    <Frame
      onLogo={onHome}
      rail={
        <>
          <nav className="rail-nav">
            {GROUPS.map((g) => (
              <div key={g.label} className="rail-group">
                <div className="rail-group-label">{g.label}</div>
                {g.views.map((id) => (
                  <RailItem
                    key={id}
                    icon={VIEWS[id].icon}
                    label={VIEWS[id].label}
                    badge={VIEWS[id].badge}
                    count={counts[id]}
                    alert={id === 'dedup' && dupOpen > 0}
                    active={view === id}
                    onClick={() => setView(id)}
                  />
                ))}
              </div>
            ))}
          </nav>
          <span className="spacer" />
          <RailItem icon={<HomeIcon />} label="Mes revues" onClick={onHome} />
          <RailItem icon={<Palette />} label="Style" onClick={onTheme} />
          <RailItem icon={<SettingsIcon />} label="Zotero" onClick={onSettings} />
        </>
      }
    >
      <header className="page-head">
        <div className="page-title">
          <div className="eyebrow">{project.name}</div>
          <h1>{v.title}</h1>
          <p className="muted hide-mobile">{v.subtitle}</p>
        </div>
        <span className="spacer" />
        <span className="pill" title={syncStatus.message}>
          <span className={`sync-dot ${dotClass}`} /> <span className="hide-mobile">{syncLabel}</span>
        </span>
        {client && (
          <button
            className="btn dark"
            title="Envoyer les décisions vers Zotero et lire les changements faits dans Zotero"
            onClick={async () => {
              await syncNow();
              await pullNow();
            }}
          >
            <RefreshCw size={16} className={syncStatus.state === 'syncing' ? 'spin' : ''} /> <span className="hide-mobile">Synchroniser</span>
          </button>
        )}
      </header>
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
        {view === 'search' && <SearchStrategy />}
        {view === 'import' && <ImportView onSettings={onSettings} onDone={() => setView('dedup')} />}
        {view === 'dedup' && <Dedup onDone={() => setView('screening')} />}
        {view === 'screening' && <Review stage="screening" />}
        {view === 'fulltext' && <Review stage="fulltext" />}
        {view === 'organisation' && <Organisation />}
        {view === 'records' && <Records />}
        {view === 'prisma' && <Prisma />}
      </main>
    </Frame>
  );
}
