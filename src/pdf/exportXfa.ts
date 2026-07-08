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

export async function printXfa(): Promise<void> {
  const bytes = await savedBytes()
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0'
  iframe.dataset.purpose = 'print'
  iframe.src = url
  const cleanup = () => {
    URL.revokeObjectURL(url)
    iframe.remove()
  }
  iframe.onload = () => {
    try {
      iframe.contentWindow?.addEventListener('afterprint', () => setTimeout(cleanup, 1000))
      iframe.contentWindow?.print()
      setTimeout(cleanup, 120000)
    } catch {
      cleanup()
    }
  }
  document.body.appendChild(iframe)
}
