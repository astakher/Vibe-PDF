// End-to-end verification: drives the running dev server in headless Chromium,
// exercises view -> edit -> form-fill -> export, and validates the downloaded PDFs.
// Run: node scripts/verify-e2e.mjs [baseUrl] [shotDir]
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const SHOTS = process.argv[3] ?? 'e2e-shots'
await mkdir(SHOTS, { recursive: true })

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` -- ${extra}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })

// ---------- 1. load app + open sample ----------
await page.goto(BASE)
await page.waitForSelector('.drop-zone')
await shot('01-empty-state')

await page.setInputFiles('input[type=file]', 'public/samples/simple-text.pdf')
await page.waitForSelector('.page-view canvas.pdf-canvas', { timeout: 15000 })
await page.waitForTimeout(600) // let the debounced render finish
check('PDF opens and renders', await page.locator('.page-view').count() === 3, '3 pages')
check('thumbnails render', (await page.locator('.thumbnail canvas').count()) === 3)
await shot('02-viewer')

// ---------- 2. add a text box ----------
await page.click('button[title*="Add text"]')
const pageBox = await page.locator('.page-view').first().boundingBox()
await page.mouse.click(pageBox.x + 200, pageBox.y + 300)
await page.waitForSelector('.text-edit')
await page.keyboard.type('Added by e2e test')
await page.mouse.click(pageBox.x + 500, pageBox.y + 600) // blur/deselect
check('text box created', (await page.locator('.text-edit').count()) === 1)
await shot('03-text-added')

// ---------- 3. whiteout drag ----------
await page.click('button[title*="Whiteout"]')
await page.mouse.move(pageBox.x + 150, pageBox.y + 380)
await page.mouse.down()
await page.mouse.move(pageBox.x + 350, pageBox.y + 420, { steps: 5 })
await page.mouse.up()
check('whiteout created', (await page.locator('.edits-svg rect').count()) >= 1)

// ---------- 4. highlight + shape + ink ----------
await page.keyboard.press('Escape')
await page.click('button[title*="Highlight"]')
await page.mouse.move(pageBox.x + 120, pageBox.y + 200)
await page.mouse.down()
await page.mouse.move(pageBox.x + 420, pageBox.y + 220, { steps: 4 })
await page.mouse.up()
await page.keyboard.press('Escape')
await page.click('button[title*="Draw freehand"]')
await page.mouse.move(pageBox.x + 200, pageBox.y + 500)
await page.mouse.down()
for (let i = 0; i < 12; i++) await page.mouse.move(pageBox.x + 200 + i * 12, pageBox.y + 500 + Math.sin(i) * 24, { steps: 2 })
await page.mouse.up()
check('annotations drawn', (await page.locator('.edits-svg *').count()) >= 3)
await shot('04-annotations')

// ---------- 5. undo/redo ----------
await page.keyboard.press('Escape')
const before = await page.locator('.edits-svg *').count()
await page.keyboard.press('Control+z')
const afterUndo = await page.locator('.edits-svg *').count()
await page.keyboard.press('Control+y')
const afterRedo = await page.locator('.edits-svg *').count()
check('undo removes last edit', afterUndo < before, `${before} -> ${afterUndo}`)
check('redo restores it', afterRedo === before)

// ---------- 6. export and validate bytes ----------
const dl = page.waitForEvent('download')
await page.click('button[title*="Download the edited PDF"]')
await page.click('.dialog button.primary')
const download = await dl
const outPath = path.join(SHOTS, 'exported-simple.pdf')
await download.saveAs(outPath)
const { readFile } = await import('node:fs/promises')
const outBytes = await readFile(outPath)
check('export downloads a PDF', outBytes.subarray(0, 5).toString() === '%PDF-', `${outBytes.length} bytes`)
const reloaded = await PDFDocument.load(outBytes)
check('exported PDF re-parses with 3 pages', reloaded.getPageCount() === 3)
await page.keyboard.press('Escape')

// ---------- 7. page management: rotate + delete via thumbnails ----------
await page.hover('.thumbnail >> nth=1')
await page.click('.thumbnail >> nth=1 >> button[title*="Rotate"]')
await page.hover('.thumbnail >> nth=2')
await page.click('.thumbnail >> nth=2 >> button[title*="Delete"]')
await page.waitForTimeout(300)
check('page deleted via thumbnail', (await page.locator('.thumbnail').count()) === 2)
await shot('05-page-ops')

const dl2 = page.waitForEvent('download')
await page.click('button[title*="Download the edited PDF"]')
await page.click('.dialog button.primary')
const download2 = await dl2
const outPath2 = path.join(SHOTS, 'exported-pageops.pdf')
await download2.saveAs(outPath2)
const out2 = await PDFDocument.load(await readFile(outPath2))
check('page-ops export has 2 pages', out2.getPageCount() === 2)
check('rotation persisted in export', out2.getPage(1).getRotation().angle === 90, `angle=${out2.getPage(1).getRotation().angle}`)
await page.keyboard.press('Escape')

// ---------- 8. form fill on form.pdf ----------
await page.setInputFiles('input[type=file]', 'public/samples/form.pdf')
await page.waitForSelector('.form-layer input[type=text]', { timeout: 15000 })
await page.fill('.form-layer input[type=text] >> nth=0', 'Amanpreet Takher')
await page.check('.form-layer input[type=checkbox]')
await page.check('.form-layer input[type=radio] >> nth=1')
await page.selectOption('.form-layer select', 'Czechia')
await shot('06-form-filled')

const dl3 = page.waitForEvent('download')
await page.click('button[title*="Download the edited PDF"]')
await page.click('.dialog button.primary')
const outPath3 = path.join(SHOTS, 'exported-form.pdf')
await (await dl3).saveAs(outPath3)
const out3 = await PDFDocument.load(await readFile(outPath3))
const form = out3.getForm()
check('form text persisted', form.getTextField('applicant.name').getText() === 'Amanpreet Takher')
check('form checkbox persisted', form.getCheckBox('applicant.subscribe').isChecked())
check('form radio persisted', form.getRadioGroup('applicant.size').getSelected() === 'medium', form.getRadioGroup('applicant.size').getSelected())
check('form dropdown persisted', (form.getDropdown('applicant.country').getSelected() ?? [])[0] === 'Czechia')

// ---------- 9. typed signature ----------
await page.click('button[title*="Add a signature"]')
await page.click('.dialog button:has-text("Type")')
await page.fill('.dialog input.text-input', 'Amanpreet')
await page.click('.dialog button:has-text("Place signature")')
const formPageBox = await page.locator('.page-view').first().boundingBox()
await page.mouse.click(formPageBox.x + 300, formPageBox.y + 500)
check('typed signature placed', (await page.locator('.sig-typed').count()) === 1)
await shot('07-signature')

// ---------- 9b. protected PDF: decrypt banner + fill + valid export ----------
await page.setInputFiles('input[type=file]', 'public/samples/form-protected.pdf')
// wait on the NEW document (previous doc also had form inputs -- don't match stale DOM)
await page.waitForSelector('.file-name[title*="form-protected"]', { timeout: 15000 })
const bannerAppeared = await page
  .waitForSelector('.info-banner.info-decrypted', { timeout: 15000 })
  .then(() => true)
  .catch(() => false)
check('decrypted banner shown', bannerAppeared)
await page.waitForSelector('.form-layer input[type=text]', { timeout: 15000 })
await page.fill('.form-layer input[type=text] >> nth=0', 'Protected Fill')
const dlp = page.waitForEvent('download')
await page.click('button[title*="Download the edited PDF"]')
await page.click('.dialog button.primary')
const outPathP = path.join(SHOTS, 'exported-protected.pdf')
await (await dlp).saveAs(outPathP)
try {
  const outP = await PDFDocument.load(await readFile(outPathP))
  check('protected export re-parses (not corrupt)', outP.getPageCount() === 1)
  check('protected export field persisted', outP.getForm().getTextField('applicant.name').getText() === 'Protected Fill')
} catch (e) {
  check('protected export re-parses (not corrupt)', false, String(e))
}
await page.keyboard.press('Escape')
await shot('09-protected-form')

// ---------- 9c. edit-text tool + double-click + tool auto-return ----------
await page.setInputFiles('input[type=file]', 'public/samples/simple-text.pdf')
await page.waitForSelector('.file-name[title*="simple-text"]', { timeout: 15000 })
await page.waitForSelector('.page-view canvas.pdf-canvas', { timeout: 15000 })
await page.waitForTimeout(600)
const noFormBanner = await page
  .waitForSelector('.info-banner.info-no-form', { timeout: 10000 })
  .then(() => true)
  .catch(() => false)
check('no-form banner shown on plain PDF', noFormBanner)

const sBox = await page.locator('.page-view').first().boundingBox()
await page.click('button:has-text("Edit text")')
await page.mouse.click(sBox.x + 120, sBox.y + 62) // heading "Sample document -- page 1"
await page.waitForSelector('.text-edit', { timeout: 5000 })
const prefilled = await page.locator('.text-edit').inputValue()
check('edit-text prefills clicked line', prefilled.includes('Sample document'), JSON.stringify(prefilled))
check('edit-text adds whiteout under it', (await page.locator('.edits-svg rect').count()) >= 1)
await shot('10-edittext')
await page.mouse.click(sBox.x + 400, sBox.y + 700) // blur (resumes history)
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)
check(
  'one undo removes whiteout+text pair',
  (await page.locator('.text-edit').count()) === 0 && (await page.locator('.edits-svg rect').count()) === 0,
)

await page.mouse.dblclick(sBox.x + 300, sBox.y + 500)
await page.waitForTimeout(300)
check('double-click creates a text box', (await page.locator('.text-edit').count()) === 1)
await page.keyboard.press('Escape')

await page.click('button[title="Rectangle"]')
await page.mouse.move(sBox.x + 100, sBox.y + 300)
await page.mouse.down()
await page.mouse.move(sBox.x + 200, sBox.y + 350, { steps: 3 })
await page.mouse.up()
await page.waitForTimeout(200)
const selectClass = await page.locator('button:has-text("Select")').getAttribute('class')
check('drag tool auto-returns to Select', selectClass.includes('active'), selectClass)

// ---------- 10. rotated source pages render + edit ----------
await page.setInputFiles('input[type=file]', 'public/samples/rotated-pages.pdf')
await page.waitForSelector('.page-view canvas.pdf-canvas', { timeout: 15000 })
await page.waitForTimeout(600)
check('rotated sample opens with 4 pages', (await page.locator('.page-view').count()) === 4)
await shot('08-rotated')

// ---------- 11. v2: multi-file merge ----------
await page.setInputFiles('input[type=file]', 'public/samples/simple-text.pdf')
await page.waitForSelector('.file-name[title*="simple-text"]', { timeout: 15000 })
await page.waitForTimeout(400)
await page.setInputFiles('.toolbar input[type=file] >> nth=1', [
  'public/samples/form.pdf',
  'public/samples/rotated-pages.pdf',
])
await page.waitForFunction(() => document.querySelectorAll('.thumbnail').length === 8, null, { timeout: 20000 })
check('multi-merge appends both files', (await page.locator('.thumbnail').count()) === 8, '3+1+4 pages')

// ---------- 12. v2: rename on download ----------
const dlName = page.waitForEvent('download')
await page.click('button[title*="Download the edited PDF"]')
await page.fill('.dialog .filename-row input', 'custom-name')
await page.click('.dialog button.primary')
const renamed = await dlName
check('rename on download honored', renamed.suggestedFilename() === 'custom-name.pdf', renamed.suggestedFilename())
await page.keyboard.press('Escape')

// ---------- 13. v2: print creates hidden print frame ----------
await page.click('button[title*="Print the edited PDF"]')
const printFrame = await page
  .waitForSelector('iframe[data-purpose="print"]', { timeout: 20000, state: 'attached' })
  .then(() => true)
  .catch(() => false)
check('print spawns hidden print frame', printFrame)

// ---------- 14. v2: TRUE redaction removes text ----------
await page.setInputFiles('input[type=file]', 'public/samples/simple-text.pdf')
// same file name as the merged doc — wait for the page count to drop back to 3
await page.waitForFunction(() => document.querySelectorAll('.thumbnail').length === 3, null, { timeout: 15000 })
await page.waitForSelector('.page-view canvas.pdf-canvas', { timeout: 15000 })
await page.waitForTimeout(500)
const rBox = await page.locator('.page-view').first().boundingBox()
await page.click('button[title*="Redact"]')
await page.mouse.move(rBox.x + 60, rBox.y + 40)
await page.mouse.down()
await page.mouse.move(rBox.x + 400, rBox.y + 90, { steps: 4 })
await page.mouse.up()
check('redact box drawn', (await page.locator('.edits-svg rect').count()) === 1)
const dlR = page.waitForEvent('download')
await page.click('button[title*="Download the edited PDF"]')
await page.click('.dialog button.primary')
const outPathR = path.join(SHOTS, 'exported-redacted.pdf')
await (await dlR).saveAs(outPathR)
await page.keyboard.press('Escape')
{
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const redactedBytes = new Uint8Array(await readFile(outPathR))
  const loadingTask = pdfjs.getDocument({ data: redactedBytes })
  const doc = await loadingTask.promise
  const t1 = (await (await doc.getPage(1)).getTextContent()).items.map((i) => i.str).join('')
  const t2 = (await (await doc.getPage(2)).getTextContent()).items.map((i) => i.str).join('')
  check('redacted page has NO extractable text', t1.trim() === '', JSON.stringify(t1.slice(0, 40)))
  check('other pages keep their text', t2.includes('page 2'))
  await loadingTask.destroy().catch(() => {})
}

// ---------- 15. v2: split every page -> zip (fresh doc, no redaction) ----------
await page.setInputFiles('input[type=file]', 'public/samples/simple-text.pdf')
await page.waitForSelector('.page-view canvas.pdf-canvas', { timeout: 15000 })
await page.waitForTimeout(400)
const dlS = page.waitForEvent('download', { timeout: 60000 })
await page.click('button[title*="Download the edited PDF"]')
await page.click('.dialog .tabs button:has-text("Split")')
await page.click('.dialog button.primary')
const splitErr = await page.locator('.dialog .error').textContent().catch(() => null)
if (splitErr) console.log('  split dialog error:', splitErr)
const zipDl = await dlS
const zipPath = path.join(SHOTS, 'split.zip')
await zipDl.saveAs(zipPath)
check('split downloads a zip', zipDl.suggestedFilename().endsWith('.zip'), zipDl.suggestedFilename())
{
  const { unzipSync } = await import('fflate')
  const entries = unzipSync(new Uint8Array(await readFile(zipPath)))
  const names = Object.keys(entries)
  check('zip contains one PDF per page', names.length === 3, names.join(', '))
  check(
    'zip entries are valid PDFs',
    names.every((n) => Buffer.from(entries[n].subarray(0, 5)).toString() === '%PDF-'),
  )
}
await page.keyboard.press('Escape')

// ---------- 16. v2: compress (basic) ----------
await page.setInputFiles('input[type=file]', 'public/samples/large-100pages.pdf')
await page.waitForSelector('.file-name[title*="large-100pages"]', { timeout: 15000 })
await page.waitForSelector('.page-view canvas.pdf-canvas', { timeout: 15000 })
const dlC = page.waitForEvent('download')
await page.click('button[title*="Download the edited PDF"]')
await page.click('.dialog .tabs button:has-text("Compress")')
await page.click('.dialog button.primary')
const compDl = await dlC
const compPath = path.join(SHOTS, 'compressed-basic.pdf')
await compDl.saveAs(compPath)
{
  const compBytes = await readFile(compPath)
  const compDoc = await PDFDocument.load(compBytes)
  check('compressed PDF re-parses with 100 pages', compDoc.getPageCount() === 100, `${compBytes.length} bytes`)
  const statusText = await page.locator('.dialog .status-ok').textContent().catch(() => null)
  check('compress reports before/after size', !!statusText, statusText ?? '')
}
await page.keyboard.press('Escape')
await shot('11-glass-ui')

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
