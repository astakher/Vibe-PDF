import { describe, expect, it } from 'vitest'
import { userRectToVisual, userToVisual, visualRectToUser, visualToUser, wrapText } from './drawHelpers'
import type { Rotation } from '../model/types'

/**
 * Reference transform replicated verbatim from pdf.js PageViewport
 * (pdfjs-dist/build/pdf.mjs), viewBox [0,0,W,H], scale 1, userUnit 1, no offsets.
 * Our userToVisual must agree with it for every rotation — this is the
 * "coordinate proof" tying visual math to what pdf.js actually renders.
 */
function pdfjsViewportTransform(W: number, H: number, rotation: Rotation) {
  const centerX = W / 2
  const centerY = H / 2
  let a = 1, b = 0, c = 0, d = -1
  if (rotation === 90) { a = 0; b = 1; c = 1; d = 0 }
  else if (rotation === 180) { a = -1; b = 0; c = 0; d = 1 }
  else if (rotation === 270) { a = 0; b = -1; c = -1; d = 0 }
  const [ocx, ocy] = a === 0 ? [centerY, centerX] : [centerX, centerY]
  const e = ocx - a * centerX - c * centerY
  const f = ocy - b * centerX - d * centerY
  return (x: number, y: number) => ({ vx: a * x + c * y + e, vy: b * x + d * y + f })
}

const DIMS = { width: 612, height: 792 }
const ROTATIONS: Rotation[] = [0, 90, 180, 270]
const SAMPLE_POINTS = [
  { x: 0, y: 0 },
  { x: 612, y: 792 },
  { x: 72, y: 700 },
  { x: 300.5, y: 12.25 },
]

describe('userToVisual matches pdf.js PageViewport', () => {
  for (const rot of ROTATIONS) {
    it(`rotation ${rot}`, () => {
      const ref = pdfjsViewportTransform(DIMS.width, DIMS.height, rot)
      for (const p of SAMPLE_POINTS) {
        const ours = userToVisual(DIMS, rot, p)
        const theirs = ref(p.x, p.y)
        expect(ours.vx).toBeCloseTo(theirs.vx, 6)
        expect(ours.vy).toBeCloseTo(theirs.vy, 6)
      }
    })
  }
})

describe('visualToUser inverts userToVisual', () => {
  for (const rot of ROTATIONS) {
    it(`rotation ${rot}`, () => {
      for (const p of SAMPLE_POINTS) {
        const v = userToVisual(DIMS, rot, p)
        const back = visualToUser(DIMS, rot, v.vx, v.vy)
        expect(back.x).toBeCloseTo(p.x, 6)
        expect(back.y).toBeCloseTo(p.y, 6)
      }
    })
  }
})

describe('rect roundtrips', () => {
  const rect = { x: 100, y: 150, w: 200, h: 50 }
  for (const rot of ROTATIONS) {
    it(`rotation ${rot}`, () => {
      const v = userRectToVisual(DIMS, rot, rect)
      const back = visualRectToUser(DIMS, rot, v)
      expect(back.x).toBeCloseTo(rect.x, 6)
      expect(back.y).toBeCloseTo(rect.y, 6)
      expect(back.w).toBeCloseTo(rect.w, 6)
      expect(back.h).toBeCloseTo(rect.h, 6)
      // visual rect swaps extents on 90/270
      if (rot === 90 || rot === 270) {
        expect(v.vw).toBeCloseTo(rect.h, 6)
        expect(v.vh).toBeCloseTo(rect.w, 6)
      } else {
        expect(v.vw).toBeCloseTo(rect.w, 6)
        expect(v.vh).toBeCloseTo(rect.h, 6)
      }
    })
  }
})

describe('wrapText', () => {
  const widthOf = (s: string) => s.length * 10
  it('wraps at maxWidth', () => {
    expect(wrapText('aa bb cc dd', 55, widthOf)).toEqual(['aa bb', 'cc dd'])
  })
  it('keeps explicit newlines and empty lines', () => {
    expect(wrapText('aa\n\nbb', 1000, widthOf)).toEqual(['aa', '', 'bb'])
  })
  it('never drops an over-long word', () => {
    expect(wrapText('supercalifragilistic', 30, widthOf)).toEqual(['supercalifragilistic'])
  })
})
