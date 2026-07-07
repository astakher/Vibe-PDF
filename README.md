# PDF Editor

A lightweight, browser-only PDF editor (an Acrobat-Pro-style tool for everyday tasks).
**All processing happens client-side — files never leave your device.**

## Features

- **View** — drag & drop or open PDFs, continuous scroll, page thumbnails, zoom (Ctrl+wheel), crisp HiDPI rendering, virtualized for large documents
- **Fill forms** — AcroForm text fields, checkboxes, radio groups, dropdowns, list boxes; optional flattening on download
- **Sign** — draw (smooth pen), type (3 cursive fonts, embedded as vector text), or upload a signature image (transparent PNG supported)
- **Add text** — text boxes with font, size, and color; the same TTF is used on screen and embedded in the export, so placement is WYSIWYG
- **Whiteout** — cover existing content and type over it (the standard overlay approach to "editing" PDF text)
- **Annotate** — highlight (multiply blend), rectangles, ellipses, lines, arrows, freehand ink, sticky notes (exported as real PDF `Text` annotations)
- **Organize pages** — drag thumbnails to reorder, rotate, delete, merge another PDF, extract page ranges
- **Undo/redo** — Ctrl+Z / Ctrl+Y, gesture-coalesced

## Stack

React 19 + TypeScript + Vite · [pdf.js](https://mozilla.github.io/pdf.js/) (rendering) · [pdf-lib](https://pdf-lib.js.org/) (writing) · zustand + zundo (state & history) · dnd-kit (thumbnail reorder) · signature_pad

## Development

```powershell
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
npx vitest run       # unit tests (coordinate math, export pipeline)
```

Sample/test PDFs live in `public/samples/` (regenerate with `node scripts/make-samples.mjs`).

End-to-end verification (needs the dev server running):

```powershell
node scripts/verify-e2e.mjs http://localhost:5173 e2e-shots
node scripts/verify-exported.mjs http://localhost:5173 e2e-shots
```

## Architecture (short version)

Loaded PDF bytes are **immutable**; every user action edits plain-data state
(`pages[]` descriptors + `edits` per page + `formValues`). The viewer projects that
state onto pdf.js canvases as SVG/HTML overlays; **Download** projects the same
state into pdf-lib operations (`src/pdf/exporter.ts`). Page reorder/rotate/delete/merge
only touch the descriptor array — nothing is rewritten until export.

All edit geometry is stored in PDF user space (points, bottom-left origin).
`src/pdf/coords.ts` converts to/from screen pixels via the pdf.js viewport;
`src/pdf/drawHelpers.ts` handles rotated pages at export (verified against
pdf.js's transform in unit tests).

Known limitation: "edit existing text" is whiteout-and-retype; true in-place
content-stream text editing is out of scope for v1. Encrypted/password PDFs and
XFA forms are not supported.

## Deploy

Static hosting; `netlify.toml` included — connect the repo and it builds `dist/` automatically.
