import type { PDFPageProxy } from './pdfjs'
import type { FormValue, Rect } from '../model/types'

export type FieldKind = 'text' | 'checkbox' | 'radio' | 'combo' | 'listbox'

export type FieldInfo = {
  id: string
  /** fully-qualified field name — the same name pdf-lib resolves at export */
  name: string
  kind: FieldKind
  /** PDF user space */
  rect: Rect
  multiLine: boolean
  readOnly: boolean
  /** checkbox on-value / radio widget export value */
  exportValue?: string
  options?: { value: string; label: string }[]
  initial?: FormValue
}

/** Normalizes pdf.js Widget annotations into what FormLayer renders. */
export async function getFormFields(page: PDFPageProxy): Promise<FieldInfo[]> {
  const annotations = (await page.getAnnotations()) as any[]
  const fields: FieldInfo[] = []
  for (const a of annotations) {
    if (a.subtype !== 'Widget' || !a.fieldName || a.hidden) continue
    const [x1, y1, x2, y2] = a.rect as [number, number, number, number]
    const rect: Rect = {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    }
    const common = {
      id: String(a.id),
      name: String(a.fieldName),
      rect,
      multiLine: !!a.multiLine,
      readOnly: !!a.readOnly,
    }
    if (a.fieldType === 'Tx') {
      fields.push({ ...common, kind: 'text', initial: stringOr(a.fieldValue) })
    } else if (a.fieldType === 'Btn' && a.checkBox) {
      const on = stringOr(a.exportValue) || 'Yes'
      fields.push({
        ...common,
        kind: 'checkbox',
        exportValue: on,
        initial: stringOr(a.fieldValue) === on,
      })
    } else if (a.fieldType === 'Btn' && a.radioButton) {
      fields.push({
        ...common,
        kind: 'radio',
        exportValue: stringOr(a.buttonValue),
        initial: stringOr(a.fieldValue),
      })
    } else if (a.fieldType === 'Ch') {
      const options = (a.options ?? []).map((o: any) => ({
        value: String(o.exportValue ?? o.displayValue ?? ''),
        label: String(o.displayValue ?? o.exportValue ?? ''),
      }))
      fields.push({
        ...common,
        kind: a.combo ? 'combo' : 'listbox',
        options,
        initial: Array.isArray(a.fieldValue) ? a.fieldValue.map(String) : stringOr(a.fieldValue),
      })
    }
    // push buttons & signatures are ignored
  }
  return fields
}

function stringOr(v: unknown): string {
  return v == null ? '' : String(v)
}
