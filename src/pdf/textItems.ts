import type { Point, Rect } from '../model/types'

/**
 * Text extraction for the "Edit text" tool: pdf.js text items are merged into
 * visual lines with user-space bounding boxes, so a click can be resolved to
 * the run of text under the cursor.
 */

/** Plain subset of pdf.js TextItem — the pure functions below take this, so they unit-test in node. */
export type RawTextItem = {
  str: string
  /** text matrix [a,b,c,d,e,f]; baseline origin at (e,f), user space */
  transform: number[]
  /** user-space units */
  width: number
  height: number
}

export type TextLine = { text: string; rect: Rect; fontSize: number }

type Vec = { x: number; y: number }

const normalize = (x: number, y: number): Vec => {
  const len = Math.hypot(x, y) || 1
  return { x: x / len, y: y / len }
}
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y

/**
 * Merge items sharing an orientation and baseline into lines. Boxes are derived
 * generally from the text matrix — text on /Rotate'd pages runs vertically in
 * user space, so nothing here assumes horizontal.
 */
export function mergeItemsIntoLines(items: RawTextItem[]): TextLine[] {
  type Run = {
    dir: Vec
    up: Vec
    /** baseline position along the up-normal */
    cross: number
    /** [start, end] extent along dir */
    start: number
    end: number
    fontSize: number
    parts: { along: number; width: number; text: string }[]
    rect: Rect
  }

  const runs: Run[] = []

  for (const item of items) {
    if (!item.str.trim() || item.width <= 0 || item.height <= 0) continue
    const [a, b, c, d, e, f] = item.transform
    const dir = normalize(a, b)
    const up = normalize(c, d)
    const h = item.height
    const origin: Vec = { x: e - 0.25 * h * up.x, y: f - 0.25 * h * up.y }
    const corners: Vec[] = [
      origin,
      { x: origin.x + item.width * dir.x, y: origin.y + item.width * dir.y },
      { x: origin.x + 1.2 * h * up.x, y: origin.y + 1.2 * h * up.y },
      {
        x: origin.x + item.width * dir.x + 1.2 * h * up.x,
        y: origin.y + item.width * dir.y + 1.2 * h * up.y,
      },
    ]
    const xs = corners.map((p) => p.x)
    const ys = corners.map((p) => p.y)
    const rect: Rect = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    }
    const cross = dot({ x: e, y: f }, up)
    const along = dot({ x: e, y: f }, dir)

    const run = runs.find(
      (r) =>
        dot(r.dir, dir) > 0.999 && // same orientation
        Math.abs(r.cross - cross) < 2 && // same baseline
        along - r.end < 0.5 * Math.max(r.fontSize, h) && // close enough along the line
        r.start - (along + item.width) < 0.5 * Math.max(r.fontSize, h),
    )
    if (run) {
      run.parts.push({ along, width: item.width, text: item.str })
      run.start = Math.min(run.start, along)
      run.end = Math.max(run.end, along + item.width)
      run.fontSize = Math.max(run.fontSize, h)
      run.rect = union(run.rect, rect)
    } else {
      runs.push({
        dir,
        up,
        cross,
        start: along,
        end: along + item.width,
        fontSize: h,
        parts: [{ along, width: item.width, text: item.str }],
        rect,
      })
    }
  }

  return runs.map((r) => {
    const sorted = [...r.parts].sort((p, q) => p.along - q.along)
    let text = ''
    let prevEnd: number | null = null
    for (const p of sorted) {
      const gap = prevEnd === null ? 0 : p.along - prevEnd
      if (gap > 0.2 * r.fontSize && text !== '' && !text.endsWith(' ') && !p.text.startsWith(' ')) {
        text += ' '
      }
      text += p.text
      prevEnd = p.along + p.width
    }
    return { text, rect: r.rect, fontSize: r.fontSize }
  })
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  }
}

/** Topmost (last) matching line wins. */
export function hitTestText(lines: TextLine[], p: Point): TextLine | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const { rect } = lines[i]
    if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
      return lines[i]
    }
  }
  return null
}
