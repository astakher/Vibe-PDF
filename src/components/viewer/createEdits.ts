import { nanoid } from 'nanoid'
import type { PageDescriptor, TextBoxEdit } from '../../model/types'
import type { PageViewport } from '../../pdf/pdfjs'
import { cssRectToPdf } from '../../pdf/coords'
import { TEXT_LINE_HEIGHT, TEXT_PADDING } from '../../pdf/drawHelpers'
import { useDocStore, useUiStore } from '../../store'

/**
 * Creates an empty text box at a page-local CSS point, selects it, and opens it
 * for typing. Used by the text tool and by double-click-to-type (select tool).
 */
export function createTextEditAt(
  desc: PageDescriptor,
  viewport: PageViewport,
  cssX: number,
  cssY: number,
): void {
  const { toolOptions } = useUiStore.getState()
  const heightCss = (toolOptions.fontSize * TEXT_LINE_HEIGHT + 2 * TEXT_PADDING) * viewport.scale + 2
  const rect = cssRectToPdf(viewport, {
    left: cssX,
    top: cssY,
    width: 220 * viewport.scale,
    height: heightCss,
  })
  const edit: TextBoxEdit = {
    id: nanoid(8),
    pageId: desc.id,
    z: useDocStore.getState().edits[desc.id]?.length ?? 0,
    type: 'text',
    rect,
    text: '',
    fontFamily: toolOptions.fontFamily,
    fontSize: toolOptions.fontSize,
    color: toolOptions.color,
  }
  useDocStore.getState().addEdit(edit)
  const ui = useUiStore.getState()
  ui.setTool('select') // before selection — setTool clears selectedEditId
  ui.setSelectedEditId(edit.id)
  ui.setEditingEditId(edit.id)
}
