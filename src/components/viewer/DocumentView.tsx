import { useEffect, useRef } from 'react'
import { useDocStore, useUiStore } from '../../store'
import { PageView } from './PageView'

export function DocumentView() {
  const pages = useDocStore((s) => s.pages)
  const scrollToPageId = useUiStore((s) => s.scrollToPageId)
  const containerRef = useRef<HTMLDivElement>(null)

  // Thumbnail click → scroll the page into view.
  useEffect(() => {
    if (!scrollToPageId) return
    const el = containerRef.current?.querySelector(`[data-page-id="${scrollToPageId}"]`)
    el?.scrollIntoView({ block: 'start' })
    useUiStore.getState().requestScrollToPage(null)
  }, [scrollToPageId])

  // Track which page is "current" for the toolbar indicator.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const probe = container.scrollTop + container.clientHeight / 3
        const els = container.querySelectorAll<HTMLElement>('[data-page-index]')
        for (const el of els) {
          if (el.offsetTop <= probe && probe < el.offsetTop + el.offsetHeight) {
            useUiStore.getState().setCurrentPageIndex(Number(el.dataset.pageIndex))
            break
          }
        }
      })
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Ctrl+wheel zoom, anchored roughly at view center.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const { zoom, setZoom } = useUiStore.getState()
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      className="document-view"
      ref={containerRef}
      onPointerDown={(e) => {
        // clicking page background / gutter deselects
        const el = e.target as HTMLElement
        if (el.classList.contains('document-pages') || el.classList.contains('document-view') || el.tagName === 'CANVAS') {
          useUiStore.getState().setSelectedEditId(null)
        }
      }}
    >
      <div className="document-pages">
        {pages.map((p, i) => (
          <PageView key={p.id} desc={p} index={i} />
        ))}
      </div>
    </div>
  )
}
