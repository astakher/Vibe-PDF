import { useRef, useState, type DragEvent } from 'react'
import { mergePdfFile, openPdfFile } from '../pdf/loadPdf'

const isPdf = (f: File) => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'

export function FileDropZone() {
  const openRef = useRef<HTMLInputElement>(null)
  const mergeRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Open the first file, append the rest — works for a single file or a merge. */
  const load = async (files: File[]) => {
    const pdfs = files.filter(isPdf)
    if (pdfs.length === 0) {
      setError('Please choose a PDF file.')
      return
    }
    setError(null)
    try {
      await openPdfFile(pdfs[0])
      for (const f of pdfs.slice(1)) await mergePdfFile(f)
    } catch (e) {
      setError(`Could not open this PDF: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void load([...e.dataTransfer.files])
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
        <h1>Edit PDFs, beautifully.</h1>
        <p>
          Fill forms, sign, edit text, redact, split, compress, and organize pages — entirely in
          your browser. Your files never leave this device.
        </p>
        <div className="drop-zone-actions">
          <button className="btn primary" onClick={() => openRef.current?.click()}>
            Open a PDF
          </button>
          <button className="btn" onClick={() => mergeRef.current?.click()}>
            Merge PDFs
          </button>
        </div>
        <p className="hint">or drag &amp; drop one or more files anywhere here</p>
        {error && <p className="error">{error}</p>}
        <input
          ref={openRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            void load([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        <input
          ref={mergeRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            void load([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
