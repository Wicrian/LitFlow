// « Mes notes » : les notes et surlignages Zotero d'une référence, affichés
// dans LitFlow pour décider sans faire d'allers-retours. Lecture seule.

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Highlighter, NotebookPen } from 'lucide-react';
import { annotatableAttachments, highlights, userNotes, type Highlight, type UserNote } from '../lib/zoteroNotes';
import { zoteroSelectLink } from '../zotero/api';
import { useProject } from '../store';

interface Loaded {
  notes: UserNote[];
  marks: Highlight[];
}

// Petit cache pour ne pas tout relire à chaque carte (5 minutes).
const cache = new Map<string, { at: number; data: Loaded }>();
const TTL = 5 * 60 * 1000;

/** Charge (avec cache) les notes et surlignages Zotero d'une référence. */
export function useZoteroNotes(recordKey: string): { data: Loaded | null; error: string; available: boolean } {
  const { project: p, client } = useProject();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const id = `${p.library?.type}:${p.library?.id}:${recordKey}`;
  useEffect(() => {
    setData(null);
    setError('');
    if (!client || !p.library) return;
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < TTL) return setData(hit.data);
    let alive = true;
    (async () => {
      try {
        const children = await client.children(recordKey);
        const notes = userNotes(children, p.zoteroNotes[recordKey]);
        const att = annotatableAttachments(children).slice(0, 3);
        const ann = (await Promise.all(att.map((k) => client.children(k)))).flat();
        const loaded = { notes, marks: highlights(ann) };
        cache.set(id, { at: Date.now(), data: loaded });
        if (alive) setData(loaded);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, client]);
  return { data, error, available: !!client && !!p.library };
}

/** Petit bouton « 📝 1 · 🖍 2 » à poser sur une carte ; rien s'il n'y a pas de notes. */
export function NotesBadge({ recordKey, onOpen }: { recordKey: string; onOpen: () => void }) {
  const { data } = useZoteroNotes(recordKey);
  if (!data || (!data.notes.length && !data.marks.length)) return null;
  return (
    <button className="notes-badge" onClick={onOpen} title="Voir mes notes et surlignages Zotero">
      <NotebookPen size={13} /> {data.notes.length}
      {data.marks.length > 0 && (
        <>
          {' '}
          · <Highlighter size={13} /> {data.marks.length}
        </>
      )}
    </button>
  );
}

export function ZoteroNotes({ recordKey, defaultOpen = false }: { recordKey: string; defaultOpen?: boolean }) {
  const { project: p } = useProject();
  const { data, error, available } = useZoteroNotes(recordKey);
  const [open, setOpen] = useState(defaultOpen);

  if (!available) return null;
  if (error) return <div className="znotes small muted">Notes Zotero indisponibles : {error}</div>;
  if (!data)
    return (
      <div className="znotes small muted">
        <NotebookPen size={14} /> Lecture de vos notes Zotero…
      </div>
    );
  const n = data.notes.length;
  const m = data.marks.length;
  if (!n && !m)
    return (
      <div className="znotes small muted">
        <NotebookPen size={14} /> Aucune note ni surlignage dans Zotero pour cette référence.
      </div>
    );

  return (
    <div className={`znotes ${open ? 'open' : ''}`}>
      <button className="znotes-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <NotebookPen size={15} /> <strong>Mes notes</strong>
        <span className="badge">{n}</span>
        {m > 0 && (
          <>
            <Highlighter size={15} /> <strong>Surlignages</strong>
            <span className="badge">{m}</span>
          </>
        )}
      </button>
      {open && (
        <div className="znotes-body">
          {data.notes.map((x) => (
            <div key={x.key} className="znote">
              {x.text}
            </div>
          ))}
          {data.marks.map((h) => (
            <div key={h.key} className="zmark" style={{ borderColor: h.color }}>
              {h.text && <div className="zmark-text">« {h.text} »</div>}
              {h.comment && <div className="zmark-comment">{h.comment}</div>}
              {h.page && <div className="small muted">p. {h.page}</div>}
            </div>
          ))}
          <a className="small" href={zoteroSelectLink(p.library, recordKey)}>
            Ouvrir dans Zotero pour les modifier
          </a>
        </div>
      )}
    </div>
  );
}
