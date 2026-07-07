import { useEffect, useRef } from 'react'
import { pdfjs, type PDFPageProxy, type PageViewport } from '../../pdf/pdfjs'

/**
 * Renders one pdf.js page into a DPR-crisp canvas. The canvas CSS size is set
 * immediately so layout never jumps; the actual (expensive) render is debounced
 * slightly so rapid zoom changes don't queue redundant render tasks.
 */
export function PdfCanvas({ page, viewport }: { page: PDFPageProxy; viewport: PageViewport }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`

    let task: ReturnType<PDFPageProxy['render']> | null = null
    const timer = window.setTimeout(() => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      task = page.render({
        canvas,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        // interactive form widgets are rendered by FormLayer as HTML, not on canvas
        annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS,
      })
      task.promise.catch(() => {}) // cancelled renders reject; that's fine
    }, 80)

    return () => {
      window.clearTimeout(timer)
      task?.cancel()
    }
  }, [page, viewport])

  return <canvas className="pdf-canvas" ref={ref} />
}
