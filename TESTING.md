# Manual test checklist

Automated coverage: `npx vitest run` (coords/rotation math vs pdf.js, exporter:
form fill, flatten, reorder/delete/rotate/merge, every edit type on a rotated page)
and `node scripts/verify-e2e.mjs` (browser: open → edit → export → validate bytes).

Run the checks below by hand before a release — appearance-stream and annotation
rendering differ between viewers, which automation can't judge.

## Per release

Samples: `public/samples/` (`simple-text`, `form`, `form-protected`, `w9-form`, `rotated-pages`, `large-100pages`).

1. **Viewers** — open an exported file (with text, whiteout, highlight, ink, shapes,
   note, signature, filled form) in **Acrobat Reader, Chrome, and Edge**:
   - values of filled fields visible in all three (flattened AND unflattened export)
   - sticky note opens on click
   - highlight doesn't obscure text underneath
2. **W-9** (`w9-form.pdf`) — fill name/address/TIN boxes + checkboxes, export both
   flattened and unflattened, re-open in Acrobat.
2b. **Protected form** (`form-protected.pdf`, or a real OREA form) — "unlocked copy"
   banner appears, fields typeable, exported file opens cleanly with values intact.
2c. **Edit text / double-click** — `Edit text` click on a printed line opens a
   prefilled box over a whiteout (one Ctrl+Z removes both); double-click on empty
   space with Select active drops a new text box.
2d. **Multi-merge** — pick 2+ files in one Merge action; all pages append in order.
2e. **Redact** — draw a box over sensitive text, download, reopen the export in a
   viewer, try to select/copy the covered text: it must be gone (that page is now
   an image). Confirm the "converted to images" notice appeared.
2f. **Split** — every page / every N / custom ranges; 3+ parts arrive as one .zip.
2g. **Compress** — Basic keeps text selectable; Moderate/Strong shrink more but
   pages become images. Dialog shows before → after size.
2h. **Print** — Print button opens the system print dialog with the edited content.
2i. **Rename** — set a custom file name in the Download tab; saved file uses it.
3. **Rotated pages** (`rotated-pages.pdf`) — add text + signature on the 90° and 270°
   pages; exported text must read upright and sit where it was placed.
4. **Zoom levels** — repeat one edit of each kind at 50%, 100%, 240%; positions must
   match after export.
5. **Page ops** — merge a second PDF, drag-reorder across the merge boundary, rotate,
   delete, extract "2-3"; check order/count/rotation in the export. Expect the
   "form was flattened" notice when the source had a form.
6. **Large doc** (`large-100pages.pdf`) — scroll end to end with DevTools →
   Performance monitor open; memory should plateau (pages virtualize), scrolling stays responsive.
7. **Undo** — Ctrl+Z through a whole session ending at a clean document; redo it all back.
8. **Roundtrip** — re-open your exported file in the app itself; re-export; nothing duplicates or shifts.

## Known gaps / v2 candidates

- True in-place text editing (content-stream rewrite; `Edit text` is whiteout+retype
  with text detection)
- Text-selection highlight (needs pdf.js text layer)
- User-password-encrypted PDFs (owner-locked PDFs are decrypted at load via
  qpdf-wasm), XFA forms, digital (cryptographic) signatures
- Export runs on the main thread; a worker would help on 500+ page docs
- CropBox with non-zero origin is untested (coordinates assume MediaBox at 0,0)
