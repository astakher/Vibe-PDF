import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { nanoid } from 'nanoid'
import type { PageViewport } from '../../pdf/pdfjs'
import type { Edit, PageDescriptor, Point } from '../../model/types'
import { cssPointToPdf, cssRectToPdf, type CssRect } from '../../pdf/coords'
import { TEXT_LINE_HEIGHT, TEXT_PADDING } from '../../pdf/drawHelpers'
import { useDocStore, useUiStore, type Tool } from '../../store'
import { rgbCss } from '../../utils/color'

const DRAG_TOOLS: Tool[] = ['whiteout', 'highlight', 'rect', 'ellipse', 'line', 'arrow', 'ink']

/** Captures pointer input for the active drawing tool on one page. */
export function InteractionLayer({
  desc,
  viewport,
}: {
  desc: PageDescriptor
  viewport: PageViewport
}) {
  const tool = useUiStore((s) => s.tool)
  const layerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null)
  const inkPoints = useRef<{ x: number; y: number }[]>([])

  if (tool === 'select') return null

  const local = (e: ReactPointerEvent): { x: number; y: number } => {
    const r = layerRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const nextZ = (pageId: string) => (useDocStore.getState().edits[pageId]?.length ?? 0)

  const addAndSelect = (edit: Edit, opts?: { keepTool?: boolean; startEditing?: boolean }) => {
    useDocStore.getState().addEdit(edit)
    const ui = useUiStore.getState()
    if (!opts?.keepTool) ui.setTool('select')
    ui.setSelectedEditId(edit.id)
    if (opts?.startEditing) ui.setEditingEditId(edit.id)
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    const p = local(e)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (DRAG_TOOLS.includes(tool)) {
      setDrag({ start: p, current: p })
      if (tool === 'ink') inkPoints.current = [p]
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const p = local(e)
    if (tool === 'ink') {
      const last = inkPoints.current[inkPoints.current.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) > 1.5) inkPoints.current.push(p)
    }
    setDrag((d) => (d ? { ...d, current: p } : d))
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const p = local(e)
    const { toolOptions, pendingSignature } = useUiStore.getState()
    const base = { id: nanoid(8), pageId: desc.id, z: nextZ(desc.id) }

    if (drag && DRAG_TOOLS.includes(tool)) {
      const cssRect: CssRect = {
        left: Math.min(drag.start.x, p.x),
        top: Math.min(drag.start.y, p.y),
        width: Math.abs(p.x - drag.start.x),
        height: Math.abs(p.y - drag.start.y),
      }
      setDrag(null)
      const bigEnough = cssRect.width > 3 || cssRect.height > 3
      if (tool === 'ink') {
        const pts = inkPoints.current
        inkPoints.current = []
        if (pts.length > 1) {
          addAndSelect(
            {
              ...base,
              type: 'ink',
              points: [pts.map((q) => cssPointToPdf(viewport, q.x, q.y))],
              stroke: toolOptions.color,
              strokeWidth: toolOptions.strokeWidth,
            },
            { keepTool: true },
          )
        }
        return
      }
      if (!bigEnough) return
      const rect = cssRectToPdf(viewport, cssRect)
      if (tool === 'whiteout') {
        addAndSelect({ ...base, type: 'whiteout', rect, color: { r: 1, g: 1, b: 1 } }, { keepTool: true })
      } else if (tool === 'highlight') {
        addAndSelect(
          { ...base, type: 'highlight', rect, color: toolOptions.highlightColor, opacity: 0.4 },
          { keepTool: true },
        )
      } else if (tool === 'rect' || tool === 'ellipse') {
        addAndSelect(
          {
            ...base,
            type: 'shape',
            shape: tool,
            rect,
            stroke: toolOptions.color,
            strokeWidth: toolOptions.strokeWidth,
          },
          { keepTool: true },
        )
      } else if (tool === 'line' || tool === 'arrow') {
        const p1 = cssPointToPdf(viewport, drag.start.x, drag.start.y)
        const p2 = cssPointToPdf(viewport, p.x, p.y)
        addAndSelect(
          { ...base, type: 'shape', shape: tool, p1, p2, stroke: toolOptions.color, strokeWidth: toolOptions.strokeWidth },
          { keepTool: true },
        )
      }
      return
    }

    // click tools
    if (tool === 'text') {
      const heightCss = (toolOptions.fontSize * TEXT_LINE_HEIGHT + 2 * TEXT_PADDING) * viewport.scale + 2
      const rect = cssRectToPdf(viewport, { left: p.x, top: p.y, width: 220 * viewport.scale, height: heightCss })
      addAndSelect(
        {
          ...base,
          type: 'text',
          rect,
          text: '',
          fontFamily: toolOptions.fontFamily,
          fontSize: toolOptions.fontSize,
          color: toolOptions.color,
        },
        { startEditing: true },
      )
    } else if (tool === 'note') {
      const at: Point = cssPointToPdf(viewport, p.x, p.y)
      addAndSelect({ ...base, type: 'note', at, text: '', color: { r: 1, g: 0.85, b: 0.2 } }, { startEditing: true })
    } else if (tool === 'signature' && pendingSignature) {
      const wCss = Math.min(220 * viewport.scale, viewport.width * 0.5)
      const hCss = wCss / pendingSignature.aspect
      const rect = cssRectToPdf(viewport, { left: p.x - wCss / 2, top: p.y - hCss / 2, width: wCss, height: hCss })
      addAndSelect({ ...base, type: 'signature', rect, source: pendingSignature.source })
      useUiStore.getState().setPendingSignature(null)
    }
  }

  const { toolOptions } = useUiStore.getState()

  return (
    <div
      ref={layerRef}
      className={`interaction-layer tool-${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {drag && tool !== 'ink' && tool !== 'line' && tool !== 'arrow' && (
        <div
          className={`rubber-band${tool === 'highlight' ? ' rb-highlight' : ''}${tool === 'whiteout' ? ' rb-whiteout' : ''}`}
          style={{
            left: Math.min(drag.start.x, drag.current.x),
            top: Math.min(drag.start.y, drag.current.y),
            width: Math.abs(drag.current.x - drag.start.x),
            height: Math.abs(drag.current.y - drag.start.y),
            borderRadius: tool === 'ellipse' ? '50%' : 0,
          }}
        />
      )}
      {drag && (tool === 'line' || tool === 'arrow') && (
        <svg className="preview-svg">
          <line
            x1={drag.start.x}
            y1={drag.start.y}
            x2={drag.current.x}
            y2={drag.current.y}
            stroke={rgbCss(toolOptions.color)}
            strokeWidth={toolOptions.strokeWidth * viewport.scale}
          />
        </svg>
      )}
      {drag && tool === 'ink' && (
        <svg className="preview-svg">
          <polyline
            points={inkPoints.current.map((q) => `${q.x},${q.y}`).join(' ')}
            fill="none"
            stroke={rgbCss(toolOptions.color)}
            strokeWidth={toolOptions.strokeWidth * viewport.scale}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
}
