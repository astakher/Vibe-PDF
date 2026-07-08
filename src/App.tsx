import { useEffect } from 'react'
import { Toolbar } from './components/Toolbar'
import { FileDropZone } from './components/FileDropZone'
import { ThumbnailRail } from './components/ThumbnailRail'
import { DocumentView } from './components/viewer/DocumentView'
import { ExportDialog } from './components/ExportDialog'
import { SignatureDialog } from './components/SignatureDialog'
import { InfoBanner } from './components/InfoBanner'
import { redo, undo, useDocStore, useUiStore } from './store'

export default function App() {
  const loaded = useUiStore((s) => s.loaded)

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

  return (
    <div className="app">
      {loaded && <Toolbar />}
      <InfoBanner />
      {loaded ? (
        <div className="workspace">
          <ThumbnailRail />
          <DocumentView />
        </div>
      ) : (
        <FileDropZone />
      )}
      <ExportDialog />
      <SignatureDialog />
    </div>
  )
}
