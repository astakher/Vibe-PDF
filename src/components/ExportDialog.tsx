import { useState } from 'react'
import { parsePageRange } from '../utils/pageRange'
import { useDocStore, useUiStore } from '../store'

export function ExportDialog() {
  const open = useUiStore((s) => s.exportDialogOpen)
  const setOpen = useUiStore((s) => s.setExportDialogOpen)
  const [flatten, setFlatten] = useState(false)
  const [pageRange, setPageRange] = useState('')
  const [busy, setBusy] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const download = async (extract: boolean) => {
    setBusy(true)
    setError(null)
    setWarnings([])
    try {
      let pageIds: string[] | undefined
      if (extract) {
        const pages = useDocStore.getState().pages
        const indices = parsePageRange(pageRange, pages.length)
        if (!indices) {
          setError('Invalid page range. Use e.g. "1-3, 5".')
          setBusy(false)
          return
        }
        pageIds = indices.map((i) => pages[i].id)
      }
      // lazy-load pdf-lib + fontkit only when actually exporting
      const { exportAndDownload } = await import('../pdf/exportDownload')
      const w = await exportAndDownload({
        flattenForm: flatten,
        pageIds,
        fileNameSuffix: extract ? '-extracted' : '-edited',
      })
      setWarnings(w)
      if (w.length === 0) setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onClick={() => !busy && setOpen(false)}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Download PDF</h2>
        <label className="checkbox-row">
          <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
          Flatten form fields (values become permanent, non-editable)
        </label>
        <div className="dialog-actions">
          <button className="btn primary" disabled={busy} onClick={() => void download(false)}>
            {busy ? 'Working…' : 'Download edited PDF'}
          </button>
        </div>
        <hr />
        <div className="extract-row">
          <input
            type="text"
            className="text-input"
            placeholder="Pages, e.g. 1-3, 5"
            value={pageRange}
            onChange={(e) => setPageRange(e.target.value)}
          />
          <button className="btn" disabled={busy || pageRange.trim() === ''} onClick={() => void download(true)}>
            Extract pages
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {warnings.map((w, i) => (
          <p key={i} className="warning">{w}</p>
        ))}
        <button className="dialog-close" onClick={() => setOpen(false)} title="Close">✕</button>
      </div>
    </div>
  )
}
