import { useDocStore, useUiStore } from '../store'
import { getDocumentBytes } from './registry'
import { getFontBytes } from './fonts'
import { exportPdf } from './exporter'
import { rasterizePage } from './rasterize'

export type BuildOptions = {
  flattenForm: boolean
  /** restrict to these pageIds (extract/split); default: all pages */
  pageIds?: string[]
}

/** Core: current document state → finished PDF bytes. */
export async function buildPdfBytes(opts: BuildOptions): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const { pages, edits, formValues } = useDocStore.getState()
  const { primaryDocId } = useUiStore.getState()
  if (!primaryDocId) throw new Error('No document loaded')

  const included = opts.pageIds ? pages.filter((p) => opts.pageIds!.includes(p.id)) : pages
  if (included.length === 0) throw new Error('No pages selected')

  return exportPdf({
    primaryDocId,
    pages: included,
    edits,
    formValues,
    flattenForm: opts.flattenForm,
    getBytes: getDocumentBytes,
    getFontBytes,
    rasterizePage: (docId, sourceIndex, rotation, dpi, o) =>
      rasterizePage(docId, sourceIndex, rotation, dpi, { redactRects: o.redactRects, formValues: o.formValues }),
  })
}

export function currentBaseName(): string {
  const { fileName } = useUiStore.getState()
  return (fileName ?? 'document.pdf').replace(/\.pdf$/i, '')
}

export type DownloadOptions = BuildOptions & {
  /** exact output name (without .pdf); falls back to `<original>-edited` */
  fileName?: string
}

export async function exportAndDownload(opts: DownloadOptions): Promise<string[]> {
  const { bytes, warnings } = await buildPdfBytes(opts)
  const name = (opts.fileName?.trim() || `${currentBaseName()}-edited`).replace(/\.pdf$/i, '')
  downloadBytes(bytes, `${name}.pdf`)
  return warnings
}

/** Export (forms flattened so values print correctly) → hidden iframe → print dialog. */
export async function printPdf(): Promise<string[]> {
  const { bytes, warnings } = await buildPdfBytes({ flattenForm: true })
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '1px'
  iframe.style.height = '1px'
  iframe.style.opacity = '0'
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
      // fallback cleanup if afterprint never fires (some viewers)
      setTimeout(cleanup, 120000)
    } catch {
      cleanup()
    }
  }
  document.body.appendChild(iframe)
  return warnings
}

export function downloadBytes(bytes: Uint8Array, name: string, mime = 'application/pdf'): void {
  const blob = new Blob([bytes as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
