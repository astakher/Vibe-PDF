import { describe, expect, it } from 'vitest'
import { parseSplitGroups, splitEveryN, splitEveryPage } from './splitRanges'

describe('splitEveryPage', () => {
  it('one group per page', () => {
    expect(splitEveryPage(3)).toEqual([[0], [1], [2]])
  })
})

describe('splitEveryN', () => {
  it('chunks with a short tail', () => {
    expect(splitEveryN(5, 2)).toEqual([[0, 1], [2, 3], [4]])
  })
  it('rejects invalid n', () => {
    expect(splitEveryN(5, 0)).toBeNull()
    expect(splitEveryN(5, 1.5)).toBeNull()
  })
})

describe('parseSplitGroups', () => {
  it('splits on ; and newlines', () => {
    expect(parseSplitGroups('1-2; 3\n4-5', 5)).toEqual([[0, 1], [2], [3, 4]])
  })
  it('rejects malformed and out-of-range groups', () => {
    expect(parseSplitGroups('1-9', 5)).toBeNull()
    expect(parseSplitGroups('abc', 5)).toBeNull()
    expect(parseSplitGroups('', 5)).toBeNull()
  })
})
