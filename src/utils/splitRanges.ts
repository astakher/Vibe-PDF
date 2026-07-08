import { parsePageRange } from './pageRange'

/** Split plans: arrays of 0-based page-index groups, one group per output file. */

export function splitEveryPage(pageCount: number): number[][] {
  return Array.from({ length: pageCount }, (_, i) => [i])
}

export function splitEveryN(pageCount: number, n: number): number[][] | null {
  if (!Number.isInteger(n) || n < 1) return null
  const out: number[][] = []
  for (let start = 0; start < pageCount; start += n) {
    out.push(Array.from({ length: Math.min(n, pageCount - start) }, (_, i) => start + i))
  }
  return out
}

/**
 * Custom groups: ';' or newline separates output files, each group is a
 * parsePageRange expression — e.g. "1-3; 4-10" → two files.
 */
export function parseSplitGroups(input: string, pageCount: number): number[][] | null {
  const groups = input
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (groups.length === 0) return null
  const out: number[][] = []
  for (const g of groups) {
    const indices = parsePageRange(g, pageCount)
    if (!indices) return null
    out.push(indices)
  }
  return out
}
