import type { PageViewport } from './pdfjs'
import type { Point, Rect } from '../model/types'

/** Top-left-origin CSS-pixel rect relative to the page element. */
export type CssRect = { left: number; top: number; width: number; height: number }

/**
 * The single conversion boundary between PDF user space (points, bottom-left origin,
 * unrotated) and CSS pixels over the rendered page. The pdf.js PageViewport already
 * encodes zoom scale and total page rotation, so these helpers stay correct for
 * rotated pages and any zoom.
 */

export function pdfRectToCss(viewport: PageViewport, r: Rect): CssRect {
  const [x1, y1] = viewport.convertToViewportPoint(r.x, r.y)
  const [x2, y2] = viewport.convertToViewportPoint(r.x + r.w, r.y + r.h)
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

export function pdfPointToCss(viewport: PageViewport, p: Point): { x: number; y: number } {
  const [x, y] = viewport.convertToViewportPoint(p.x, p.y)
  return { x, y }
}

export function cssPointToPdf(viewport: PageViewport, x: number, y: number): Point {
  const [px, py] = viewport.convertToPdfPoint(x, y)
  return { x: px, y: py }
}

export function cssRectToPdf(viewport: PageViewport, r: CssRect): Rect {
  const a = cssPointToPdf(viewport, r.left, r.top)
  const b = cssPointToPdf(viewport, r.left + r.width, r.top + r.height)
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}
