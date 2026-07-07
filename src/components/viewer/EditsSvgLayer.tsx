import type { PageViewport } from '../../pdf/pdfjs'
import type { Edit, PageDescriptor } from '../../model/types'
import { sortEditsForRender } from '../../model/types'
import { pdfPointToCss, pdfRectToCss } from '../../pdf/coords'
import { rgbCss } from '../../utils/color'

/**
 * Pure visuals for geometry edits (whiteout, highlight, shapes, ink).
 * Selection/move chrome lives in EditsHtmlLayer; this layer is not interactive.
 */
export function EditsSvgLayer({
  edits,
  viewport,
}: {
  desc: PageDescriptor
  edits: Edit[]
  viewport: PageViewport
}) {
  return (
    <svg
      className="edits-svg"
      width={viewport.width}
      height={viewport.height}
      style={{ pointerEvents: 'none' }}
    >
      {sortEditsForRender(edits).map((e) => (
        <EditShape key={e.id} edit={e} viewport={viewport} />
      ))}
    </svg>
  )
}

function EditShape({ edit, viewport }: { edit: Edit; viewport: PageViewport }) {
  switch (edit.type) {
    case 'whiteout': {
      const r = pdfRectToCss(viewport, edit.rect)
      return <rect x={r.left} y={r.top} width={r.width} height={r.height} fill={rgbCss(edit.color)} />
    }
    case 'highlight': {
      const r = pdfRectToCss(viewport, edit.rect)
      return (
        <rect
          x={r.left}
          y={r.top}
          width={r.width}
          height={r.height}
          fill={rgbCss(edit.color)}
          opacity={edit.opacity}
          style={{ mixBlendMode: 'multiply' }}
        />
      )
    }
    case 'shape': {
      const stroke = rgbCss(edit.stroke)
      const sw = edit.strokeWidth * viewport.scale
      if (edit.shape === 'rect' && edit.rect) {
        const r = pdfRectToCss(viewport, edit.rect)
        return (
          <rect
            x={r.left}
            y={r.top}
            width={r.width}
            height={r.height}
            fill={edit.fill ? rgbCss(edit.fill) : 'none'}
            stroke={stroke}
            strokeWidth={sw}
          />
        )
      }
      if (edit.shape === 'ellipse' && edit.rect) {
        const r = pdfRectToCss(viewport, edit.rect)
        return (
          <ellipse
            cx={r.left + r.width / 2}
            cy={r.top + r.height / 2}
            rx={r.width / 2}
            ry={r.height / 2}
            fill={edit.fill ? rgbCss(edit.fill) : 'none'}
            stroke={stroke}
            strokeWidth={sw}
          />
        )
      }
      if ((edit.shape === 'line' || edit.shape === 'arrow') && edit.p1 && edit.p2) {
        const a = pdfPointToCss(viewport, edit.p1)
        const b = pdfPointToCss(viewport, edit.p2)
        const head =
          edit.shape === 'arrow' ? arrowHead(a, b, Math.max(9, edit.strokeWidth * 4) * viewport.scale) : null
        return (
          <g stroke={stroke} strokeWidth={sw} fill="none" strokeLinecap="round">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            {head && <polyline points={head} />}
          </g>
        )
      }
      return null
    }
    case 'ink': {
      const d = edit.points
        .map((stroke) => {
          const pts = stroke.map((p) => pdfPointToCss(viewport, p))
          if (pts.length === 0) return ''
          if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} l 0.1 0`
          let path = `M ${pts[0].x} ${pts[0].y}`
          for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i].x + pts[i + 1].x) / 2
            const my = (pts[i].y + pts[i + 1].y) / 2
            path += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`
          }
          path += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`
          return path
        })
        .join(' ')
      return (
        <path
          d={d}
          fill="none"
          stroke={rgbCss(edit.stroke)}
          strokeWidth={edit.strokeWidth * viewport.scale}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    }
    default:
      return null
  }
}

function arrowHead(a: { x: number; y: number }, b: { x: number; y: number }, len: number): string {
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  const p = (off: number) => `${b.x + len * Math.cos(angle + off)},${b.y + len * Math.sin(angle + off)}`
  return `${p((Math.PI * 5) / 6)} ${b.x},${b.y} ${p((-Math.PI * 5) / 6)}`
}
