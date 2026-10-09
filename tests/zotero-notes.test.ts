import { describe, expect, it } from 'vitest';
import { annotatableAttachments, highlights, htmlToText, userNotes } from '../src/lib/zoteroNotes';
import type { ZItem } from '../src/zotero/api';

const item = (key: string, data: Record<string, unknown>): ZItem => ({ key, version: 1, data: { key, version: 1, itemType: 'note', ...data } as ZItem['data'] });

describe('notes Zotero affichées dans LitFlow', () => {
  it('convertit le HTML en texte sans jamais l’interpréter', () => {
    expect(htmlToText('<p>Bon cadre&nbsp;pour le <b>ch. 2</b></p><p>Élus &amp; formation</p><ul><li>un</li><li>deux</li></ul>')).toBe(
      'Bon cadre pour le ch. 2\nÉlus & formation\n• un\n• deux',
    );
    expect(htmlToText('<script>alert(1)</script><img src=x onerror=alert(1)>ok')).toBe('ok');
    expect(htmlToText('&#233;t&#xE9;')).toBe('été');
  });

  it('garde les notes de la personne et écarte celle de LitFlow', () => {
    const children = [
      item('N1', { note: '<p>Ma note</p>' }),
      item('N2', { note: '<h2>LitFlow – Revue</h2><p>Tri…</p>' }),
      item('N3', { note: '<p>Autre</p>' }),
      item('A1', { itemType: 'attachment', contentType: 'application/pdf', linkMode: 'imported_file' }),
      item('A2', { itemType: 'attachment', contentType: 'text/html', linkMode: 'linked_url' }),
    ];
    expect(userNotes(children, 'N3').map((n) => n.text)).toEqual(['Ma note']);
    expect(annotatableAttachments(children)).toEqual(['A1']);
  });

  it('liste les surlignages dans l’ordre du document', () => {
    const anns = [
      item('H2', { itemType: 'annotation', annotationText: 'second', annotationSortIndex: '00002|000100|00050', annotationPageLabel: '4' }),
      item('H1', { itemType: 'annotation', annotationText: 'premier', annotationComment: '<p>à citer</p>', annotationSortIndex: '00001|000100|00050' }),
      item('H3', { itemType: 'annotation', annotationType: 'ink' }),
    ];
    expect(highlights(anns).map((h) => [h.text, h.comment])).toEqual([
      ['premier', 'à citer'],
      ['second', ''],
    ]);
  });
});
