/**
 * qpdf (WASM, lazy-loaded) wrapper. Two jobs:
 * - decrypt owner-password-protected PDFs at load time (pdf-lib can't decrypt,
 *   so filling/drawing/saving encrypted files would produce corrupt output)
 * - lossless restructuring for the "Basic" compression level
 */

export class PasswordProtectedError extends Error {
  constructor() {
    super("This PDF requires a password to open — password-protected files aren't supported yet.")
    this.name = 'PasswordProtectedError'
  }
}

const ENCRYPT_MARKER = '/Encrypt'

/** Cheap byte-scan; false positives are harmless (qpdf --decrypt on a plain file just rewrites it). */
export function isEncrypted(bytes: Uint8Array): boolean {
  const pat: number[] = []
  for (const c of ENCRYPT_MARKER) pat.push(c.charCodeAt(0))
  outer: for (let i = 0; i <= bytes.length - pat.length; i++) {
    if (bytes[i] !== pat[0]) continue
    for (let j = 1; j < pat.length; j++) {
      if (bytes[i + j] !== pat[j]) continue outer
    }
    return true
  }
  return false
}

/**
 * Run qpdf with the given CLI args against `input` (mounted at /in.pdf; args must
 * write /out.pdf). Fresh module instance per call — reusing one across callMain
 * invocations is unreliable. Exit code 3 = success with warnings.
 * @param wasmUrl injection point for node/vitest (filesystem path to qpdf.wasm);
 *                omitted in the browser, where the wasm resolves as a Vite asset.
 */
export async function runQpdf(
  args: string[],
  input: Uint8Array,
  wasmUrl?: string,
): Promise<{ code: number; out: Uint8Array | null }> {
  const url = wasmUrl ?? (await import('@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url')).default
  const createModule = (await import('@neslinesli93/qpdf-wasm')).default
  const qpdf = await createModule({ locateFile: () => url })
  const fs = qpdf.FS as typeof qpdf.FS & { writeFile: (path: string, data: Uint8Array) => void }
  fs.writeFile('/in.pdf', input)

  let code: number
  try {
    code = qpdf.callMain(args)
  } catch (e) {
    // Emscripten may throw ExitStatus instead of returning
    code = typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : 1
  }

  let out: Uint8Array | null = null
  if (code === 0 || code === 3) {
    try {
      out = qpdf.FS.readFile('/out.pdf')
    } catch {
      out = null
    }
  }
  return { code, out }
}

/**
 * Returns decrypted bytes for protected PDFs, the original bytes otherwise.
 * @throws PasswordProtectedError when the file needs a user password (qpdf exit 2).
 */
export async function maybeDecrypt(
  bytes: Uint8Array,
  wasmUrl?: string,
): Promise<{ bytes: Uint8Array; wasEncrypted: boolean }> {
  if (!isEncrypted(bytes)) return { bytes, wasEncrypted: false }
  const { out } = await runQpdf(['--decrypt', '/in.pdf', '/out.pdf'], bytes, wasmUrl)
  if (!out) throw new PasswordProtectedError()
  return { bytes: out, wasEncrypted: true }
}

/** Lossless restructure — the "Basic" compression level. Returns null if qpdf fails. */
export async function compressLossless(bytes: Uint8Array, wasmUrl?: string): Promise<Uint8Array | null> {
  const { out } = await runQpdf(
    [
      '--object-streams=generate',
      '--recompress-flate',
      '--compression-level=9',
      '--stream-data=compress',
      '/in.pdf',
      '/out.pdf',
    ],
    bytes,
    wasmUrl,
  )
  return out
}
