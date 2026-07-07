import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Browser only — under node (vitest) pdf.js resolves its worker module itself.
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
}

export { pdfjs }
export type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist'
