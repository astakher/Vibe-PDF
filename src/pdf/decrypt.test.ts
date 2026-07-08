import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import createModule from '@neslinesli93/qpdf-wasm'
import { PasswordProtectedError, compressLossless, isEncrypted, maybeDecrypt } from './decrypt'
import { exportPdf } from './exporter'
import type { EmbeddableFont } from './fonts'

const WASM_PATH = fileURLToPath(
  new URL('../../node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm', import.meta.url),
)

const FONT_FILES: Record<EmbeddableFont, string> = {
  NotoSans: 'NotoSans-Regular.ttf',
  NotoSansBold: 'NotoSans-Bold.ttf',
  GreatVibes: 'GreatVibes-Regular.ttf',
  Pacifico: 'Pacifico-Regular.ttf',
  Satisfy: 'Satisfy-Regular.ttf',
}
const getFontBytes = async (name: EmbeddableFont) =>
  new Uint8Array(await readFile(new URL(`../assets/fonts/${FONT_FILES[name]}`, import.meta.url)))

/** Encrypt bytes with qpdf-wasm; userPw '' = owner-locked (opens without password). */
async function encrypt(bytes: Uint8Array, userPw: string, ownerPw: string): Promise<Uint8Array> {
  const qpdf = await createModule({ locateFile: () => WASM_PATH })
  const fs = qpdf.FS as typeof qpdf.FS & { writeFile: (p: string, d: Uint8Array) => void }
  fs.writeFile('/in.pdf', bytes)
  let code: number
  try {
    code = qpdf.callMain(['--encrypt', userPw, ownerPw, '256', '--', '/in.pdf', '/out.pdf'])
  } catch (e) {
    code = (e as { status?: number })?.status ?? 1
  }
  if (code !== 0 && code !== 3) throw new Error(`qpdf --encrypt failed with exit ${code}`)
  return qpdf.FS.readFile('/out.pdf')
}

let plainForm: Uint8Array

beforeAll(async () => {
  plainForm = new Uint8Array(await readFile(new URL('../../public/samples/form.pdf', import.meta.url)))
})

describe('isEncrypted', () => {
  it('is false for a plain PDF and true after qpdf --encrypt', async () => {
    expect(isEncrypted(plainForm)).toBe(false)
    const enc = await encrypt(plainForm, '', 'owner-secret')
    expect(isEncrypted(enc)).toBe(true)
  })
})

describe('maybeDecrypt', () => {
  it('passes plain bytes through untouched', async () => {
    const { bytes, wasEncrypted } = await maybeDecrypt(plainForm, WASM_PATH)
    expect(wasEncrypted).toBe(false)
    expect(bytes).toBe(plainForm)
  })

  it('decrypts an owner-locked PDF so the full form-fill export pipeline works', async () => {
    const enc = await encrypt(plainForm, '', 'owner-secret')

    // control: pdf-lib on the ENCRYPTED bytes cannot resolve real field names
    const encDoc = await PDFDocument.load(enc, { ignoreEncryption: true })
    const encNames = encDoc.getForm().getFields().map((f) => f.getName())
    expect(encNames).not.toContain('applicant.name')

    const { bytes, wasEncrypted } = await maybeDecrypt(enc, WASM_PATH)
    expect(wasEncrypted).toBe(true)
    expect(isEncrypted(bytes)).toBe(false)

    // the exact pipeline that is broken without decryption
    const { bytes: out, warnings } = await exportPdf({
      primaryDocId: 'main',
      pages: [
        { id: 'p0', docId: 'main', sourceIndex: 0, baseRotation: 0, extraRotation: 0, width: 612, height: 792 },
      ],
      edits: {},
      formValues: { 'applicant.name': 'Amanpreet Takher', 'applicant.subscribe': true },
      flattenForm: false,
      getBytes: () => bytes,
      getFontBytes,
    })
    expect(warnings).toEqual([])
    const reloaded = await PDFDocument.load(out)
    expect(reloaded.getPageCount()).toBe(1)
    expect(reloaded.getForm().getTextField('applicant.name').getText()).toBe('Amanpreet Takher')
    expect(reloaded.getForm().getCheckBox('applicant.subscribe').isChecked()).toBe(true)
  })

  it('throws PasswordProtectedError for user-password files', async () => {
    const enc = await encrypt(plainForm, 'user-secret', 'owner-secret')
    await expect(maybeDecrypt(enc, WASM_PATH)).rejects.toBeInstanceOf(PasswordProtectedError)
  })
})

describe('compressLossless', () => {
  it('produces a valid, loadable PDF (typically smaller)', async () => {
    const big = new Uint8Array(
      await readFile(new URL('../../public/samples/large-100pages.pdf', import.meta.url)),
    )
    const out = await compressLossless(big, WASM_PATH)
    expect(out).not.toBeNull()
    const doc = await PDFDocument.load(out!)
    expect(doc.getPageCount()).toBe(100)
  })
})
