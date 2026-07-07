import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'
import { exportPdf } from './exporter'
import type { EmbeddableFont } from './fonts'
import type { Edit, PageDescriptor } from '../model/types'
import { parsePageRange } from '../utils/pageRange'

const FONT_FILES: Record<EmbeddableFont, string> = {
  NotoSans: 'NotoSans-Regular.ttf',
  NotoSansBold: 'NotoSans-Bold.ttf',
  GreatVibes: 'GreatVibes-Regular.ttf',
  Pacifico: 'Pacifico-Regular.ttf',
  Satisfy: 'Satisfy-Regular.ttf',
}

const getFontBytes = async (name: EmbeddableFont) =>
  new Uint8Array(await readFile(new URL(`../assets/fonts/${FONT_FILES[name]}`, import.meta.url)))

/** 3 pages with distinct widths (so order is assertable) + a small AcroForm. */
async function makeSourcePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const widths = [500, 600, 700]
  for (const w of widths) {
    const page = doc.addPage([w, 800])
    page.drawText(`width ${w}`, { x: 50, y: 700, size: 20, font })
  }
  const form = doc.getForm()
  const name = form.createTextField('name')
  name.addToPage(doc.getPage(0), { x: 50, y: 600, width: 200, height: 20 })
  const agree = form.createCheckBox('agree')
  agree.addToPage(doc.getPage(0), { x: 50, y: 560, width: 15, height: 15 })
  return doc.save()
}

function descriptorsFor(docId: string, widths: number[]): PageDescriptor[] {
  return widths.map((w, i) => ({
    id: `p${i}`,
    docId,
    sourceIndex: i,
    baseRotation: 0,
    extraRotation: 0,
    width: w,
    height: 800,
  }))
}

describe('exportPdf', () => {
  it('identity roundtrip preserves pages and fills the form (unflattened)', async () => {
    const src = await makeSourcePdf()
    const pages = descriptorsFor('main', [500, 600, 700])
    const edits: Record<string, Edit[]> = {
      p0: [
        { id: 'e1', pageId: 'p0', z: 0, type: 'whiteout', rect: { x: 40, y: 690, w: 120, h: 30 }, color: { r: 1, g: 1, b: 1 } },
        { id: 'e2', pageId: 'p0', z: 1, type: 'text', rect: { x: 40, y: 690, w: 200, h: 30 }, text: 'Hello Přemysl ✓', fontFamily: 'NotoSans', fontSize: 14, color: { r: 0, g: 0, b: 0 } },
      ],
    }
    const { bytes, warnings } = await exportPdf({
      primaryDocId: 'main',
      pages,
      edits,
      formValues: { name: 'Amanpreet', agree: true },
      flattenForm: false,
      getBytes: () => src,
      getFontBytes,
    })
    expect(warnings).toEqual([])

    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(3)
    expect(out.getPage(0).getWidth()).toBe(500)
    const form = out.getForm()
    expect(form.getTextField('name').getText()).toBe('Amanpreet')
    expect(form.getCheckBox('agree').isChecked()).toBe(true)
  })

  it('flattens the form when asked', async () => {
    const src = await makeSourcePdf()
    const { bytes } = await exportPdf({
      primaryDocId: 'main',
      pages: descriptorsFor('main', [500, 600, 700]),
      edits: {},
      formValues: { name: 'X' },
      flattenForm: true,
      getBytes: () => src,
      getFontBytes,
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getForm().getFields().length).toBe(0)
  })

  it('page ops: reorder + delete + rotate, flattening the form with a warning', async () => {
    const src = await makeSourcePdf()
    const pages = descriptorsFor('main', [500, 600, 700])
    // delete p1, reverse remaining, rotate first output page 90°
    const reordered = [ { ...pages[2], extraRotation: 90 as const }, pages[0] ]
    const { bytes, warnings } = await exportPdf({
      primaryDocId: 'main',
      pages: reordered,
      edits: { p2: [{ id: 'e3', pageId: 'p2', z: 0, type: 'highlight', rect: { x: 10, y: 10, w: 100, h: 20 }, color: { r: 1, g: 0.9, b: 0.2 }, opacity: 0.35 }] },
      formValues: { name: 'Y' },
      flattenForm: false,
      getBytes: () => src,
      getFontBytes,
    })
    expect(warnings.some((w) => w.includes('flatten'))).toBe(true)

    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(2)
    expect(out.getPage(0).getWidth()).toBe(700)
    expect(out.getPage(0).getRotation().angle).toBe(90)
    expect(out.getPage(1).getWidth()).toBe(500)
    expect(out.getForm().getFields().length).toBe(0)
  })

  it('merges pages from a second document', async () => {
    const src = await makeSourcePdf()
    const other = await (async () => {
      const doc = await PDFDocument.create()
      doc.addPage([333, 400])
      return doc.save()
    })()
    const pages = [
      ...descriptorsFor('main', [500, 600, 700]),
      { id: 'm0', docId: 'other', sourceIndex: 0, baseRotation: 0 as const, extraRotation: 0 as const, width: 333, height: 400 },
    ]
    const { bytes } = await exportPdf({
      primaryDocId: 'main',
      pages,
      edits: {},
      formValues: {},
      flattenForm: true,
      getBytes: (id) => (id === 'main' ? src : other),
      getFontBytes,
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(4)
    expect(out.getPage(3).getWidth()).toBe(333)
  })

  it('draws every edit type without warnings, including on a rotated page', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([612, 792]).setRotation(degrees(90))
    const src = await doc.save()
    const desc: PageDescriptor = {
      id: 'p0', docId: 'main', sourceIndex: 0, baseRotation: 90, extraRotation: 0, width: 612, height: 792,
    }
    const edits: Edit[] = [
      { id: '1', pageId: 'p0', z: 0, type: 'whiteout', rect: { x: 10, y: 10, w: 50, h: 20 }, color: { r: 1, g: 1, b: 1 } },
      { id: '2', pageId: 'p0', z: 1, type: 'highlight', rect: { x: 10, y: 40, w: 50, h: 20 }, color: { r: 1, g: 1, b: 0 }, opacity: 0.35 },
      { id: '3', pageId: 'p0', z: 2, type: 'shape', shape: 'rect', rect: { x: 100, y: 100, w: 80, h: 40 }, stroke: { r: 1, g: 0, b: 0 }, strokeWidth: 2 },
      { id: '4', pageId: 'p0', z: 3, type: 'shape', shape: 'ellipse', rect: { x: 200, y: 100, w: 80, h: 40 }, stroke: { r: 0, g: 0, b: 1 }, strokeWidth: 2 },
      { id: '5', pageId: 'p0', z: 4, type: 'shape', shape: 'arrow', p1: { x: 300, y: 300 }, p2: { x: 400, y: 350 }, stroke: { r: 0, g: 0.5, b: 0 }, strokeWidth: 2 },
      { id: '6', pageId: 'p0', z: 5, type: 'ink', points: [[{ x: 50, y: 50 }, { x: 60, y: 70 }, { x: 80, y: 65 }]], stroke: { r: 0, g: 0, b: 0 }, strokeWidth: 2 },
      { id: '7', pageId: 'p0', z: 6, type: 'text', rect: { x: 100, y: 500, w: 200, h: 60 }, text: 'rotated page text', fontFamily: 'NotoSans', fontSize: 12, color: { r: 0, g: 0, b: 0 } },
      { id: '8', pageId: 'p0', z: 7, type: 'signature', rect: { x: 100, y: 200, w: 150, h: 50 }, source: { kind: 'typed', text: 'Aman', font: 'GreatVibes' } },
      { id: '9', pageId: 'p0', z: 8, type: 'signature', rect: { x: 300, y: 200, w: 100, h: 50 }, source: { kind: 'image', pngDataUrl: TINY_PNG } },
      { id: '10', pageId: 'p0', z: 9, type: 'note', at: { x: 400, y: 600 }, text: 'a sticky note', color: { r: 1, g: 0.8, b: 0 } },
    ]
    const { bytes, warnings } = await exportPdf({
      primaryDocId: 'main',
      pages: [desc],
      edits: { p0: edits },
      formValues: {},
      flattenForm: false,
      getBytes: () => src,
      getFontBytes,
    })
    expect(warnings).toEqual([])
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(1)
    expect(out.getPage(0).getRotation().angle).toBe(90)
  })
})

describe('parsePageRange', () => {
  it('parses ranges and singles', () => {
    expect(parsePageRange('1-3, 5', 10)).toEqual([0, 1, 2, 4])
  })
  it('rejects malformed and out-of-range', () => {
    expect(parsePageRange('0-2', 10)).toBeNull()
    expect(parsePageRange('9-12', 10)).toBeNull()
    expect(parsePageRange('a', 10)).toBeNull()
  })
})

// 1x1 red pixel PNG
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
