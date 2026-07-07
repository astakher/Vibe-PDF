import type { PageDescriptor, Point, Rect, Rotation } from '../model/types'
import { totalRotation } from '../model/types'

/**
 * "Visual" coordinates: points, origin at the TOP-LEFT of the page AS DISPLAYED
 * (i.e. after /Rotate is applied), y pointing down. This is the frame the user
 * thinks in. Stored edit geometry is in unrotated PDF user space; axis-aligned
 * shapes need no compensation, but oriented content (text, images, note icons)
 * must be drawn with `rotate: degrees(R)` and anchored via these mappings.
 *
 * /Rotate R means the page is rotated R degrees CLOCKWISE for display, so:
 *   R=0:   dx = ux,     dy = H - uy
 *   R=90:  dx = uy,     dy = ux
 *   R=180: dx = W - ux, dy = uy
 *   R=270: dx = H - uy, dy = W - ux
 * (W, H = unrotated user-space page size.) Verified against pdf.js
 * PageViewport.convertToViewportPoint in drawHelpers.test.ts.
 */

export type VisualRect = { vx: number; vy: number; vw: number; vh: number }

/** Shared text-box metrics — the on-screen textarea and the exported drawText
 *  must use identical padding and line-height for WYSIWYG placement. */
export const TEXT_PADDING = 2
export const TEXT_LINE_HEIGHT = 1.25

export function userToVisual(desc: Pick<PageDescriptor, 'width' | 'height'>, rot: Rotation, p: Point): { vx: number; vy: number } {
  const { width: W, height: H } = desc
  switch (rot) {
    case 0:
      return { vx: p.x, vy: H - p.y }
    case 90:
      return { vx: p.y, vy: p.x }
    case 180:
      return { vx: W - p.x, vy: p.y }
    case 270:
      return { vx: H - p.y, vy: W - p.x }
  }
}

export function visualToUser(desc: Pick<PageDescriptor, 'width' | 'height'>, rot: Rotation, vx: number, vy: number): Point {
  const { width: W, height: H } = desc
  switch (rot) {
    case 0:
      return { x: vx, y: H - vy }
    case 90:
      return { x: vy, y: vx }
    case 180:
      return { x: W - vx, y: vy }
    case 270:
      return { x: W - vy, y: H - vx }
  }
}

/** Axis-aligned user-space rect → its axis-aligned visual bounding box. */
export function userRectToVisual(desc: Pick<PageDescriptor, 'width' | 'height'>, rot: Rotation, r: Rect): VisualRect {
  const a = userToVisual(desc, rot, { x: r.x, y: r.y })
  const b = userToVisual(desc, rot, { x: r.x + r.w, y: r.y + r.h })
  return {
    vx: Math.min(a.vx, b.vx),
    vy: Math.min(a.vy, b.vy),
    vw: Math.abs(b.vx - a.vx),
    vh: Math.abs(b.vy - a.vy),
  }
}

/** Visual rect → axis-aligned user-space rect. */
export function visualRectToUser(desc: Pick<PageDescriptor, 'width' | 'height'>, rot: Rotation, v: VisualRect): Rect {
  const a = visualToUser(desc, rot, v.vx, v.vy)
  const b = visualToUser(desc, rot, v.vx + v.vw, v.vy + v.vh)
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

export function contentRotation(desc: PageDescriptor): Rotation {
  return totalRotation(desc)
}

/** Greedy word-wrap matching what the on-screen textarea shows (same font metrics). */
export function wrapText(
  text: string,
  maxWidth: number,
  widthOf: (s: string) => number,
): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    if (raw === '') {
      out.push('')
      continue
    }
    const words = raw.split(' ')
    let line = ''
    for (const word of words) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (widthOf(candidate) <= maxWidth || line === '') {
        line = candidate
      } else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}
