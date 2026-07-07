// End-to-end verification: drives the running dev server in headless Chromium,
// exercises view → edit → form-fill → export, and validates the downloaded PDFs.
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
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
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
check('undo removes last edit', afterUndo < before, `${before} → ${afterUndo}`)
check('redo restores it', afterRedo === before)

// ---------- 6. export and validate bytes ----------
const dl = page.waitForEvent('download')
await page.click('button[title*="Download the edited PDF"]')
await page.click('.dialog button:has-text("Download edited PDF")')
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
await page.click('.dialog button:has-text("Download edited PDF")')
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
await page.click('.dialog button:has-text("Download edited PDF")')
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

// ---------- 10. rotated source pages render + edit ----------
await page.setInputFiles('input[type=file]', 'public/samples/rotated-pages.pdf')
await page.waitForSelector('.page-view canvas.pdf-canvas', { timeout: 15000 })
await page.waitForTimeout(600)
check('rotated sample opens with 4 pages', (await page.locator('.page-view').count()) === 4)
await shot('08-rotated')

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
