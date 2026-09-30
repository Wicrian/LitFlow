import { useMemo, useRef, useState } from 'react';
import { computePrisma, type Column, type PrismaCounts } from '../lib/prisma';
import { download, safeFileName } from '../lib/export';
import { useProject } from '../store';

type Lang = 'fr' | 'en';

const T = {
  fr: {
    idHeader: 'Identification des études via les bases de données et les registres',
    otherHeader: 'Identification des études via d’autres méthodes',
    identification: 'Identification',
    screening: 'Sélection',
    included: 'Inclusion',
    identified: 'Enregistrements identifiés à partir de :',
    databases: 'Bases de données',
    registers: 'Registres',
    removed: 'Enregistrements supprimés avant la sélection :',
    duplicates: 'Doublons supprimés',
    automation: 'Marqués comme inéligibles par des outils d’automatisation',
    otherReasons: 'Supprimés pour d’autres raisons',
    screened: 'Enregistrements sélectionnés',
    excluded: 'Enregistrements exclus',
    sought: 'Rapports recherchés pour récupération',
    notRetrieved: 'Rapports non récupérés',
    assessed: 'Rapports évalués pour l’éligibilité',
    reportsExcluded: 'Rapports exclus :',
    includedStudies: 'Études incluses dans la revue',
    otherIdentified: 'Enregistrements identifiés à partir de :',
    pending: 'en attente de décision',
  },
  en: {
    idHeader: 'Identification of studies via databases and registers',
    otherHeader: 'Identification of studies via other methods',
    identification: 'Identification',
    screening: 'Screening',
    included: 'Included',
    identified: 'Records identified from:',
    databases: 'Databases',
    registers: 'Registers',
    removed: 'Records removed before screening:',
    duplicates: 'Duplicate records removed',
    automation: 'Records marked as ineligible by automation tools',
    otherReasons: 'Records removed for other reasons',
    screened: 'Records screened',
    excluded: 'Records excluded',
    sought: 'Reports sought for retrieval',
    notRetrieved: 'Reports not retrieved',
    assessed: 'Reports assessed for eligibility',
    reportsExcluded: 'Reports excluded:',
    includedStudies: 'Studies included in review',
    otherIdentified: 'Records identified from:',
    pending: 'awaiting decision',
  },
};

// ---- Mise en page SVG ----
const BOX_W = 280;
const EXCL_W = 260;
const GAP_X = 40;
const GAP_Y = 36;
const LINE = 15;
const PAD = 10;
const CHARS = 40;

function wrap(text: string, width = CHARS): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if ((line + ' ' + word).trim().length > width && line) {
        out.push(line);
        line = word;
      } else line = (line + ' ' + word).trim();
    }
    out.push(line);
  }
  return out;
}

type Box = { x: number; y: number; w: number; h: number; lines: string[]; head?: boolean; firstBold?: boolean };

function boxHeight(lines: string[]) {
  return lines.length * LINE + PAD * 2;
}

function buildLayout(c: PrismaCounts, t: (typeof T)['fr'], showPending: boolean) {
  const n = (v: number) => `(n = ${v})`;
  const pend = (v: number) => (showPending && v > 0 ? `\n[${v} ${t.pending}]` : '');
  const x0 = 50;
  const xMain = x0;
  const xExcl = xMain + BOX_W + GAP_X;
  const xOther = xExcl + EXCL_W + GAP_X * 1.5;
  const xOtherExcl = xOther + BOX_W + GAP_X;
  const hasOther = c.other !== null;

  const listLines = (items: [string, number][], max = 12) =>
    items.slice(0, max).map(([name, v]) => `  ${name} (n = ${v})`).concat(items.length > max ? [`  … (${items.length - max})`] : []);

  const identified = [
    ...wrap(t.identified),
    ...wrap(`${t.databases} ${n(c.identifiedDatabases)}`),
    ...listLines(c.databases),
    ...(c.identifiedRegisters ? [...wrap(`${t.registers} ${n(c.identifiedRegisters)}`), ...listLines(c.registers)] : [`${t.registers} (n = 0)`]),
  ];
  const removed = [...wrap(t.removed, 34), ...wrap(`${t.duplicates} ${n(c.duplicates)}`, 36), ...wrap(`${t.automation} ${n(c.automationExcluded)}`, 36), ...wrap(`${t.otherReasons} ${n(c.otherRemoved)}`, 36)];

  const colBoxes = (col: Column, x: number, xE: number, rows: number[]) => {
    const excl = [t.reportsExcluded, ...col.excludedByReason.map(([r, v]) => wrap(`${r} (n = ${v})`, 34)).flat()];
    return {
      sought: { x, y: rows[0], w: BOX_W, lines: wrap(`${t.sought}\n${n(col.sought)}`) },
      notRetrieved: { x: xE, y: rows[0], w: EXCL_W, lines: wrap(`${t.notRetrieved}\n${n(col.notRetrieved)}`, 34) },
      assessed: { x, y: rows[1], w: BOX_W, lines: wrap(`${t.assessed}\n${n(col.assessed)}${pend(col.pending)}`) },
      excluded: { x: xE, y: rows[1], w: EXCL_W, lines: excl.length > 1 ? excl : [t.reportsExcluded, '(n = 0)'] },
    };
  };

  // Hauteurs de lignes calculées à partir du contenu.
  const otherLines = hasOther ? [...wrap(t.otherIdentified), ...listLines(c.otherMethods)] : [];
  const rowH: number[] = [];
  rowH[0] = Math.max(boxHeight(identified), boxHeight(removed), hasOther ? boxHeight(otherLines) : 0);
  rowH[1] = boxHeight(wrap(`${t.screened}\n${n(c.screened)}${pend(c.screeningPending)}`));
  rowH[2] = boxHeight(wrap(`${t.sought}\n(n)`)) ;
  const mainExcl = [t.reportsExcluded, ...c.main.excludedByReason.map(([r, v]) => wrap(`${r} (n = ${v})`, 34)).flat()];
  const otherExcl = c.other ? [t.reportsExcluded, ...c.other.excludedByReason.map(([r, v]) => wrap(`${r} (n = ${v})`, 34)).flat()] : [];
  rowH[3] = Math.max(boxHeight(mainExcl), boxHeight(otherExcl), boxHeight(wrap(`${t.assessed}\n(n)\n[x]`)));
  rowH[4] = Math.max(boxHeight(wrap(`${t.includedStudies}\n(n)`)), 90);

  const HEAD = 40;
  const ys: number[] = [];
  let y = HEAD + 16;
  for (const h of rowH) {
    ys.push(y);
    y += h + GAP_Y;
  }
  const height = y;
  const width = hasOther ? xOtherExcl + EXCL_W + 20 : xExcl + EXCL_W + 20;

  const boxes: Record<string, Box> = {};
  const add = (id: string, b: Omit<Box, 'h'> & { h?: number }) => (boxes[id] = { ...b, h: b.h ?? boxHeight(b.lines) });

  add('identified', { x: xMain, y: ys[0], w: BOX_W, lines: identified, h: rowH[0], firstBold: true });
  add('removed', { x: xExcl, y: ys[0], w: EXCL_W, lines: removed, h: rowH[0], firstBold: true });
  add('screened', { x: xMain, y: ys[1], w: BOX_W, lines: wrap(`${t.screened}\n${n(c.screened)}${pend(c.screeningPending)}`), h: rowH[1] });
  add('screenExcl', { x: xExcl, y: ys[1], w: EXCL_W, lines: wrap(`${t.excluded}\n${n(c.screeningExcluded)}`, 34), h: rowH[1] });
  const m = colBoxes(c.main, xMain, xExcl, [ys[2], ys[3]]);
  add('sought', { ...m.sought, h: rowH[2] });
  add('notRetrieved', { ...m.notRetrieved, h: rowH[2] });
  add('assessed', { ...m.assessed, h: rowH[3] });
  add('excluded', { ...m.excluded, h: rowH[3], firstBold: true });
  add('included', { x: xMain, y: ys[4], w: BOX_W, lines: wrap(`${t.includedStudies}\n${n(c.totalIncluded)}`), h: rowH[4], head: true });

  if (c.other) {
    add('oIdentified', { x: xOther, y: ys[0], w: BOX_W, lines: otherLines, h: rowH[0], firstBold: true });
    const o = colBoxes(c.other, xOther, xOtherExcl, [ys[2], ys[3]]);
    add('oSought', { ...o.sought, h: rowH[2] });
    add('oNotRetrieved', { ...o.notRetrieved, h: rowH[2] });
    add('oAssessed', { ...o.assessed, h: rowH[3] });
    add('oExcluded', { ...o.excluded, h: rowH[3], firstBold: true });
  }

  // Flèches : [de, vers, direction]
  const arrows: [string, string, 'down' | 'right'][] = [
    ['identified', 'removed', 'right'],
    ['identified', 'screened', 'down'],
    ['screened', 'screenExcl', 'right'],
    ['screened', 'sought', 'down'],
    ['sought', 'notRetrieved', 'right'],
    ['sought', 'assessed', 'down'],
    ['assessed', 'excluded', 'right'],
    ['assessed', 'included', 'down'],
  ];
  if (c.other)
    arrows.push(
      ['oIdentified', 'oSought', 'down'],
      ['oSought', 'oNotRetrieved', 'right'],
      ['oSought', 'oAssessed', 'down'],
      ['oAssessed', 'oExcluded', 'right'],
    );

  // Flèche coudée de la colonne « autres méthodes » vers les études incluses.
  const elbow =
    c.other && boxes.oAssessed && boxes.included
      ? (() => {
          const a = boxes.oAssessed;
          const b = boxes.included;
          const x = a.x + a.w / 2;
          const y = b.y + b.h / 2;
          return `M ${x} ${a.y + a.h} L ${x} ${y} L ${b.x + b.w} ${y}`;
        })()
      : null;

  const phases: [string, number, number][] = [
    [t.identification, ys[0], ys[0] + rowH[0]],
    [t.screening, ys[1], ys[3] + rowH[3]],
    [t.included, ys[4], ys[4] + rowH[4]],
  ];
  const headers: [string, number, number][] = [[t.idHeader, xMain, xExcl + EXCL_W]];
  if (c.other) headers.push([t.otherHeader, xOther, xOtherExcl + EXCL_W]);

  return { boxes, arrows, elbow, phases, headers, width, height, HEAD };
}

export function Prisma() {
  const { project: p, update } = useProject();
  const [lang, setLang] = useState<Lang>('fr');
  const [showPending, setShowPending] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const counts = useMemo(() => computePrisma(p), [p]);
  const t = T[lang];
  const L = buildLayout(counts, t, showPending);

  const svgString = () => {
    const s = new XMLSerializer().serializeToString(svgRef.current!);
    return s.includes('xmlns=') ? s : s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  };
  const exportPng = () => {
    const img = new Image();
    const scale = 3;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = L.width * scale;
      canvas.height = L.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => b && download(`PRISMA-${safeFileName(p.name)}.png`, b, 'image/png'));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString());
  };

  const mc = p.manualCounts;
  const setMc = (patch: Partial<typeof mc>) => update((x) => ({ ...x, manualCounts: { ...x.manualCounts, ...patch } }));

  const center = (b: Box) => ({ cx: b.x + b.w / 2, cy: b.y + b.h / 2 });

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row">
          <h2 style={{ margin: 0 }}>Diagramme de flux PRISMA 2020</h2>
          <span className="spacer" />
          <select style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
          <label className="row small">
            <input type="checkbox" checked={showPending} onChange={(e) => setShowPending(e.target.checked)} /> Afficher les décisions en attente
          </label>
          <button className="btn small" onClick={() => download(`PRISMA-${safeFileName(p.name)}.svg`, svgString(), 'image/svg+xml')}>
            Télécharger SVG
          </button>
          <button className="btn small primary" onClick={exportPng}>
            Télécharger PNG
          </button>
        </div>
        <p className="small muted">
          Les chiffres sont calculés automatiquement à partir de vos décisions. Le SVG s’ouvre et se modifie dans Inkscape,
          PowerPoint, Word ou draw.io. Modèle : Page MJ, et al. BMJ 2021;372:n71.
        </p>
        <div className="prisma-wrap">
          <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={L.width} height={L.height} viewBox={`0 0 ${L.width} ${L.height}`} fontFamily="Arial, Helvetica, sans-serif" fontSize="12">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#333" />
              </marker>
            </defs>
            <rect width={L.width} height={L.height} fill="#fff" />
            {L.headers.map(([text, x1, x2]) => (
              <g key={text}>
                <rect x={x1} y={8} width={x2 - x1} height={L.HEAD - 8} rx={8} fill="#f4c542" stroke="#333" />
                <text x={(x1 + x2) / 2} y={8 + (L.HEAD - 8) / 2 + 4} textAnchor="middle" fontWeight="bold">
                  {text}
                </text>
              </g>
            ))}
            {L.phases.map(([text, y1, y2]) => (
              <g key={text}>
                <rect x={8} y={y1} width={28} height={y2 - y1} rx={6} fill="#a7c7e7" stroke="#333" />
                <text transform={`translate(${22 + 4}, ${(y1 + y2) / 2}) rotate(-90)`} textAnchor="middle" fontWeight="bold">
                  {text}
                </text>
              </g>
            ))}
            {L.arrows.map(([from, to, dir]) => {
              const a = L.boxes[from];
              const b = L.boxes[to];
              if (!a || !b) return null;
              const [x1, y1, x2, y2] =
                dir === 'right'
                  ? [a.x + a.w, Math.min(center(a).cy, b.y + b.h / 2), b.x, Math.min(center(a).cy, b.y + b.h / 2)]
                  : [a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y];
              return <line key={from + to} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#333" strokeWidth={1.3} markerEnd="url(#arrow)" />;
            })}
            {L.elbow && <path d={L.elbow} fill="none" stroke="#333" strokeWidth={1.3} markerEnd="url(#arrow)" />}
            {Object.entries(L.boxes).map(([id, b]) => (
              <g key={id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.head ? '#eef6ee' : '#fff'} stroke="#333" />
                {b.lines.map((line, i) => (
                  <text
                    key={i}
                    x={b.lines.length <= 3 && !b.firstBold ? b.x + b.w / 2 : b.x + PAD}
                    y={b.y + PAD + (i + 1) * LINE - 3}
                    textAnchor={b.lines.length <= 3 && !b.firstBold ? 'middle' : 'start'}
                    fontWeight={b.firstBold && i === 0 ? 'bold' : 'normal'}
                    fontStyle={line.startsWith('[') ? 'italic' : 'normal'}
                    fill={line.startsWith('[') ? '#a15c00' : '#000'}
                    xmlSpace="preserve"
                  >
                    {line}
                  </text>
                ))}
              </g>
            ))}
          </svg>
        </div>
      </section>

      <section className="panel stack">
        <h3>Chiffres saisis manuellement</h3>
        <p className="small muted">
          Pour ce qui ne passe pas par Zotero (ex. enregistrements retirés par un filtre de la base de données, ou références
          trouvées par d’autres méthodes sans les importer).
        </p>
        <div className="row">
          <label className="field">
            <span>Marqués inéligibles par des outils d’automatisation</span>
            <input type="number" min={0} value={mc.automationExcluded} onChange={(e) => setMc({ automationExcluded: Math.max(0, +e.target.value) })} />
          </label>
          <label className="field">
            <span>Supprimés pour d’autres raisons</span>
            <input type="number" min={0} value={mc.otherRemoved} onChange={(e) => setMc({ otherRemoved: Math.max(0, +e.target.value) })} />
          </label>
        </div>
        <div className="stack">
          <span className="small muted">Autres méthodes (hors Zotero)</span>
          {mc.otherMethodsIdentified.map((m, i) => (
            <div key={i} className="row">
              <input
                type="text"
                style={{ width: 260 }}
                value={m.name}
                onChange={(e) => setMc({ otherMethodsIdentified: mc.otherMethodsIdentified.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
              />
              <input
                type="number"
                min={0}
                value={m.n}
                onChange={(e) => setMc({ otherMethodsIdentified: mc.otherMethodsIdentified.map((x, j) => (j === i ? { ...x, n: Math.max(0, +e.target.value) } : x)) })}
              />
              <button className="btn small danger" onClick={() => setMc({ otherMethodsIdentified: mc.otherMethodsIdentified.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
          ))}
          <div>
            <button className="btn small" onClick={() => setMc({ otherMethodsIdentified: [...mc.otherMethodsIdentified, { name: 'Sites web', n: 0 }] })}>
              + Ajouter une autre méthode
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
