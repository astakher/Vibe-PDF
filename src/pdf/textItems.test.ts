import { describe, expect, it } from 'vitest'
import { hitTestText, mergeItemsIntoLines, type RawTextItem } from './textItems'

/** Horizontal item at (x, y) baseline, given font size. */
const h = (str: string, x: number, y: number, width: number, size = 12): RawTextItem => ({
  str,
  transform: [size, 0, 0, size, x, y],
  width,
  height: size,
})

describe('mergeItemsIntoLines', () => {
  it('merges same-baseline items into one line with a union bbox', () => {
    const lines = mergeItemsIntoLines([h('Hello', 72, 700, 30), h('world', 106, 700, 30)])
    expect(lines).toHaveLength(1)
    expect(lines[0].rect.x).toBeCloseTo(72, 5)
    expect(lines[0].rect.w).toBeCloseTo(106 + 30 - 72, 5)
  })

  it('adds a space for word gaps and none for touching runs', () => {
    const spaced = mergeItemsIntoLines([h('Hello', 72, 700, 30), h('world', 106, 700, 30)])
    expect(spaced[0].text).toBe('Hello world')
    const touching = mergeItemsIntoLines([h('Hel', 72, 700, 18), h('lo', 90, 700, 12)])
    expect(touching[0].text).toBe('Hello')
  })

  it('splits runs separated by a large gap (separate form boxes)', () => {
    const lines = mergeItemsIntoLines([h('Name', 72, 700, 30), h('Date', 300, 700, 30)])
    expect(lines).toHaveLength(2)
  })

  it('splits different baselines', () => {
    const lines = mergeItemsIntoLines([h('one', 72, 700, 20), h('two', 72, 680, 20)])
    expect(lines).toHaveLength(2)
  })

  it('handles 90°-rotated text (vertical in user space)', () => {
    const size = 12
    // dir = (0,1) up = (-1,0): text running up the page
    const item: RawTextItem = { str: 'Vertical', transform: [0, size, -size, 0, 100, 200], width: 50, height: size }
    const [line] = mergeItemsIntoLines([item])
    // bbox should be tall and thin: extent along y = width, along x = 1.2*height
    expect(line.rect.h).toBeCloseTo(50, 5)
    expect(line.rect.w).toBeCloseTo(1.2 * size, 5)
    // up = (-1, 0) so the box extends in -x from the baseline (origin shifted +0.25h in +x)
    expect(line.rect.x).toBeCloseTo(100 - 1.2 * size + 0.25 * size, 5)
    expect(line.rect.y).toBeCloseTo(200, 5)
  })

  it('ignores whitespace-only and zero-size items', () => {
    expect(mergeItemsIntoLines([h(' ', 72, 700, 5), h('', 72, 700, 0)])).toHaveLength(0)
  })
})

describe('hitTestText', () => {
  const lines = mergeItemsIntoLines([h('Hello', 72, 700, 30), h('Below', 72, 600, 30)])
  it('returns the line containing the point', () => {
    expect(hitTestText(lines, { x: 80, y: 703 })?.text).toBe('Hello')
    expect(hitTestText(lines, { x: 80, y: 603 })?.text).toBe('Below')
  })
  it('returns null on a miss', () => {
    expect(hitTestText(lines, { x: 400, y: 400 })).toBeNull()
  })
})
