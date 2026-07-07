import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { CssRect } from '../../pdf/coords'
import { pauseHistory, resumeHistory } from '../../store'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

type Props = {
  rect: CssRect
  selected: boolean
  resizable?: boolean
  /** keep width/height ratio while resizing (signatures/images) */
  keepAspect?: boolean
  minSize?: number
  onSelect: () => void
  /** live geometry updates during a gesture (history is paused for the gesture) */
  onChange: (r: CssRect) => void
  onDoubleClick?: () => void
  children?: ReactNode
  className?: string
}

/**
 * Shared move/resize chrome for any edit. Operates purely in CSS px; parents
 * convert to PDF space. A whole gesture = one undo step (history paused).
 */
export function TransformBox({
  rect,
  selected,
  resizable = true,
  keepAspect = false,
  minSize = 8,
  onSelect,
  onChange,
  onDoubleClick,
  children,
  className,
}: Props) {
  const gesture = useRef<{ handle: Handle | 'move'; startX: number; startY: number; start: CssRect } | null>(null)

  const begin = (e: ReactPointerEvent, handle: Handle | 'move') => {
    if (e.button !== 0) return
    e.stopPropagation()
    onSelect()
    gesture.current = { handle, startX: e.clientX, startY: e.clientY, start: rect }
    pauseHistory()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
  }

  const move = (e: ReactPointerEvent) => {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    onChange(applyGesture(g.start, g.handle, dx, dy, minSize, keepAspect))
  }

  const end = (e: ReactPointerEvent) => {
    if (!gesture.current) return
    gesture.current = null
    resumeHistory()
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }

  return (
    <div
      className={`transform-box${selected ? ' selected' : ''}${className ? ` ${className}` : ''}`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      onPointerDown={(e) => begin(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onDoubleClick}
    >
      {children}
      {selected &&
        resizable &&
        HANDLES.map((h) => (
          <div
            key={h}
            className={`tb-handle tb-${h}`}
            onPointerDown={(e) => begin(e, h)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        ))}
    </div>
  )
}

function applyGesture(
  start: CssRect,
  handle: Handle | 'move',
  dx: number,
  dy: number,
  minSize: number,
  keepAspect: boolean,
): CssRect {
  if (handle === 'move') {
    return { ...start, left: start.left + dx, top: start.top + dy }
  }
  let { left, top, width, height } = start
  const right = left + width
  const bottom = top + height

  if (handle.includes('w')) {
    left = Math.min(left + dx, right - minSize)
    width = right - left
  }
  if (handle.includes('e')) {
    width = Math.max(minSize, start.width + dx)
  }
  if (handle.includes('n')) {
    top = Math.min(top + dy, bottom - minSize)
    height = bottom - top
  }
  if (handle.includes('s')) {
    height = Math.max(minSize, start.height + dy)
  }

  if (keepAspect && start.width > 0 && start.height > 0) {
    const ratio = start.width / start.height
    if (handle === 'e' || handle === 'w') {
      height = width / ratio
      if (handle.includes('n')) top = bottom - height
    } else {
      width = height * ratio
      if (handle.includes('w')) left = right - width
    }
  }
  return { left, top, width, height }
}
