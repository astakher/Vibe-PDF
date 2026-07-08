import { pdfjs, type PDFDocumentProxy, type PDFPageProxy } from './pdfjs'

/**
 * Source-of-truth bytes + pdf.js proxies, kept outside the store (non-serializable, large).
 * pdf.js detaches the buffer passed to getDocument, so we always hand it a copy
 * and keep the original bytes for pdf-lib at export time.
 */
type Entry = { bytes: Uint8Array; proxy: PDFDocumentProxy }

const docs = new Map<string, Entry>()
const pageCache = new Map<string, PDFPageProxy>() // key: `${docId}:${sourceIndex}`

// Standard 14 fonts, copied to public/standard_fonts (served under the app base).
// Without these, pdf.js uses wrong metrics and XFA form labels misalign/overlap.
const standardFontDataUrl = `${import.meta.env.BASE_URL}standard_fonts/`

export async function registerDocument(docId: string, bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // enableXfa only affects XFA (LiveCycle) forms; normal PDFs are unaffected.
  const proxy = await pdfjs.getDocument({ data: bytes.slice(), enableXfa: true, standardFontDataUrl })
    .promise
  docs.set(docId, { bytes, proxy })
  return proxy
}

export function getDocumentBytes(docId: string): Uint8Array {
  const e = docs.get(docId)
  if (!e) throw new Error(`Unknown document: ${docId}`)
  return e.bytes
}

export function getDocumentProxy(docId: string): PDFDocumentProxy {
  const e = docs.get(docId)
  if (!e) throw new Error(`Unknown document: ${docId}`)
  return e.proxy
}

export async function getPageProxy(docId: string, sourceIndex: number): Promise<PDFPageProxy> {
  const key = `${docId}:${sourceIndex}`
  const cached = pageCache.get(key)
  if (cached) return cached
  const page = await getDocumentProxy(docId).getPage(sourceIndex + 1)
  pageCache.set(key, page)
  return page
}

export function registeredDocIds(): string[] {
  return [...docs.keys()]
}

export async function disposeAllDocuments(): Promise<void> {
  pageCache.clear()
  for (const { proxy } of docs.values()) await proxy.loadingTask.destroy().catch(() => {})
  docs.clear()
}
