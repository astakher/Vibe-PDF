import { describe, expect, it } from 'vitest'
import {
  remapEditToRaster,
  userRectToVisual,
  userToVisual,
  visualRectToUser,
  visualToUser,
  wrapText,
} from './drawHelpers'
import type { Rotation, ShapeEdit, WhiteoutEdit } from '../model/types'

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

describe('remapEditToRaster', () => {
  const whiteout: WhiteoutEdit = {
    id: 'w', pageId: 'p', z: 0, type: 'whiteout',
    rect: { x: 100, y: 150, w: 200, h: 50 }, color: { r: 1, g: 1, b: 1 },
  }
  const arrow: ShapeEdit = {
    id: 'a', pageId: 'p', z: 1, type: 'shape', shape: 'arrow',
    p1: { x: 100, y: 100 }, p2: { x: 300, y: 200 }, stroke: { r: 0, g: 0, b: 0 }, strokeWidth: 2,
  }

  it('rotation 0 is identity (raster height = page height)', () => {
    const out = remapEditToRaster(whiteout, DIMS, 0, DIMS.height)
    expect(out).toEqual(whiteout)
  })

  it('rotation 90: raster is landscape; rects land at the displayed position', () => {
    // display dims: W'=H=792, H'=W=612 → raster heightPt = 612
    const out = remapEditToRaster(whiteout, DIMS, 90, DIMS.width)
    if (out.type !== 'whiteout') throw new Error('type changed')
    // visual: vx=y..y+h → [150,200]; vy=x..x+w → [100,300]
    // raster space: x=vx, y=heightPt−vy−vh
    expect(out.rect).toEqual({ x: 150, y: 612 - 100 - 200, w: 50, h: 200 })
  })

  it('rotation 90: points map via userToVisual + y-flip', () => {
    const out = remapEditToRaster(arrow, DIMS, 90, DIMS.width)
    if (out.type !== 'shape') throw new Error('type changed')
    // p1 (100,100): visual (vx=100, vy=100) → (100, 612−100)
    expect(out.p1).toEqual({ x: 100, y: 512 })
    expect(out.p2).toEqual({ x: 200, y: 612 - 300 })
  })
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
