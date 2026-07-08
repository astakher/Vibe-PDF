import { getDocumentBytes, getDocumentProxy } from './registry'
import { downloadBytes } from './exportDownload'
import { useUiStore } from '../store'

/**
 * Export/print a filled XFA form via pdf.js's own save path (pdf-lib can't handle
 * XFA). saveDocument() serializes the annotationStorage — including XFA datasets —
 * back into the PDF so a viewer like Acrobat shows the typed values.
 *
 * pdf.js's saveDocument() throws ("Cannot read properties of null") when the
 * annotationStorage is empty, so when nothing has been filled we hand back the
 * original bytes unchanged (a blank copy) instead.
 */

async function savedBytes(): Promise<Uint8Array> {
  const { primaryDocId } = useUiStore.getState()
  if (!primaryDocId) throw new Error('No document loaded')
  const proxy = getDocumentProxy(primaryDocId)
  if (proxy.annotationStorage.size === 0) return getDocumentBytes(primaryDocId)
  return proxy.saveDocument()
}

function baseName(): string {
  const { fileName } = useUiStore.getState()
  return (fileName ?? 'form.pdf').replace(/\.pdf$/i, '')
}

export async function exportXfaDownload(): Promise<void> {
  const bytes = await savedBytes()
  downloadBytes(bytes, `${baseName()}-filled.pdf`)
}

/**
 * Print the on-screen (pdf.js-rendered) XFA form, NOT a regenerated PDF: browsers
 * can't render XFA, so printing saved bytes shows Adobe's "Please wait" placeholder.
 * Printing the live HTML captures the real form + typed values. Print-only CSS
 * (.xfa-mode @media print in app.css) hides the app chrome and paginates the pages.
 */
export async function printXfa(): Promise<void> {
  window.print()
}
