import { useEffect, useRef } from 'react'
import type { PageViewport } from '../../pdf/pdfjs'
import type {
  Edit,
  InkEdit,
  NoteEdit,
  PageDescriptor,
  Point,
  ShapeEdit,
  SignatureEdit,
  TextBoxEdit,
} from '../../model/types'
import { cssRectToPdf, pdfPointToCss, pdfRectToCss, type CssRect } from '../../pdf/coords'
import { TEXT_LINE_HEIGHT, TEXT_PADDING } from '../../pdf/drawHelpers'
import { cssFontFamily } from '../../pdf/fonts'
import { pauseHistory, resumeHistory, useDocStore, useUiStore } from '../../store'
import { rgbCss } from '../../utils/color'
import { TransformBox } from './TransformBox'

const NOTE_ICON_PT = 18

/**
 * Interactive layer: every edit gets a TransformBox (select/move/resize/delete);
 * text boxes render their textarea here, signatures their image/typed preview,
 * notes their icon + editing popover.
 */
export function EditsHtmlLayer({
  desc,
  edits,
  viewport,
}: {
  desc: PageDescriptor
  edits: Edit[]
  viewport: PageViewport
}) {
  const selectedEditId = useUiStore((s) => s.selectedEditId)
  const tool = useUiStore((s) => s.tool)
  const interactive = tool === 'select'

  return (
    <div className="edits-html" style={{ pointerEvents: 'none' }}>
      {edits.map((e) => (
        <EditBox
          key={e.id}
          desc={desc}
          edit={e}
          viewport={viewport}
          selected={selectedEditId === e.id}
          interactive={interactive}
        />
      ))}
    </div>
  )
}

function boundsOf(edit: Edit, viewport: PageViewport): CssRect {
  switch (edit.type) {
    case 'text':
    case 'whiteout':
    case 'highlight':
    case 'signature':
      return pdfRectToCss(viewport, edit.rect)
    case 'shape': {
      if (edit.rect) return pdfRectToCss(viewport, edit.rect)
      const a = pdfPointToCss(viewport, edit.p1!)
      const b = pdfPointToCss(viewport, edit.p2!)
      return {
        left: Math.min(a.x, b.x) - 4,
        top: Math.min(a.y, b.y) - 4,
        width: Math.abs(b.x - a.x) + 8,
        height: Math.abs(b.y - a.y) + 8,
      }
    }
    case 'ink': {
      const pts = edit.points.flat().map((p) => pdfPointToCss(viewport, p))
      const xs = pts.map((p) => p.x)
      const ys = pts.map((p) => p.y)
      const pad = 4
      return {
        left: Math.min(...xs) - pad,
        top: Math.min(...ys) - pad,
        width: Math.max(...xs) - Math.min(...xs) + 2 * pad,
        height: Math.max(...ys) - Math.min(...ys) + 2 * pad,
      }
    }
    case 'note': {
      const p = pdfPointToCss(viewport, edit.at)
      const s = NOTE_ICON_PT * viewport.scale
      return { left: p.x, top: p.y, width: s, height: s }
    }
  }
}

function EditBox({
  desc,
  edit,
  viewport,
  selected,
  interactive,
}: {
  desc: PageDescriptor
  edit: Edit
  viewport: PageViewport
  selected: boolean
  interactive: boolean
}) {
  const { updateEdit } = useDocStore.getState()
  const setSelected = () => useUiStore.getState().setSelectedEditId(edit.id)
  const rect = boundsOf(edit, viewport)

  const onChange = (r: CssRect) => {
    switch (edit.type) {
      case 'text':
      case 'whiteout':
      case 'highlight':
      case 'signature': {
        updateEdit(edit.id, { rect: cssRectToPdf(viewport, r) })
        return
      }
      case 'shape': {
        if (edit.rect) {
          updateEdit(edit.id, { rect: cssRectToPdf(viewport, r) })
        } else {
          // translate endpoints by the delta of the (padded) bounding box
          const oldPdf = cssRectToPdf(viewport, rect)
          const newPdf = cssRectToPdf(viewport, r)
          const dx = newPdf.x - oldPdf.x
          const dy = newPdf.y - oldPdf.y
          updateEdit(edit.id, {
            p1: { x: edit.p1!.x + dx, y: edit.p1!.y + dy },
            p2: { x: edit.p2!.x + dx, y: edit.p2!.y + dy },
          } as Partial<ShapeEdit>)
        }
        return
      }
      case 'ink': {
        const oldPdf = cssRectToPdf(viewport, rect)
        const newPdf = cssRectToPdf(viewport, r)
        const dx = newPdf.x - oldPdf.x
        const dy = newPdf.y - oldPdf.y
        updateEdit(edit.id, {
          points: edit.points.map((s) => s.map((p) => ({ x: p.x + dx, y: p.y + dy }))),
        } as Partial<InkEdit>)
        return
      }
      case 'note': {
        const oldPdf = cssRectToPdf(viewport, rect)
        const newPdf = cssRectToPdf(viewport, r)
        updateEdit(edit.id, {
          at: { x: edit.at.x + (newPdf.x - oldPdf.x), y: edit.at.y + (newPdf.y - oldPdf.y) },
        } as Partial<NoteEdit>)
        return
      }
    }
  }

  const resizable = edit.type === 'text' || edit.type === 'whiteout' || edit.type === 'highlight' ||
    edit.type === 'signature' || (edit.type === 'shape' && !!edit.rect)

  return (
    <div style={{ pointerEvents: interactive ? 'auto' : 'none' }}>
      <TransformBox
        rect={rect}
        selected={selected}
        resizable={resizable}
        keepAspect={edit.type === 'signature' && edit.source.kind === 'image'}
        onSelect={setSelected}
        onChange={onChange}
        onDoubleClick={
          edit.type === 'text' || edit.type === 'note'
            ? () => useUiStore.getState().setEditingEditId(edit.id)
            : undefined
        }
      >
        {edit.type === 'text' && <TextContent edit={edit} viewport={viewport} />}
        {edit.type === 'signature' && <SignatureContent edit={edit} heightPx={rect.height} />}
        {edit.type === 'note' && <NoteContent edit={edit} desc={desc} />}
      </TransformBox>
    </div>
  )
}

function TextContent({ edit, viewport }: { edit: TextBoxEdit; viewport: PageViewport }) {
  const editing = useUiStore((s) => s.editingEditId === edit.id)
  const ref = useRef<HTMLTextAreaElement>(null)
  const scale = viewport.scale

  useEffect(() => {
    if (editing) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [editing])

  return (
    <textarea
      ref={ref}
      className="text-edit"
      value={edit.text}
      readOnly={!editing}
      spellCheck={false}
      style={{
        fontFamily: cssFontFamily[edit.fontFamily],
        fontSize: edit.fontSize * scale,
        lineHeight: TEXT_LINE_HEIGHT,
        padding: TEXT_PADDING * scale,
        color: rgbCss(edit.color),
        pointerEvents: editing ? 'auto' : 'none',
      }}
      onPointerDown={(e) => {
        if (editing) e.stopPropagation()
      }}
      onFocus={pauseHistory}
      onBlur={() => {
        resumeHistory()
        useUiStore.getState().setEditingEditId(null)
      }}
      onChange={(e) => useDocStore.getState().updateEdit(edit.id, { text: e.target.value })}
    />
  )
}

function SignatureContent({ edit, heightPx }: { edit: SignatureEdit; heightPx: number }) {
  if (edit.source.kind === 'image') {
    return <img className="sig-image" src={edit.source.pngDataUrl} alt="signature" draggable={false} />
  }
  return (
    <div
      className="sig-typed"
      style={{ fontFamily: cssFontFamily[edit.source.font], fontSize: heightPx * 0.55 }}
    >
      {edit.source.text}
    </div>
  )
}

function NoteContent({ edit }: { edit: NoteEdit; desc: PageDescriptor }) {
  const editing = useUiStore((s) => s.editingEditId === edit.id)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  return (
    <>
      <div className="note-icon" style={{ background: rgbCss(edit.color) }} title={edit.text}>
        💬
      </div>
      {editing && (
        <textarea
          ref={ref}
          className="note-popover"
          value={edit.text}
          placeholder="Note text…"
          onPointerDown={(e) => e.stopPropagation()}
          onFocus={pauseHistory}
          onBlur={() => {
            resumeHistory()
            useUiStore.getState().setEditingEditId(null)
          }}
          onChange={(e) => useDocStore.getState().updateEdit(edit.id, { text: e.target.value })}
        />
      )}
    </>
  )
}

export function translatePoint(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy }
}
