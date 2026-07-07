import { getPageProxy } from './registry'
import { mergeItemsIntoLines, type RawTextItem, type TextLine } from './textItems'

/**
 * pdf.js-backed loader for the pure line-merging logic in textItems.ts
 * (kept separate so textItems.ts stays importable under node for tests).
 */

const lineCache = new Map<string, Promise<TextLine[]>>()

export function getTextLines(docId: string, sourceIndex: number): Promise<TextLine[]> {
  const key = `${docId}:${sourceIndex}`
  let p = lineCache.get(key)
  if (!p) {
    p = getPageProxy(docId, sourceIndex)
      .then((page) => page.getTextContent())
      .then((tc) =>
        mergeItemsIntoLines(
          (tc.items as Array<Partial<RawTextItem>>)
            .filter((i): i is RawTextItem => typeof i.str === 'string' && Array.isArray(i.transform))
            .map((i) => ({ str: i.str, transform: i.transform, width: i.width ?? 0, height: i.height ?? 0 })),
        ),
      )
    lineCache.set(key, p)
  }
  return p
}
