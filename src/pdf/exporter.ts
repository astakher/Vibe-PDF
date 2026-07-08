import fontkit from '@pdf-lib/fontkit'
import {
  BlendMode,
  PDFArray,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFFont,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFPage,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib'
import type {
  Edit,
  FormValue,
  InkEdit,
  NoteEdit,
  PageDescriptor,
  Point,
  Rect,
  RGB,
  ShapeEdit,
  SignatureEdit,
  TextBoxEdit,
} from '../model/types'
import { sortEditsForRender, totalRotation } from '../model/types'
import type { EmbeddableFont } from './fonts'
import {
  TEXT_LINE_HEIGHT,
  TEXT_PADDING,
  remapEditToRaster,
  userRectToVisual,
  userToVisual,
  visualRectToUser,
  visualToUser,
  wrapText,
} from './drawHelpers'

/** Injected page rasterizer (browser: src/pdf/rasterize.ts; tests: a stub). */
export type RasterizePageFn = (
  docId: string,
  sourceIndex: number,
  rotation: 0 | 90 | 180 | 270,
  dpi: number,
  opts: { redactRects: Rect[]; formValues?: Record<string, FormValue> },
) => Promise<{ jpeg: Uint8Array; widthPt: number; heightPt: number }>

export type ExportInput = {
  primaryDocId: string
  /** pages to include, in output order (pass a subset to extract pages) */
  pages: PageDescriptor[]
  edits: Record<string, Edit[]>
  formValues: Record<string, FormValue>
  flattenForm: boolean
  /** injected so the exporter also runs under node (tests) */
  getBytes: (docId: string) => Uint8Array | Promise<Uint8Array>
  getFontBytes: (name: EmbeddableFont) => Promise<Uint8Array>
  /** required for TRUE redaction; without it redact boxes draw as plain rectangles + warning */
  rasterizePage?: RasterizePageFn
}

export type ExportResult = { bytes: Uint8Array; warnings: string[] }

const toRgb = (c: RGB) => rgb(c.r, c.g, c.b)

export async function exportPdf(input: ExportInput): Promise<ExportResult> {
  const { primaryDocId, pages, edits, formValues, getBytes, getFontBytes } = input
  const warnings: string[] = []

  const primaryDoc = await PDFDocument.load(await getBytes(primaryDocId), { ignoreEncryption: true })
  primaryDoc.registerFontkit(fontkit)

  const fontCache = new Map<PDFDocument, Map<string, Promise<PDFFont>>>()
  const fontFor = (doc: PDFDocument, family: EmbeddableFont | 'Helvetica'): Promise<PDFFont> => {
    let perDoc = fontCache.get(doc)
    if (!perDoc) fontCache.set(doc, (perDoc = new Map()))
    let p = perDoc.get(family)
    if (!p) {
      p =
        family === 'Helvetica'
          ? doc.embedFont(StandardFonts.Helvetica)
          : getFontBytes(family).then((bytes) => doc.embedFont(bytes, { subset: true }))
      perDoc.set(family, p)
    }
    return p
  }

  const fillForm = async (doc: PDFDocument): Promise<boolean> => {
    const form = doc.getForm()
    if (form.getFields().length === 0) return false
    if (doc === primaryDoc) {
      for (const [name, value] of Object.entries(formValues)) {
        try {
          const field = form.getField(name)
          if (field instanceof PDFTextField) field.setText(value == null ? '' : String(value))
          else if (field instanceof PDFCheckBox) (value ? field.check() : field.uncheck())
          else if (field instanceof PDFRadioGroup) {
            if (typeof value === 'string' && value !== '') field.select(value)
          } else if (field instanceof PDFDropdown) {
            if (typeof value === 'string' && value !== '') field.select(value)
          } else if (field instanceof PDFOptionList) {
            const vals = Array.isArray(value) ? value : typeof value === 'string' && value !== '' ? [value] : []
            if (vals.length) field.select(vals)
          }
        } catch (e) {
          warnings.push(`Form field "${name}" could not be filled: ${e instanceof Error ? e.message : e}`)
        }
      }
    }
    try {
      form.updateFieldAppearances(await fontFor(doc, 'NotoSans'))
    } catch (e) {
      warnings.push(`Could not refresh form appearances: ${e instanceof Error ? e.message : e}`)
    }
    return true
  }

  // Identity layout = same single source doc, all pages, original order. Then we can
  // mutate the loaded doc in place and the AcroForm survives untouched.
  const isIdentity =
    pages.length === primaryDoc.getPageCount() &&
    pages.every((p, i) => p.docId === primaryDocId && p.sourceIndex === i)

  const anyRedactions = pages.some((p) => (edits[p.id] ?? []).some((e) => e.type === 'redact'))

  let outDoc: PDFDocument
  let pageFor: (desc: PageDescriptor) => PDFPage

  if (isIdentity) {
    outDoc = primaryDoc
    const hasForm = await fillForm(primaryDoc)
    // Redacted pages get replaced wholesale — flatten first so no form fields
    // reference the removed page's widgets (values stay visible everywhere).
    if (hasForm && anyRedactions && !input.flattenForm) {
      warnings.push('Form fields were flattened because the document contains redactions.')
    }
    if (hasForm && (input.flattenForm || anyRedactions)) {
      try {
        primaryDoc.getForm().flatten()
      } catch (e) {
        warnings.push(`Could not flatten the form: ${e instanceof Error ? e.message : e}`)
      }
    }
    for (const desc of pages) {
      if (desc.extraRotation !== 0) {
        primaryDoc.getPage(desc.sourceIndex).setRotation(degrees(totalRotation(desc)))
      }
    }
    pageFor = (desc) => outDoc.getPage(desc.sourceIndex)
  } else {
    // Page ops present (reorder/delete/merge/extract). pdf-lib's copyPages does not
    // carry the AcroForm field dictionary, so any live form must be flattened first.
    const srcDocs = new Map<string, PDFDocument>([[primaryDocId, primaryDoc]])
    for (const desc of pages) {
      if (!srcDocs.has(desc.docId)) {
        const doc = await PDFDocument.load(await getBytes(desc.docId), { ignoreEncryption: true })
        doc.registerFontkit(fontkit)
        srcDocs.set(desc.docId, doc)
      }
    }
    for (const [docId, doc] of srcDocs) {
      const hasForm = await fillForm(doc)
      if (hasForm) {
        if (!input.flattenForm && docId === primaryDocId) {
          warnings.push('Page changes require flattening form fields; the form was flattened.')
        }
        try {
          doc.getForm().flatten()
        } catch (e) {
          warnings.push(`Could not flatten a form: ${e instanceof Error ? e.message : e}`)
        }
      }
    }

    outDoc = await PDFDocument.create()
    outDoc.registerFontkit(fontkit)
    const copied = new Map<string, PDFPage>() // `${docId}:${sourceIndex}`
    for (const [docId, doc] of srcDocs) {
      const indices = [...new Set(pages.filter((p) => p.docId === docId).map((p) => p.sourceIndex))]
      const copies = await outDoc.copyPages(doc, indices)
      indices.forEach((srcIdx, i) => copied.set(`${docId}:${srcIdx}`, copies[i]))
    }
    const placed = new Map<string, PDFPage>() // pageId -> placed page
    for (const desc of pages) {
      const page = copied.get(`${desc.docId}:${desc.sourceIndex}`)
      if (!page) continue
      outDoc.addPage(page)
      page.setRotation(degrees(totalRotation(desc)))
      placed.set(desc.id, page)
    }
    pageFor = (desc) => {
      const p = placed.get(desc.id)
      if (!p) throw new Error(`Page ${desc.id} was not copied`)
      return p
    }
  }

  // TRUE redaction: replace each redacted page with a raster (black boxes burned
  // in) so covered content is permanently removed, then remap that page's other
  // edits into the raster's coordinate space.
  const rasterized = new Map<string, { page: PDFPage; heightPt: number }>()
  if (anyRedactions && input.rasterizePage) {
    for (const desc of pages) {
      const redactRects = (edits[desc.id] ?? [])
        .filter((e): e is Extract<Edit, { type: 'redact' }> => e.type === 'redact')
        .map((e) => e.rect)
      if (redactRects.length === 0) continue
      const rot = totalRotation(desc)
      const raster = await input.rasterizePage(desc.docId, desc.sourceIndex, rot, 200, {
        redactRects,
        formValues,
      })
      const oldPage = pageFor(desc)
      const idx = outDoc.getPages().indexOf(oldPage)
      if (idx < 0) continue
      outDoc.removePage(idx)
      const newPage = outDoc.insertPage(idx, [raster.widthPt, raster.heightPt])
      const img = await outDoc.embedJpg(raster.jpeg)
      newPage.drawImage(img, { x: 0, y: 0, width: raster.widthPt, height: raster.heightPt })
      rasterized.set(desc.id, { page: newPage, heightPt: raster.heightPt })
    }
    warnings.push('Pages with redactions were converted to images (their text is no longer selectable).')
  } else if (anyRedactions) {
    warnings.push(
      'Redactions were drawn as black boxes only — the covered text is still present in the file.',
    )
  }

  // Draw edits, per page, in layer order.
  const imageCache = new Map<string, ReturnType<PDFDocument['embedPng']>>()
  for (const desc of pages) {
    let list = sortEditsForRender(edits[desc.id] ?? [])
    if (list.length === 0) continue
    let page = pageFor(desc)
    let rot = totalRotation(desc)
    const ras = rasterized.get(desc.id)
    if (ras) {
      // redact boxes are already burned into the raster; everything else remaps
      list = list
        .filter((e) => e.type !== 'redact')
        .map((e) => remapEditToRaster(e, desc, rot, ras.heightPt))
      page = ras.page
      rot = 0
    }
    for (const edit of list) {
      try {
        await drawEdit(outDoc, page, desc, rot, edit, fontFor, imageCache)
      } catch (e) {
        warnings.push(`Could not draw a ${edit.type} edit on page: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  const bytes = await outDoc.save()
  return { bytes, warnings }
}

type Rot = 0 | 90 | 180 | 270

async function drawEdit(
  doc: PDFDocument,
  page: PDFPage,
  desc: PageDescriptor,
  rot: Rot,
  edit: Edit,
  fontFor: (doc: PDFDocument, family: EmbeddableFont | 'Helvetica') => Promise<PDFFont>,
  imageCache: Map<string, ReturnType<PDFDocument['embedPng']>>,
): Promise<void> {
  switch (edit.type) {
    case 'whiteout':
      page.drawRectangle({
        x: edit.rect.x,
        y: edit.rect.y,
        width: edit.rect.w,
        height: edit.rect.h,
        color: toRgb(edit.color),
      })
      return

    // fallback only — with a rasterizePage injected, redacted pages are replaced
    // wholesale and redact edits never reach drawEdit
    case 'redact':
      page.drawRectangle({
        x: edit.rect.x,
        y: edit.rect.y,
        width: edit.rect.w,
        height: edit.rect.h,
        color: rgb(0, 0, 0),
      })
      return

    case 'highlight':
      page.drawRectangle({
        x: edit.rect.x,
        y: edit.rect.y,
        width: edit.rect.w,
        height: edit.rect.h,
        color: toRgb(edit.color),
        opacity: edit.opacity,
        blendMode: BlendMode.Multiply,
      })
      return

    case 'shape':
      drawShape(page, edit)
      return

    case 'ink':
      drawInk(page, desc, edit)
      return

    case 'text':
      await drawTextBox(doc, page, desc, rot, edit, fontFor)
      return

    case 'signature':
      await drawSignature(doc, page, desc, rot, edit, fontFor, imageCache)
      return

    case 'note':
      drawNoteAnnotation(doc, page, desc, rot, edit)
      return
  }
}

function drawShape(page: PDFPage, e: ShapeEdit): void {
  const stroke = toRgb(e.stroke)
  if (e.shape === 'rect' && e.rect) {
    page.drawRectangle({
      x: e.rect.x,
      y: e.rect.y,
      width: e.rect.w,
      height: e.rect.h,
      borderColor: stroke,
      borderWidth: e.strokeWidth,
      color: e.fill ? toRgb(e.fill) : undefined,
    })
  } else if (e.shape === 'ellipse' && e.rect) {
    page.drawEllipse({
      x: e.rect.x + e.rect.w / 2,
      y: e.rect.y + e.rect.h / 2,
      xScale: e.rect.w / 2,
      yScale: e.rect.h / 2,
      borderColor: stroke,
      borderWidth: e.strokeWidth,
      color: e.fill ? toRgb(e.fill) : undefined,
    })
  } else if ((e.shape === 'line' || e.shape === 'arrow') && e.p1 && e.p2) {
    page.drawLine({ start: e.p1, end: e.p2, thickness: e.strokeWidth, color: stroke })
    if (e.shape === 'arrow') {
      const angle = Math.atan2(e.p2.y - e.p1.y, e.p2.x - e.p1.x)
      const len = Math.max(9, e.strokeWidth * 4)
      for (const off of [Math.PI * (5 / 6), -Math.PI * (5 / 6)]) {
        page.drawLine({
          start: e.p2,
          end: {
            x: e.p2.x + len * Math.cos(angle + off),
            y: e.p2.y + len * Math.sin(angle + off),
          },
          thickness: e.strokeWidth,
          color: stroke,
        })
      }
    }
  }
}

/** Smoothed quadratic path through the stroke points. drawSvgPath's y axis points
 *  DOWN from the anchor, so we anchor at the page top-left (0, pageHeight) and
 *  feed y-flipped coordinates. */
function drawInk(page: PDFPage, desc: PageDescriptor, e: InkEdit): void {
  const H = desc.height
  const n = (v: number) => Math.round(v * 100) / 100
  const parts: string[] = []
  for (const stroke of e.points) {
    if (stroke.length === 0) continue
    const pts = stroke.map((p) => ({ x: p.x, y: H - p.y }))
    if (pts.length === 1) {
      parts.push(`M ${n(pts[0].x)} ${n(pts[0].y)} l 0.1 0`)
      continue
    }
    let d = `M ${n(pts[0].x)} ${n(pts[0].y)}`
    for (let i = 1; i < pts.length - 1; i++) {
      const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 }
      d += ` Q ${n(pts[i].x)} ${n(pts[i].y)} ${n(mid.x)} ${n(mid.y)}`
    }
    d += ` L ${n(pts[pts.length - 1].x)} ${n(pts[pts.length - 1].y)}`
    parts.push(d)
  }
  if (parts.length === 0) return
  page.drawSvgPath(parts.join(' '), {
    x: 0,
    y: H,
    borderColor: toRgb(e.stroke),
    borderWidth: e.strokeWidth,
    borderLineCap: 1, // round
  })
}

async function drawTextBox(
  doc: PDFDocument,
  page: PDFPage,
  desc: PageDescriptor,
  rot: Rot,
  e: TextBoxEdit,
  fontFor: (doc: PDFDocument, family: EmbeddableFont | 'Helvetica') => Promise<PDFFont>,
): Promise<void> {
  const font = await fontFor(doc, e.fontFamily)
  const v = userRectToVisual(desc, rot, e.rect)
  const size = e.fontSize
  const lineHeight = TEXT_LINE_HEIGHT * size
  const ascent = font.heightAtSize(size, { descender: false })
  const lines = wrapText(e.text, Math.max(4, v.vw - 2 * TEXT_PADDING), (s) =>
    font.widthOfTextAtSize(s, size),
  )
  const color = toRgb(e.color)
  lines.forEach((line, i) => {
    if (line === '') return
    const anchor = visualToUser(desc, rot, v.vx + TEXT_PADDING, v.vy + TEXT_PADDING + ascent + i * lineHeight)
    page.drawText(line, { x: anchor.x, y: anchor.y, size, font, color, rotate: degrees(rot) })
  })
}

async function drawSignature(
  doc: PDFDocument,
  page: PDFPage,
  desc: PageDescriptor,
  rot: Rot,
  e: SignatureEdit,
  fontFor: (doc: PDFDocument, family: EmbeddableFont | 'Helvetica') => Promise<PDFFont>,
  imageCache: Map<string, ReturnType<PDFDocument['embedPng']>>,
): Promise<void> {
  const v = userRectToVisual(desc, rot, e.rect)
  if (e.source.kind === 'image') {
    let imgPromise = imageCache.get(e.source.pngDataUrl)
    if (!imgPromise) {
      imgPromise = doc.embedPng(e.source.pngDataUrl)
      imageCache.set(e.source.pngDataUrl, imgPromise)
    }
    const img = await imgPromise
    // anchor = visual bottom-left corner; content extends visual-right and visual-up
    const anchor = visualToUser(desc, rot, v.vx, v.vy + v.vh)
    page.drawImage(img, { x: anchor.x, y: anchor.y, width: v.vw, height: v.vh, rotate: degrees(rot) })
  } else {
    const font = await fontFor(doc, e.source.font)
    let size = v.vh * 0.7
    const width = font.widthOfTextAtSize(e.source.text, size)
    const maxW = Math.max(4, v.vw - 4)
    if (width > maxW) size *= maxW / width
    const ascent = font.heightAtSize(size, { descender: false })
    const fullHeight = font.heightAtSize(size)
    const baselineVy = v.vy + (v.vh - fullHeight) / 2 + ascent
    const anchor = visualToUser(desc, rot, v.vx + 2, baselineVy)
    page.drawText(e.source.text, {
      x: anchor.x,
      y: anchor.y,
      size,
      font,
      color: rgb(0.05, 0.05, 0.35),
      rotate: degrees(rot),
    })
  }
}

const NOTE_ICON_SIZE = 18

/** Writes a real /Annots Text (sticky note) annotation so viewers pop it open. */
function drawNoteAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  desc: PageDescriptor,
  rot: Rot,
  e: NoteEdit,
): void {
  const vTL = userToVisual(desc, rot, e.at)
  const uRect = visualRectToUser(desc, rot, {
    vx: vTL.vx,
    vy: vTL.vy,
    vw: NOTE_ICON_SIZE,
    vh: NOTE_ICON_SIZE,
  })
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [uRect.x, uRect.y, uRect.x + uRect.w, uRect.y + uRect.h],
    Contents: PDFHexString.fromText(e.text),
    Name: 'Comment',
    Open: false,
    C: [e.color.r, e.color.g, e.color.b],
    F: 4, // print
    T: PDFHexString.fromText('PDF Editor'),
  })
  const ref = doc.context.register(annot)
  let annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (!annots) {
    annots = doc.context.obj([]) as PDFArray
    page.node.set(PDFName.of('Annots'), annots)
  }
  annots.push(ref)
}

/** Convenience for tests / callers: point helper. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
