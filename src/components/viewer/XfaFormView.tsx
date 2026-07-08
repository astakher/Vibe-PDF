import { useEffect, useRef } from 'react'
import 'pdfjs-dist/web/pdf_viewer.css'
import { pdfjs } from '../../pdf/pdfjs'
import { getDocumentProxy, getPageProxy } from '../../pdf/registry'
import { useDocStore, useUiStore } from '../../store'

/**
 * EXPERIMENTAL XFA (Adobe LiveCycle) form renderer. pdf.js parses the XFA
 * template into an HTML tree (page.getXfa()) which XfaLayer.render() turns into
 * interactive inputs bound to the document's annotationStorage. Static layout
 * and field filling only — dynamic scripting/reflow is NOT executed.
 */

// XfaLayer needs a linkService; these forms rarely have links, so a no-op stub is fine.
const linkServiceStub = {
  addLinkAttributes() {},
  getDestinationHash: () => '',
  getAnchorUrl: () => '',
  externalLinkEnabled: false,
  externalLinkTarget: 0,
  externalLinkRel: '',
  eventBus: undefined,
}

export function XfaFormView() {
  const primaryDocId = useUiStore((s) => s.primaryDocId)
  const zoom = useUiStore((s) => s.zoom)
  const pages = useDocStore((s) => s.pages)

  if (!primaryDocId) return null
  return (
    <div className="document-view">
      <div className="document-pages">
        {pages.map((p, i) => (
          <XfaPage key={p.id} docId={primaryDocId} sourceIndex={p.sourceIndex} zoom={zoom} index={i} />
        ))}
      </div>
    </div>
  )
}

function XfaPage({
  docId,
  sourceIndex,
  zoom,
  index,
}: {
  docId: string
  sourceIndex: number
  zoom: number
  index: number
}) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return
    ;(async () => {
      const page = await getPageProxy(docId, sourceIndex)
      const xfaHtml = await page.getXfa()
      if (cancelled || !host || !xfaHtml) return
      const viewport = page.getViewport({ scale: zoom })
      host.style.width = `${viewport.width}px`
      host.style.height = `${viewport.height}px`
      host.replaceChildren()
      const layer = document.createElement('div')
      layer.className = 'xfaLayer'
      host.appendChild(layer)
      try {
        pdfjs.XfaLayer.render({
          viewport: viewport.clone({ dontFlip: true }),
          div: layer,
          xfaHtml,
          annotationStorage: getDocumentProxy(docId).annotationStorage,
          linkService: linkServiceStub as never,
          intent: 'display',
        })
        centerSingleLineFields(layer)
      } catch (e) {
        host.textContent = `Could not render XFA page ${index + 1}: ${e instanceof Error ? e.message : e}`
      }
    })()
    return () => {
      cancelled = true
    }
  }, [docId, sourceIndex, zoom, index])

  return <div className="xfa-page" ref={hostRef} data-page-index={index} />
}

/**
 * pdf.js renders XFA text fields as <textarea>/<input> with line-height 1, so a
 * single line of text sits at the TOP of a taller field box (Acrobat centers it).
 * For fields short enough to hold ~one line, set line-height to the field height
 * so the text centers vertically. Genuinely multi-line fields are left alone.
 */
function centerSingleLineFields(layer: HTMLElement): void {
  const fields = layer.querySelectorAll<HTMLElement>('input.xfaTextfield, textarea.xfaTextfield')
  for (const el of fields) {
    const fontSize = parseFloat(getComputedStyle(el).fontSize) || 0
    const h = el.clientHeight
    if (fontSize > 0 && h > 0 && h <= fontSize * 3) {
      el.style.lineHeight = `${h}px`
    }
  }
}
