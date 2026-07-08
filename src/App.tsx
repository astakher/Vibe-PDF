import { useEffect, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { FileDropZone } from './components/FileDropZone'
import { ThumbnailRail } from './components/ThumbnailRail'
import { DocumentView } from './components/viewer/DocumentView'
import { ExportDialog } from './components/ExportDialog'
import { SignatureDialog } from './components/SignatureDialog'
import { InfoBanner } from './components/InfoBanner'
import { XfaBar } from './components/XfaBar'
import { XfaFormView } from './components/viewer/XfaFormView'
import { redo, undo, useDocStore, useUiStore } from './store'
import { openPdfFromUrl } from './pdf/loadPdf'

export default function App() {
  const loaded = useUiStore((s) => s.loaded)
  const isXfa = useUiStore((s) => s.isXfa)
  const xfaMode = loaded && isXfa
  const [autoLoading, setAutoLoading] = useState(false)

  // ?file= auto-load: sites (e.g. a realtor's form library) can deep-link a PDF
  // straight into the editor. The URL must be same-origin or CORS-enabled.
  useEffect(() => {
    const fileUrl = new URLSearchParams(window.location.search).get('file')
    if (!fileUrl) return
    // Strip the param BEFORE fetching so refresh/back never re-triggers the load
    // (also makes StrictMode's double effect run a no-op the second time).
    window.history.replaceState(null, '', window.location.pathname)
    setAutoLoading(true)
    openPdfFromUrl(fileUrl)
      .catch(() => {
        useUiStore.getState().setNotice({
          kind: 'error',
          message:
            'Could not load that form automatically. Download it from the site, then drag it here.',
        })
      })
      .finally(() => setAutoLoading(false))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
      if (typing) return
      const ui = useUiStore.getState()

      if (e.ctrlKey) {
        if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
          e.preventDefault()
          undo()
        } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
          e.preventDefault()
          redo()
        }
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selectedEditId) {
        e.preventDefault()
        useDocStore.getState().removeEdit(ui.selectedEditId)
        ui.setSelectedEditId(null)
        return
      }
      if (e.key === 'Escape') {
        if (ui.editingEditId) ui.setEditingEditId(null)
        else if (ui.selectedEditId) ui.setSelectedEditId(null)
        else if (ui.tool !== 'select') ui.setTool('select')
        return
      }
      const shortcuts: Record<string, () => void> = {
        v: () => ui.setTool('select'),
        e: () => ui.setTool('edittext'),
        t: () => ui.setTool('text'),
        w: () => ui.setTool('whiteout'),
        h: () => ui.setTool('highlight'),
        d: () => ui.setTool('ink'),
        n: () => ui.setTool('note'),
        s: () => ui.setSignatureDialogOpen(true),
      }
      if (ui.loaded && shortcuts[e.key.toLowerCase()] && !e.metaKey && !e.altKey) {
        shortcuts[e.key.toLowerCase()]()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (xfaMode) {
    return (
      <div className="app xfa-mode">
        <XfaBar />
        <InfoBanner />
        <XfaFormView />
      </div>
    )
  }

  return (
    <div className="app">
      {loaded && <Toolbar />}
      <InfoBanner />
      {loaded ? (
        <div className="workspace">
          <ThumbnailRail />
          <DocumentView />
        </div>
      ) : autoLoading ? (
        <div className="drop-zone">
          <div className="drop-zone-inner">
            <h1>Loading your form…</h1>
            <p>Fetching the PDF — this only takes a moment.</p>
          </div>
        </div>
      ) : (
        <FileDropZone />
      )}
      <ExportDialog />
      <SignatureDialog />
    </div>
  )
}
