/** "1-3, 5" → [0,1,2,4]; null when malformed or out of range. */
export function parsePageRange(input: string, pageCount: number): number[] | null {
  const out = new Set<number>()
  for (const part of input.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part)
    if (!m) return null
    const start = Number(m[1])
    const end = m[2] ? Number(m[2]) : start
    if (start < 1 || end > pageCount || start > end) return null
    for (let i = start; i <= end; i++) out.add(i - 1)
  }
  return out.size ? [...out].sort((a, b) => a - b) : null
}
