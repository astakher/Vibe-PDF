import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { totalRotation, type PageDescriptor } from '../model/types'
import { getPageProxy } from '../pdf/registry'
import { useDocStore, useUiStore } from '../store'

const THUMB_WIDTH = 132

export function ThumbnailRail() {
  const pages = useDocStore((s) => s.pages)
  const currentPageIndex = useUiStore((s) => s.currentPageIndex)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = pages.findIndex((p) => p.id === active.id)
    const to = pages.findIndex((p) => p.id === over.id)
    if (from >= 0 && to >= 0) useDocStore.getState().movePage(from, to)
  }

  return (
    <div className="thumbnail-rail">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {pages.map((p, i) => (
            <SortableThumbnail
              key={p.id}
              desc={p}
              index={i}
              active={i === currentPageIndex}
              canDelete={pages.length > 1}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

function SortableThumbnail({
  desc,
  index,
  active,
  canDelete,
}: {
  desc: PageDescriptor
  index: number
  active: boolean
  canDelete: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: desc.id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
        zIndex: isDragging ? 5 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <Thumbnail desc={desc} index={index} active={active} canDelete={canDelete} />
    </div>
  )
}

function Thumbnail({
  desc,
  index,
  active,
  canDelete,
}: {
  desc: PageDescriptor
  index: number
  active: boolean
  canDelete: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(index < 10)
  const rotation = totalRotation(desc)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '200% 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    getPageProxy(desc.docId, desc.sourceIndex).then((page) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const base = page.getViewport({ scale: 1, rotation })
      const scale = THUMB_WIDTH / base.width
      const viewport = page.getViewport({ scale, rotation })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const t = page.render({ canvas, viewport })
      task = t
      t.promise.catch(() => {})
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, desc.docId, desc.sourceIndex, rotation])

  const swap = rotation === 90 || rotation === 270
  const height = Math.round(
    (THUMB_WIDTH * (swap ? desc.width : desc.height)) / (swap ? desc.height : desc.width),
  )

  return (
    <div
      ref={ref}
      className={`thumbnail${active ? ' active' : ''}`}
      onClick={() => useUiStore.getState().requestScrollToPage(desc.id)}
    >
      <canvas ref={canvasRef} style={{ width: THUMB_WIDTH, height }} />
      <span className="thumbnail-num">{index + 1}</span>
      <span className="thumbnail-actions">
        <button
          className="thumb-btn"
          title="Rotate page 90° clockwise"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            useDocStore.getState().rotatePage(desc.id, 90)
          }}
        >
          ⟳
        </button>
        {canDelete && (
          <button
            className="thumb-btn danger"
            title="Delete page"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              useDocStore.getState().deletePage(desc.id)
            }}
          >
            ✕
          </button>
        )}
      </span>
    </div>
  )
}
