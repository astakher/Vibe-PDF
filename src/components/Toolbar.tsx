import { useRef } from 'react'
import { openPdfFile, mergePdfFile } from '../pdf/loadPdf'
import { redo, undo, useDocStore, useUiStore, type Tool } from '../store'
import { hexToRgb, rgbToHex } from '../utils/color'
import type { FontFamily } from '../model/types'

const TOOLS: { key: Tool; label: string; title: string; wide?: boolean }[] = [
  { key: 'select', label: '↖ Select', title: 'Select / move (V or Esc)', wide: true },
  { key: 'edittext', label: 'Edit text', title: 'Edit existing text — click a line (E)', wide: true },
  { key: 'text', label: 'T', title: 'Add text (T)' },
  { key: 'whiteout', label: '▭', title: 'Whiteout — cover content, then type over it (W)' },
  { key: 'redact', label: '█', title: 'Redact — permanently remove content (page becomes an image on download)' },
  { key: 'highlight', label: '🖍', title: 'Highlight (H)' },
  { key: 'rect', label: '□', title: 'Rectangle' },
  { key: 'ellipse', label: '○', title: 'Ellipse' },
  { key: 'line', label: '∕', title: 'Line' },
  { key: 'arrow', label: '↗', title: 'Arrow' },
  { key: 'ink', label: '✎', title: 'Draw freehand (D) — Esc returns to Select' },
  { key: 'note', label: '💬', title: 'Sticky note (N)' },
]

const FONT_FAMILIES: { key: FontFamily; label: string }[] = [
  { key: 'NotoSans', label: 'Noto Sans' },
  { key: 'NotoSansBold', label: 'Noto Sans Bold' },
  { key: 'Helvetica', label: 'Helvetica' },
]

export function Toolbar() {
  const inputRef = useRef<HTMLInputElement>(null)
  const mergeRef = useRef<HTMLInputElement>(null)
  const loaded = useUiStore((s) => s.loaded)
  const fileName = useUiStore((s) => s.fileName)
  const zoom = useUiStore((s) => s.zoom)
  const setZoom = useUiStore((s) => s.setZoom)
  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const toolOptions = useUiStore((s) => s.toolOptions)
  const setToolOptions = useUiStore((s) => s.setToolOptions)
  const currentPageIndex = useUiStore((s) => s.currentPageIndex)
  const pageCount = useDocStore((s) => s.pages.length)

  const showFontOptions = tool === 'text'
  const showStrokeOptions = ['rect', 'ellipse', 'line', 'arrow', 'ink'].includes(tool)
  const showColor = showFontOptions || showStrokeOptions

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="btn" onClick={() => inputRef.current?.click()} title="Open a PDF file">
          Open
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              openPdfFile(f).catch((err) =>
                useUiStore.getState().setNotice({
                  kind: 'error',
                  message: err instanceof Error ? err.message : String(err),
                }),
              )
            }
            e.target.value = ''
          }}
        />
        {loaded && (
          <>
            <button className="btn" onClick={() => mergeRef.current?.click()} title="Append another PDF's pages">
              Merge
            </button>
            <input
              ref={mergeRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                if (files.length) {
                  ;(async () => {
                    for (const f of files) await mergePdfFile(f)
                  })().catch((err) =>
                    useUiStore.getState().setNotice({
                      kind: 'error',
                      message: err instanceof Error ? err.message : String(err),
                    }),
                  )
                }
                e.target.value = ''
              }}
            />
          </>
        )}
        {fileName && <span className="file-name" title={fileName}>{fileName}</span>}
      </div>

      {loaded && (
        <>
          <div className="toolbar-group">
            {TOOLS.map((t) => (
              <button
                key={t.key}
                className={`btn${t.wide ? '' : ' icon'}${tool === t.key ? ' active' : ''}`}
                title={t.title}
                onClick={() => setTool(t.key)}
              >
                {t.label}
              </button>
            ))}
            <button
              className={`btn${tool === 'signature' ? ' active' : ''}`}
              title="Add a signature (S)"
              onClick={() => useUiStore.getState().setSignatureDialogOpen(true)}
            >
              Sign
            </button>
          </div>

          {showColor && (
            <div className="toolbar-group">
              <input
                type="color"
                className="color-input"
                title="Color"
                value={rgbToHex(toolOptions.color)}
                onChange={(e) => setToolOptions({ color: hexToRgb(e.target.value) })}
              />
              {showFontOptions && (
                <>
                  <select
                    className="select-input"
                    title="Font"
                    value={toolOptions.fontFamily}
                    onChange={(e) => setToolOptions({ fontFamily: e.target.value as FontFamily })}
                  >
                    {FONT_FAMILIES.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                  <select
                    className="select-input"
                    title="Font size"
                    value={toolOptions.fontSize}
                    onChange={(e) => setToolOptions({ fontSize: Number(e.target.value) })}
                  >
                    {[8, 10, 12, 14, 18, 24, 36, 48].map((s) => (
                      <option key={s} value={s}>{s} pt</option>
                    ))}
                  </select>
                </>
              )}
              {showStrokeOptions && (
                <select
                  className="select-input"
                  title="Stroke width"
                  value={toolOptions.strokeWidth}
                  onChange={(e) => setToolOptions({ strokeWidth: Number(e.target.value) })}
                >
                  {[1, 2, 3, 5, 8].map((s) => (
                    <option key={s} value={s}>{s} pt</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="toolbar-group">
            <button className="btn icon" onClick={() => undo()} title="Undo (Ctrl+Z)">↩</button>
            <button className="btn icon" onClick={() => redo()} title="Redo (Ctrl+Y)">↪</button>
          </div>

          <div className="toolbar-group">
            <span className="page-indicator">
              {Math.min(currentPageIndex + 1, pageCount)} / {pageCount}
            </span>
            <button className="btn icon" onClick={() => setZoom(zoom / 1.2)} title="Zoom out">−</button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="btn icon" onClick={() => setZoom(zoom * 1.2)} title="Zoom in">+</button>
          </div>

          <div className="toolbar-group toolbar-right">
            <button
              className="btn"
              title="Print the edited PDF"
              onClick={() => {
                import('../pdf/exportDownload')
                  .then(({ printPdf }) => printPdf())
                  .catch((err) =>
                    useUiStore.getState().setNotice({
                      kind: 'error',
                      message: err instanceof Error ? err.message : String(err),
                    }),
                  )
              }}
            >
              Print
            </button>
            <button
              className="btn primary"
              onClick={() => useUiStore.getState().setExportDialogOpen(true)}
              title="Download the edited PDF"
            >
              Download
            </button>
          </div>
        </>
      )}
    </div>
  )
}
