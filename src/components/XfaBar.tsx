import { useRef, useState } from 'react'
import { openPdfFile } from '../pdf/loadPdf'
import { exportXfaDownload, printXfa } from '../pdf/exportXfa'
import { useUiStore } from '../store'

/** Slim toolbar for the experimental XFA form mode: home, open, zoom, print, fill-download. */
export function XfaBar() {
  const inputRef = useRef<HTMLInputElement>(null)
  const fileName = useUiStore((s) => s.fileName)
  const zoom = useUiStore((s) => s.zoom)
  const setZoom = useUiStore((s) => s.setZoom)
  const [busy, setBusy] = useState<null | 'download' | 'print'>(null)
  const [error, setError] = useState<string | null>(null)

  const goHome = () => {
    // return to the empty landing state (drops the current doc)
    window.location.href = window.location.pathname + window.location.search
  }

  const run = async (kind: 'download' | 'print', fn: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="btn" onClick={goHome} title="Back to start">↖ Home</button>
        <button className="btn" onClick={() => inputRef.current?.click()} title="Open another PDF">Open</button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              openPdfFile(f).catch((err) =>
                setError(err instanceof Error ? err.message : String(err)),
              )
            }
            e.target.value = ''
          }}
        />
        {fileName && <span className="file-name" title={fileName}>{fileName}</span>}
        <span className="xfa-tag">XFA form (experimental)</span>
      </div>

      <div className="toolbar-group">
        <button className="btn icon" onClick={() => setZoom(zoom / 1.2)} title="Zoom out">−</button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="btn icon" onClick={() => setZoom(zoom * 1.2)} title="Zoom in">+</button>
      </div>

      <div className="toolbar-group toolbar-right">
        {error && <span className="error" title={error}>{error}</span>}
        <button
          className="btn"
          disabled={busy !== null}
          title="Print the form"
          onClick={() => run('print', printXfa)}
        >
          {busy === 'print' ? 'Working…' : 'Print'}
        </button>
        <button
          className="btn primary"
          disabled={busy !== null}
          title="Download the filled form"
          onClick={() => run('download', exportXfaDownload)}
        >
          {busy === 'download' ? 'Working…' : 'Download filled form'}
        </button>
      </div>
    </div>
  )
}
