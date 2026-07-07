import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { pageCssSize, type PageDescriptor } from '../../model/types'
import { usePageViewport } from '../../hooks/usePageViewport'
import { useDocStore, useUiStore } from '../../store'
import { PdfCanvas } from './PdfCanvas'
import { EditsSvgLayer } from './EditsSvgLayer'
import { EditsHtmlLayer } from './EditsHtmlLayer'
import { InteractionLayer } from './InteractionLayer'
import { FormLayer } from './FormLayer'
import { createTextEditAt } from './createEdits'

/**
 * One page: fixed-size wrapper (so scroll height is always correct) that only
 * mounts the canvas + overlay layers while near the visible viewport.
 */
export function PageView({ desc, index }: { desc: PageDescriptor; index: number }) {
  const zoom = useUiStore((s) => s.zoom)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(index < 3)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '150% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const { width, height } = pageCssSize(desc, zoom)

  return (
    <div
      ref={wrapRef}
      className="page-view"
      data-page-id={desc.id}
      data-page-index={index}
      style={{ width, height }}
    >
      {visible && <PageLayers desc={desc} zoom={zoom} />}
    </div>
  )
}

function PageLayers({ desc, zoom }: { desc: PageDescriptor; zoom: number }) {
  const { page, viewport } = usePageViewport(desc, zoom)
  const edits = useDocStore((s) => s.edits[desc.id])
  if (!page || !viewport) return null

  // Acrobat "Fill & Sign" affordance: double-click an empty spot to type there.
  const onDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (useUiStore.getState().tool !== 'select') return
    const target = e.target as HTMLElement
    // TransformBox/form widgets have their own double-click semantics and don't stop propagation
    if (target.closest('.transform-box') || target.closest('.form-widget')) return
    const r = e.currentTarget.getBoundingClientRect()
    createTextEditAt(desc, viewport, e.clientX - r.left, e.clientY - r.top)
  }

  return (
    <div className="page-layers" onDoubleClick={onDoubleClick}>
      <PdfCanvas page={page} viewport={viewport} />
      <FormLayer page={page} viewport={viewport} />
      <EditsSvgLayer desc={desc} edits={edits ?? []} viewport={viewport} />
      <EditsHtmlLayer desc={desc} edits={edits ?? []} viewport={viewport} />
      <InteractionLayer desc={desc} viewport={viewport} />
    </div>
  )
}
