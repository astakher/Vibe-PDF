// Re-opens exported PDFs in the app and screenshots them — visual proof the
// edits were baked into the file, not just shown as overlays.
// Run after verify-e2e.mjs: node scripts/verify-exported.mjs [baseUrl] [shotDir]
import { chromium } from 'playwright'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const SHOTS = process.argv[3] ?? 'e2e-shots'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })

for (const name of ['exported-simple', 'exported-form']) {
  await page.goto(BASE)
  await page.waitForSelector('.drop-zone')
  await page.setInputFiles('input[type=file]', path.join(SHOTS, `${name}.pdf`))
  await page.waitForSelector('.page-view canvas.pdf-canvas', { timeout: 15000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(SHOTS, `roundtrip-${name}.png`) })
  console.log(`captured roundtrip-${name}.png`)
}

await browser.close()
