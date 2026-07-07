import { useDocStore, useUiStore } from '../store'
import { getDocumentBytes } from './registry'
import { getFontBytes } from './fonts'
import { exportPdf } from './exporter'

export type DownloadOptions = {
  flattenForm: boolean
  /** restrict to these pageIds (extract-pages); default: all pages */
  pageIds?: string[]
  fileNameSuffix?: string
}

export async function exportAndDownload(opts: DownloadOptions): Promise<string[]> {
  const { pages, edits, formValues } = useDocStore.getState()
  const { primaryDocId, fileName } = useUiStore.getState()
  if (!primaryDocId) throw new Error('No document loaded')

  const included = opts.pageIds ? pages.filter((p) => opts.pageIds!.includes(p.id)) : pages
  if (included.length === 0) throw new Error('No pages selected')

  const { bytes, warnings } = await exportPdf({
    primaryDocId,
    pages: included,
    edits,
    formValues,
    flattenForm: opts.flattenForm,
    getBytes: getDocumentBytes,
    getFontBytes,
  })

  const base = (fileName ?? 'document.pdf').replace(/\.pdf$/i, '')
  downloadBytes(bytes, `${base}${opts.fileNameSuffix ?? '-edited'}.pdf`)
  return warnings
}

export function downloadBytes(bytes: Uint8Array, name: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
