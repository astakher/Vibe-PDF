import { useEffect, useState } from 'react'
import type { PDFPageProxy, PageViewport } from '../../pdf/pdfjs'
import { getFormFields, type FieldInfo } from '../../pdf/formFields'
import { pdfRectToCss } from '../../pdf/coords'
import { useDocStore, useUiStore } from '../../store'
import type { FormValue } from '../../model/types'

/** Interactive HTML form controls positioned over AcroForm widgets. */
export function FormLayer({ page, viewport }: { page: PDFPageProxy; viewport: PageViewport }) {
  const [fields, setFields] = useState<FieldInfo[] | null>(null)
  const tool = useUiStore((s) => s.tool)

  useEffect(() => {
    let alive = true
    getFormFields(page).then((f) => {
      if (!alive) return
      setFields(f)
      if (f.length) {
        const seed: Record<string, FormValue> = {}
        for (const field of f) {
          if (field.initial !== undefined && field.initial !== '') {
            if (field.kind === 'radio') {
              if (field.initial) seed[field.name] = field.initial
            } else {
              seed[field.name] = field.initial
            }
          }
        }
        if (Object.keys(seed).length) useDocStore.getState().seedFormValues(seed)
      }
    })
    return () => {
      alive = false
    }
  }, [page])

  if (!fields || fields.length === 0) return null

  return (
    <div className="form-layer" style={{ pointerEvents: tool === 'select' ? 'auto' : 'none' }}>
      {fields.map((f) => (
        <FieldControl key={f.id} field={f} viewport={viewport} />
      ))}
    </div>
  )
}

function FieldControl({ field, viewport }: { field: FieldInfo; viewport: PageViewport }) {
  const value = useDocStore((s) => s.formValues[field.name])
  const setFormValue = useDocStore((s) => s.setFormValue)
  const r = pdfRectToCss(viewport, field.rect)
  const style = { left: r.left, top: r.top, width: r.width, height: r.height }
  const fontSize = Math.max(8, Math.min(r.height * 0.62, 16 * viewport.scale))

  switch (field.kind) {
    case 'text':
      return field.multiLine ? (
        <textarea
          className="form-widget"
          style={{ ...style, fontSize }}
          value={typeof value === 'string' ? value : ''}
          disabled={field.readOnly}
          onChange={(e) => setFormValue(field.name, e.target.value)}
        />
      ) : (
        <input
          type="text"
          className="form-widget"
          style={{ ...style, fontSize }}
          value={typeof value === 'string' ? value : ''}
          disabled={field.readOnly}
          onChange={(e) => setFormValue(field.name, e.target.value)}
        />
      )
    case 'checkbox':
      return (
        <input
          type="checkbox"
          className="form-widget form-check"
          style={style}
          checked={value === true}
          disabled={field.readOnly}
          onChange={(e) => setFormValue(field.name, e.target.checked)}
        />
      )
    case 'radio':
      return (
        <input
          type="radio"
          className="form-widget form-check"
          style={style}
          checked={value === field.exportValue && value !== ''}
          disabled={field.readOnly}
          onChange={() => setFormValue(field.name, field.exportValue ?? '')}
        />
      )
    case 'combo':
      return (
        <select
          className="form-widget"
          style={{ ...style, fontSize }}
          value={typeof value === 'string' ? value : ''}
          disabled={field.readOnly}
          onChange={(e) => setFormValue(field.name, e.target.value)}
        >
          <option value="" />
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case 'listbox':
      return (
        <select
          multiple
          className="form-widget"
          style={{ ...style, fontSize }}
          value={Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []}
          disabled={field.readOnly}
          onChange={(e) =>
            setFormValue(field.name, [...e.target.selectedOptions].map((o) => o.value))
          }
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
  }
}
