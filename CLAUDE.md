# Vibe PDF — project guide for Claude

Browser-only PDF editor (a lightweight Acrobat alternative). **All processing runs client-side; files never leave the browser.** No backend.

- **Repo:** GitHub `astakher/Vibe-PDF`, branch `main`.
- **Live:** `https://vibe-pdf.netlify.app` and proxied at `https://takher.ca/pdf` (see Deploy).
- **Stack:** React 19 + TypeScript + Vite. pdf.js (`pdfjs-dist`) renders; `pdf-lib` writes; `@neslinesli93/qpdf-wasm` decrypts/compresses; `zustand`+`zundo` state/undo; `@dnd-kit` thumbnail reorder; `signature_pad`; `fflate` split zips.

## Commands

```powershell
npm install
npm run dev            # dev server (usually :5174; base is /pdf/ so open /pdf/)
npm run build          # tsc + vite build -> dist/
npx vitest run         # unit tests (coords, exporter, split, decrypt, textItems)
npx vite preview --port 4173 --strictPort   # serve the build (at /pdf/)
node scripts/verify-e2e.mjs <baseUrl> <shotDir>   # Playwright end-to-end (39 checks)
node scripts/make-samples.mjs                     # regenerate public/samples/*
```
E2E note: `baseUrl` must include the base path, e.g. `http://localhost:4173/pdf/`. `setInputFiles` can point at any absolute path (personal test PDFs live in the user's Downloads, not committed).

## Architecture (the mental model)

Loaded PDF bytes are **immutable**. Every edit mutates only plain-data state; the viewer projects that state onto pdf.js canvases as overlays; **export** projects the same state into pdf-lib ops. Nothing is baked in until download.

- `src/pdf/registry.ts` — module-level `Map<docId,{bytes,proxy}>` (non-serializable, outside the store). pdf.js **detaches** the buffer passed to `getDocument`, so always pass `bytes.slice()` and keep originals for pdf-lib. `getDocument` runs with `enableXfa: true` + `standardFontDataUrl`.
- `src/store/index.ts` — two zustand stores: **doc** (`pages[]` descriptors, `edits` keyed by stable pageId, `formValues`) is undo-tracked via zundo (`partialize`, gesture-coalesced with `pauseHistory`/`resumeHistory`); **ui** (tool, zoom, selection, notices, `isXfa`) is not.
- `src/model/types.ts` — the `Edit` discriminated union (text, whiteout, redact, highlight, shape, ink, note, signature) + `PageDescriptor`. All geometry is stored in **PDF user space** (points, bottom-left origin, unrotated).
- `src/pdf/coords.ts` — the single conversion boundary between PDF space and CSS px, via the pdf.js `PageViewport` (encodes zoom + rotation).
- `src/pdf/drawHelpers.ts` — rotation-aware user↔visual mapping (verified against pdf.js's transform in tests) + `remapEditToRaster`.
- `src/pdf/exporter.ts` — pure `exportPdf(...)`; identity layout mutates the loaded doc in place (forms survive); page ops (reorder/delete/merge/extract) rebuild via `copyPages` (which breaks AcroForms → flatten first). `rasterizePage` is injected for true redaction.
- `src/components/viewer/PageView.tsx` — per-page layer stack: canvas → FormLayer → SVG edits → HTML edits → interaction layer.

## Features & where they live

- **Forms:** `viewer/FormLayer.tsx` (HTML widgets over AcroForm annotations) → filled in exporter via `getForm()`, `updateFieldAppearances`, optional flatten.
- **Redaction (true):** redacted pages are **rasterized at 200 DPI** on export (black boxes burned in) so content is unrecoverable; `src/pdf/rasterize.ts` + exporter branch.
- **Compress:** Basic = lossless qpdf; Moderate/Strong = re-render pages to JPEG (150/110 DPI). `decrypt.ts` `compressLossless` + `rasterize.ts` `rasterizeExisting`.
- **Split:** `utils/splitRanges.ts`; 3+ parts zip via `fflate`.
- **Signatures:** `SignatureDialog.tsx` (draw/type/upload).
- **Export dialog:** `ExportDialog.tsx` (Download/Compress tabs; filename prefilled with original name); **Split** is its own toolbar button opening the dialog on the split view; **Print** in `pdf/exportDownload.ts` (hidden-iframe print).

## Encrypted PDFs (qpdf-wasm)

`src/pdf/decrypt.ts`: owner-password-protected PDFs (OREA/IRCC/gov forms) render in pdf.js but **pdf-lib can't decrypt them → corrupt export**. So `maybeDecrypt` runs qpdf `--decrypt` (lazy-loaded WASM) at load. User-password files → `PasswordProtectedError`. `runQpdf` is shared by decrypt + lossless compress. qpdf caveats: use `locateFile` (not `wasmBinary`); fresh module instance per `callMain`.

## XFA (Adobe LiveCycle) forms — e.g. IRCC IMM 5710/5707

`isPureXfa` forms render only a "Please wait" placeholder in normal mode, so they auto-open a dedicated view (`viewer/XfaFormView.tsx`, `XfaBar.tsx`) using pdf.js `page.getXfa()` + `XfaLayer.render` (interactive) and `annotationStorage`. Export/print via `pdf/exportXfa.ts` (`saveDocument()`). Gotchas encoded there:
- `saveDocument()` **throws on empty annotationStorage** → we return original bytes when nothing's filled.
- Our global `line-height` leaked in and overlapped labels → forced `line-height:1` on the XFA layer **but not on form controls** (they need pdf.js's line-height to center).
- Single-line fields render as `<textarea>` (top-aligned) → `centerSingleLineFields` sets line-height to field height to vertically center.
- **Print** must print the on-screen HTML (browsers can't render XFA PDFs → "Please wait"); `@media print` under `.xfa-mode` hides chrome + paginates; global `overflow:hidden` must be released in print or only 1 page prints.
- Limitation (won't fix): dynamic scripting/reflow/validation don't run — that needs Acrobat.

## Deploy

`netlify.toml`: build `npm run build`, publish `dist`. Vite `base: '/pdf/'` (absolute) so assets resolve at both `/pdf` and `/pdf/`; a rewrite maps `/pdf/* → /:splat` so the app also works at the netlify.app root. **takher.ca proxies `/pdf/* → vibe-pdf.netlify.app/pdf/:splat`** (in the portfolio repo). Push to `main` → Netlify auto-deploys → live. **Never add a `/pdf → /pdf/` 301** (fights Netlify trailing-slash canonicalization → redirect loop).

## Conventions

- TypeScript strict; keep geometry in PDF user space; convert only at the `coords.ts` boundary.
- Add a unit test for pure logic (see `*.test.ts`) and an e2e check for user-facing flows (`scripts/verify-e2e.mjs`) — verify before committing.
- Temp scripts: use `*.tmp.mjs` and delete after; don't commit personal test PDFs.
- Descriptive single-purpose commits; the working tree should be clean between features.
