import { useRef, useState, type DragEvent } from 'react'
import { openPdfFile } from '../pdf/loadPdf'

export function FileDropZone() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = async (file: File | undefined) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Please choose a PDF file.')
      return
    }
    setError(null)
    try {
      await openPdfFile(file)
    } catch (e) {
      setError(`Could not open this PDF: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void open(e.dataTransfer.files[0])
  }

  return (
    <div
      className={`drop-zone${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="drop-zone-inner">
        <h1>PDF Editor</h1>
        <p>Fill forms, sign, add text, annotate, and organize pages — entirely in your browser. Your files never leave this device.</p>
        <button className="btn primary" onClick={() => inputRef.current?.click()}>
          Open a PDF
        </button>
        <p className="hint">or drag &amp; drop a file anywhere here</p>
        {error && <p className="error">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => void open(e.target.files?.[0])}
        />
      </div>
    </div>
  )
}
