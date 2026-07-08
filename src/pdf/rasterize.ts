import { PDFDocument } from 'pdf-lib'
import { pdfjs } from './pdfjs'
import { getDocumentProxy, getPageProxy } from './registry'
import { userToVisual } from './drawHelpers'
import type { FormValue, Rect, Rotation } from '../model/types'

/**
 * Browser-only rasterization (pdf.js + canvas). Used for:
 * - true redaction: redacted pages are re-rendered as images with the black
 *   boxes burned in, so covered content is permanently removed
 * - Moderate/Strong compression: every page re-rendered as JPEG
 */

export type RasterizedPage = { jpeg: Uint8Array; widthPt: number; heightPt: number }

export async function rasterizePage(
  docId: string,
  sourceIndex: number,
  rotation: Rotation,
  dpi: number,
  opts?: { redactRects?: Rect[]; quality?: number; formValues?: Record<string, FormValue> },
): Promise<RasterizedPage> {
  const page = await getPageProxy(docId, sourceIndex)
  const scale = dpi / 72
  const viewport = page.getViewport({ scale, rotation })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)

  // The raster renders from the ORIGINAL bytes — user-typed form values only
  // appear if injected into pdf.js annotationStorage before rendering.
  if (opts?.formValues && Object.keys(opts.formValues).length) {
    await seedAnnotationStorage(docId, opts.formValues)
  }
  await page.render({ canvas, viewport, annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE }).promise

  if (opts?.redactRects?.length) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    ctx.fillStyle = '#000'
    const [x1, y1] = page.view
    const dims = { width: page.view[2] - x1, height: page.view[3] - y1 }
    for (const r of opts.redactRects) {
      // user-space rect → visual (top-left, points) → canvas px
      const a = userToVisual(dims, rotation, { x: r.x, y: r.y })
      const b = userToVisual(dims, rotation, { x: r.x + r.w, y: r.y + r.h })
      const left = Math.min(a.vx, b.vx) * scale
      const top = Math.min(a.vy, b.vy) * scale
      ctx.fillRect(left, top, Math.abs(b.vx - a.vx) * scale, Math.abs(b.vy - a.vy) * scale)
    }
  }

  const jpeg = await canvasToJpeg(canvas, opts?.quality ?? 0.85)
  return { jpeg, widthPt: viewport.width / scale, heightPt: viewport.height / scale }
}

/**
 * Re-render EVERY page of a finished PDF as JPEG at the given dpi/quality and
 * rebuild the document (Moderate/Strong compression). Text becomes an image.
 */
export async function rasterizeExisting(bytes: Uint8Array, dpi: number, quality: number): Promise<Uint8Array> {
  const loadingTask = pdfjs.getDocument({ data: bytes.slice() })
  const proxy = await loadingTask.promise
  try {
    const outDoc = await PDFDocument.create()
    const scale = dpi / 72
    for (let i = 1; i <= proxy.numPages; i++) {
      const page = await proxy.getPage(i)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      const jpeg = await canvasToJpeg(canvas, quality)
      const img = await outDoc.embedJpg(jpeg)
      const w = viewport.width / scale
      const h = viewport.height / scale
      const outPage = outDoc.addPage([w, h])
      outPage.drawImage(img, { x: 0, y: 0, width: w, height: h })
      canvas.width = 0 // release backing store promptly on large docs
      page.cleanup()
    }
    return await outDoc.save()
  } finally {
    await loadingTask.destroy().catch(() => {})
  }
}

/** Best-effort mapping of our formValues into pdf.js annotationStorage. */
async function seedAnnotationStorage(docId: string, formValues: Record<string, FormValue>): Promise<void> {
  const proxy = getDocumentProxy(docId)
  const fieldObjects = (await proxy.getFieldObjects()) as Record<
    string,
    Array<{ id: string; type?: string; exportValues?: string | string[] }>
  > | null
  if (!fieldObjects) return
  const storage = proxy.annotationStorage
  for (const [name, value] of Object.entries(formValues)) {
    const objs = fieldObjects[name]
    if (!objs) continue
    for (const obj of objs) {
      switch (obj.type) {
        case 'text':
        case 'combobox':
        case 'listbox':
          storage.setValue(obj.id, { value: Array.isArray(value) ? value : String(value) })
          break
        case 'checkbox':
          storage.setValue(obj.id, { value: value === true })
          break
        case 'radiobutton': {
          const ev = Array.isArray(obj.exportValues) ? obj.exportValues[0] : obj.exportValues
          storage.setValue(obj.id, { value: typeof value === 'string' && value !== '' && value === ev })
          break
        }
      }
    }
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('canvas.toBlob failed'))
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject)
      },
      'image/jpeg',
      quality,
    )
  })
}
