import { useEffect, useState } from 'react'
import { parseSplitGroups, splitEveryN, splitEveryPage } from '../utils/splitRanges'
import { useDocStore, useUiStore } from '../store'

type Tab = 'download' | 'split' | 'compress'
type SplitMode = 'every' | 'everyN' | 'ranges'
type CompressLevel = 'basic' | 'moderate' | 'strong'

const COMPRESS_INFO: Record<CompressLevel, { label: string; detail: string }> = {
  basic: { label: 'Basic — lossless', detail: 'Restructures the file. Text and quality untouched; usually 5–20% smaller.' },
  moderate: {
    label: 'Moderate — 150 DPI',
    detail: 'Pages become JPEG images. Big savings; text is no longer selectable.',
  },
  strong: {
    label: 'Strong — 110 DPI',
    detail: 'Maximum savings, visibly softer. Text is no longer selectable.',
  },
}

const fmtSize = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

export function ExportDialog() {
  const open = useUiStore((s) => s.exportDialogOpen)
  const setOpen = useUiStore((s) => s.setExportDialogOpen)
  const pageCount = useDocStore((s) => s.pages.length)
  const hasRedactions = useDocStore((s) =>
    Object.values(s.edits).some((list) => list.some((e) => e.type === 'redact')),
  )

  const [tab, setTab] = useState<Tab>('download')
  const [fileName, setFileName] = useState('')
  const [flatten, setFlatten] = useState(false)
  const [splitMode, setSplitMode] = useState<SplitMode>('every')
  const [everyN, setEveryN] = useState(2)
  const [ranges, setRanges] = useState('')
  const [level, setLevel] = useState<CompressLevel>('basic')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Prefill the file name with the original document name each time the dialog opens.
  const originalName = useUiStore((s) => s.fileName)
  useEffect(() => {
    if (open) setFileName((originalName ?? 'document').replace(/\.pdf$/i, ''))
  }, [open, originalName])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, setOpen])

  if (!open) return null

  const run = async (fn: () => Promise<{ warnings: string[]; status?: string; close?: boolean }>) => {
    setBusy(true)
    setError(null)
    setWarnings([])
    setStatus(null)
    try {
      const r = await fn()
      setWarnings(r.warnings)
      if (r.status) setStatus(r.status)
      if (r.close && r.warnings.length === 0) setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const download = () =>
    run(async () => {
      const { exportAndDownload } = await import('../pdf/exportDownload')
      const w = await exportAndDownload({ flattenForm: flatten, fileName })
      return { warnings: w, close: true }
    })

  const split = () =>
    run(async () => {
      const plan =
        splitMode === 'every'
          ? splitEveryPage(pageCount)
          : splitMode === 'everyN'
            ? splitEveryN(pageCount, everyN)
            : parseSplitGroups(ranges, pageCount)
      if (!plan || plan.length === 0) {
        throw new Error(splitMode === 'ranges' ? 'Invalid ranges. Example: 1-3; 4-10' : 'Invalid split settings.')
      }
      const { buildPdfBytes, currentBaseName, downloadBytes } = await import('../pdf/exportDownload')
      const pages = useDocStore.getState().pages
      const base = currentBaseName()
      const parts: { name: string; bytes: Uint8Array }[] = []
      const allWarnings: string[] = []
      for (let i = 0; i < plan.length; i++) {
        const pageIds = plan[i].map((idx) => pages[idx].id)
        const { bytes, warnings: w } = await buildPdfBytes({ flattenForm: flatten, pageIds })
        allWarnings.push(...w.filter((x) => !allWarnings.includes(x)))
        parts.push({ name: `${base}-part${i + 1}.pdf`, bytes })
      }
      if (parts.length <= 2) {
        for (const p of parts) downloadBytes(p.bytes, p.name)
      } else {
        const { zipSync } = await import('fflate')
        const entries: Record<string, Uint8Array> = {}
        for (const p of parts) entries[p.name] = p.bytes
        downloadBytes(zipSync(entries, { level: 0 }), `${base}-split.zip`, 'application/zip')
      }
      return {
        warnings: allWarnings,
        status: `Split into ${parts.length} file${parts.length > 1 ? 's' : ''}${parts.length > 2 ? ' (zipped)' : ''}.`,
      }
    })

  const compress = () =>
    run(async () => {
      const { buildPdfBytes, currentBaseName, downloadBytes } = await import('../pdf/exportDownload')
      const { compressLossless } = await import('../pdf/decrypt')
      const { bytes, warnings: w } = await buildPdfBytes({ flattenForm: level !== 'basic' ? true : flatten })
      let result: Uint8Array | null = null
      if (level === 'basic') {
        result = await compressLossless(bytes)
      } else {
        const { rasterizeExisting } = await import('../pdf/rasterize')
        const dpi = level === 'moderate' ? 150 : 110
        const quality = level === 'moderate' ? 0.8 : 0.65
        const rasterized = await rasterizeExisting(bytes, dpi, quality)
        result = (await compressLossless(rasterized)) ?? rasterized
      }
      const final = result && result.length < bytes.length ? result : bytes
      downloadBytes(final, `${currentBaseName()}-compressed.pdf`)
      const note =
        final === bytes
          ? ` Compression didn't reduce this file — the original export was downloaded (${fmtSize(bytes.length)}).`
          : ''
      return {
        warnings: w,
        status: `${fmtSize(bytes.length)} → ${fmtSize(final.length)}.${note}`,
      }
    })

  return (
    <div className="dialog-backdrop" onClick={() => !busy && setOpen(false)}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Export</h2>
        <div className="tabs">
          {(['download', 'split', 'compress'] as Tab[]).map((t) => (
            <button key={t} className={`btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'download' && (
          <div className="dialog-section">
            <label className="field-label">
              File name
              <div className="filename-row">
                <input
                  type="text"
                  className="text-input"
                  placeholder="document"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
                <span className="filename-ext">.pdf</span>
              </div>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
              Flatten form fields (values become permanent, non-editable)
            </label>
            {hasRedactions && (
              <p className="hint">
                This document has redactions — those pages will be converted to images so the covered
                content is permanently removed.
              </p>
            )}
            <div className="dialog-actions">
              <button className="btn primary" disabled={busy} onClick={() => void download()}>
                {busy ? 'Working…' : 'Download PDF'}
              </button>
            </div>
          </div>
        )}

        {tab === 'split' && (
          <div className="dialog-section">
            <label className="radio-row">
              <input type="radio" checked={splitMode === 'every'} onChange={() => setSplitMode('every')} />
              Every page as its own file ({pageCount} files)
            </label>
            <label className="radio-row">
              <input type="radio" checked={splitMode === 'everyN'} onChange={() => setSplitMode('everyN')} />
              Every
              <input
                type="number"
                className="text-input num-input"
                min={1}
                max={pageCount}
                value={everyN}
                onChange={(e) => setEveryN(Number(e.target.value))}
                onClick={() => setSplitMode('everyN')}
              />
              pages
            </label>
            <label className="radio-row">
              <input type="radio" checked={splitMode === 'ranges'} onChange={() => setSplitMode('ranges')} />
              Custom ranges
            </label>
            {splitMode === 'ranges' && (
              <input
                type="text"
                className="text-input"
                placeholder="e.g. 1-3; 4-10  (each group becomes a file)"
                value={ranges}
                onChange={(e) => setRanges(e.target.value)}
              />
            )}
            <p className="hint">Three or more output files download as a single .zip.</p>
            <div className="dialog-actions">
              <button className="btn primary" disabled={busy} onClick={() => void split()}>
                {busy ? 'Working…' : 'Split & download'}
              </button>
            </div>
          </div>
        )}

        {tab === 'compress' && (
          <div className="dialog-section">
            {(Object.keys(COMPRESS_INFO) as CompressLevel[]).map((l) => (
              <label key={l} className={`compress-card${level === l ? ' chosen' : ''}`}>
                <input type="radio" checked={level === l} onChange={() => setLevel(l)} />
                <span>
                  <strong>{COMPRESS_INFO[l].label}</strong>
                  <br />
                  <span className="hint">{COMPRESS_INFO[l].detail}</span>
                </span>
              </label>
            ))}
            <div className="dialog-actions">
              <button className="btn primary" disabled={busy} onClick={() => void compress()}>
                {busy ? 'Compressing…' : 'Compress & download'}
              </button>
            </div>
          </div>
        )}

        {status && <p className="status-ok">{status}</p>}
        {error && <p className="error">{error}</p>}
        {warnings.map((w, i) => (
          <p key={i} className="warning">{w}</p>
        ))}
        <button className="dialog-close" onClick={() => setOpen(false)} title="Close">✕</button>
      </div>
    </div>
  )
}
