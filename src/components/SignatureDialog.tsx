import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import type { CursiveFont, SignatureSource } from '../model/types'
import { cssFontFamily } from '../pdf/fonts'
import { useUiStore } from '../store'

const CURSIVE_FONTS: { key: CursiveFont; label: string }[] = [
  { key: 'GreatVibes', label: 'Great Vibes' },
  { key: 'Pacifico', label: 'Pacifico' },
  { key: 'Satisfy', label: 'Satisfy' },
]

type Tab = 'draw' | 'type' | 'upload'

export function SignatureDialog() {
  const open = useUiStore((s) => s.signatureDialogOpen)
  const setOpen = useUiStore((s) => s.setSignatureDialogOpen)
  const [tab, setTab] = useState<Tab>('draw')
  const [typed, setTyped] = useState('')
  const [font, setFont] = useState<CursiveFont>('GreatVibes')
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [uploadAspect, setUploadAspect] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)

  useEffect(() => {
    if (!open || tab !== 'draw') return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    canvas.getContext('2d')?.scale(dpr, dpr)
    const pad = new SignaturePad(canvas, { penColor: 'rgb(12,12,60)' })
    padRef.current = pad
    return () => {
      pad.off()
      padRef.current = null
    }
  }, [open, tab])

  if (!open) return null

  const place = (source: SignatureSource, aspect: number) => {
    const ui = useUiStore.getState()
    ui.setPendingSignature({ source, aspect })
    ui.setSignatureDialogOpen(false)
    ui.setTool('signature')
  }

  const confirm = () => {
    setError(null)
    if (tab === 'draw') {
      const pad = padRef.current
      const canvas = canvasRef.current
      if (!pad || !canvas || pad.isEmpty()) {
        setError('Draw a signature first.')
        return
      }
      const trimmed = trimCanvas(canvas)
      place({ kind: 'image', pngDataUrl: trimmed.url }, trimmed.aspect)
    } else if (tab === 'type') {
      if (!typed.trim()) {
        setError('Type your name first.')
        return
      }
      place({ kind: 'typed', text: typed.trim(), font }, Math.max(2, typed.trim().length * 0.45))
    } else if (tab === 'upload') {
      if (!uploadUrl) {
        setError('Choose an image first.')
        return
      }
      place({ kind: 'image', pngDataUrl: uploadUrl }, uploadAspect)
    }
  }

  const onUpload = (file: File | undefined) => {
    if (!file) return
    setError(null)
    const img = new Image()
    const reader = new FileReader()
    reader.onload = () => {
      img.onload = () => {
        // normalize to PNG via canvas (keeps alpha, converts JPEG etc.)
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        c.getContext('2d')!.drawImage(img, 0, 0)
        setUploadUrl(c.toDataURL('image/png'))
        setUploadAspect(img.naturalWidth / img.naturalHeight)
      }
      img.onerror = () => setError('Could not read that image.')
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="dialog-backdrop" onClick={() => setOpen(false)}>
      <div className="dialog dialog-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Add signature</h2>
        <div className="tabs">
          {(['draw', 'type', 'upload'] as Tab[]).map((t) => (
            <button key={t} className={`btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'draw' && (
          <>
            <canvas ref={canvasRef} className="sig-pad" />
            <button className="btn" onClick={() => padRef.current?.clear()}>Clear</button>
          </>
        )}

        {tab === 'type' && (
          <>
            <input
              type="text"
              className="text-input"
              placeholder="Your name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <div className="font-choices">
              {CURSIVE_FONTS.map((f) => (
                <button
                  key={f.key}
                  className={`font-choice${font === f.key ? ' chosen' : ''}`}
                  style={{ fontFamily: cssFontFamily[f.key] }}
                  onClick={() => setFont(f.key)}
                >
                  {typed.trim() || 'Signature'}
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'upload' && (
          <div className="upload-area">
            <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0])} />
            {uploadUrl && <img className="upload-preview" src={uploadUrl} alt="signature preview" />}
            <p className="hint">A PNG with a transparent background works best.</p>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button className="btn primary" onClick={confirm}>Place signature</button>
          <span className="hint">Then click on the page where it should go.</span>
        </div>
        <button className="dialog-close" onClick={() => setOpen(false)} title="Close">✕</button>
      </div>
    </div>
  )
}

/** Crops transparent margins so the placed image hugs the ink. */
function trimCanvas(canvas: HTMLCanvasElement): { url: string; aspect: number } {
  const ctx = canvas.getContext('2d')!
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { url: canvas.toDataURL('image/png'), aspect: width / height }
  const pad = 4
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')!.drawImage(canvas, minX, minY, w, h, 0, 0, w, h)
  return { url: out.toDataURL('image/png'), aspect: w / h }
}
