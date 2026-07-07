import { useEffect, useMemo, useState } from 'react'
import type { PDFPageProxy, PageViewport } from '../pdf/pdfjs'
import { getPageProxy } from '../pdf/registry'
import { totalRotation, type PageDescriptor } from '../model/types'

export function usePageProxy(desc: PageDescriptor): PDFPageProxy | null {
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  useEffect(() => {
    let alive = true
    getPageProxy(desc.docId, desc.sourceIndex).then((p) => {
      if (alive) setPage(p)
    })
    return () => {
      alive = false
    }
  }, [desc.docId, desc.sourceIndex])
  return page
}

/** Viewport for the page at the given zoom, composing base + user rotation. */
export function usePageViewport(desc: PageDescriptor, zoom: number): {
  page: PDFPageProxy | null
  viewport: PageViewport | null
} {
  const page = usePageProxy(desc)
  const rotation = totalRotation(desc)
  const viewport = useMemo(
    () => (page ? page.getViewport({ scale: zoom, rotation }) : null),
    [page, zoom, rotation],
  )
  return { page, viewport }
}
