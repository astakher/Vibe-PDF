// Generates the sample PDFs used for manual testing (public/samples/).
// Run: node scripts/make-samples.mjs
import { writeFile, mkdir } from 'node:fs/promises'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

const outDir = new URL('../public/samples/', import.meta.url)
await mkdir(outDir, { recursive: true })

async function save(doc, name) {
  const bytes = await doc.save()
  await writeFile(new URL(name, outDir), bytes)
  console.log(`wrote ${name} (${bytes.length} bytes)`)
}

// --- simple-text.pdf: 3 letter pages with text and a grid to eyeball coordinates
{
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let p = 0; p < 3; p++) {
    const page = doc.addPage([612, 792])
    page.drawText(`Sample document — page ${p + 1}`, { x: 72, y: 720, size: 24, font })
    for (let i = 1; i < 8; i++) {
      page.drawLine({ start: { x: 0, y: i * 100 }, end: { x: 612, y: i * 100 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) })
      page.drawText(`y=${i * 100}`, { x: 5, y: i * 100 + 2, size: 8, font, color: rgb(0.6, 0.6, 0.6) })
    }
    for (let i = 1; i < 7; i++) {
      page.drawLine({ start: { x: i * 100, y: 0 }, end: { x: i * 100, y: 792 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) })
      page.drawText(`x=${i * 100}`, { x: i * 100 + 2, y: 5, size: 8, font, color: rgb(0.6, 0.6, 0.6) })
    }
    page.drawText(
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      { x: 72, y: 650, size: 12, font, maxWidth: 468, lineHeight: 18 },
    )
  }
  await save(doc, 'simple-text.pdf')
}

// --- rotated-pages.pdf: pages with /Rotate 0, 90, 180, 270
{
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const rot of [0, 90, 180, 270]) {
    const page = doc.addPage([612, 792])
    page.setRotation(degrees(rot))
    page.drawText(`/Rotate ${rot}`, { x: 72, y: 700, size: 30, font })
    page.drawText('TOP-LEFT of unrotated space', { x: 10, y: 770, size: 10, font, color: rgb(1, 0, 0) })
    page.drawRectangle({ x: 0, y: 782, width: 612, height: 10, color: rgb(1, 0.8, 0.8) })
  }
  await save(doc, 'rotated-pages.pdf')
}

// --- form.pdf: AcroForm with text, multiline, checkbox, radio group, dropdown
{
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([612, 792])
  const form = doc.getForm()
  page.drawText('Test Form', { x: 72, y: 730, size: 24, font })

  page.drawText('Name:', { x: 72, y: 692, size: 12, font })
  const name = form.createTextField('applicant.name')
  name.addToPage(page, { x: 140, y: 685, width: 250, height: 20 })

  page.drawText('Comments:', { x: 72, y: 650, size: 12, font })
  const comments = form.createTextField('applicant.comments')
  comments.enableMultiline()
  comments.addToPage(page, { x: 140, y: 590, width: 320, height: 70 })

  page.drawText('Subscribe:', { x: 72, y: 550, size: 12, font })
  const sub = form.createCheckBox('applicant.subscribe')
  sub.addToPage(page, { x: 140, y: 545, width: 16, height: 16 })

  page.drawText('Size:', { x: 72, y: 510, size: 12, font })
  const size = form.createRadioGroup('applicant.size')
  const labels = ['small', 'medium', 'large']
  labels.forEach((l, i) => {
    size.addOptionToPage(l, page, { x: 140 + i * 90, y: 505, width: 16, height: 16 })
    page.drawText(l, { x: 160 + i * 90, y: 508, size: 10, font })
  })

  page.drawText('Country:', { x: 72, y: 465, size: 12, font })
  const country = form.createDropdown('applicant.country')
  country.addOptions(['Canada', 'Czechia', 'Germany', 'India', 'USA'])
  country.addToPage(page, { x: 140, y: 458, width: 160, height: 20 })

  await save(doc, 'form.pdf')
}

// --- large-100pages.pdf
{
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let p = 0; p < 100; p++) {
    const page = doc.addPage([612, 792])
    page.drawText(`Page ${p + 1} of 100`, { x: 72, y: 720, size: 36, font })
    page.drawText(String((p + 1) % 10).repeat(60), { x: 40, y: 400, size: 12, font })
  }
  await save(doc, 'large-100pages.pdf')
}
