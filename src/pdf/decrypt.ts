/**
 * Owner-password-protected PDFs (common for government/real-estate forms) render
 * fine in pdf.js, but pdf-lib cannot decrypt — filling/drawing/saving produces a
 * corrupt file. So we decrypt ONCE at load time with qpdf (WASM, lazy-loaded) and
 * every downstream consumer (viewer, forms, exporter) works on decrypted bytes.
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
 * Returns decrypted bytes for protected PDFs, the original bytes otherwise.
 * @param wasmUrl injection point for node/vitest (filesystem path to qpdf.wasm);
 *                omitted in the browser, where the wasm resolves as a Vite asset.
 * @throws PasswordProtectedError when the file needs a user password (qpdf exit 2).
 */
export async function maybeDecrypt(
  bytes: Uint8Array,
  wasmUrl?: string,
): Promise<{ bytes: Uint8Array; wasEncrypted: boolean }> {
  if (!isEncrypted(bytes)) return { bytes, wasEncrypted: false }

  const url = wasmUrl ?? (await import('@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url')).default
  const createModule = (await import('@neslinesli93/qpdf-wasm')).default
  // fresh instance per call — reusing a module across callMain invocations is unreliable
  const qpdf = await createModule({ locateFile: () => url })
  const fs = qpdf.FS as typeof qpdf.FS & { writeFile: (path: string, data: Uint8Array) => void }
  fs.writeFile('/in.pdf', bytes)

  let exitCode: number
  try {
    exitCode = qpdf.callMain(['--decrypt', '/in.pdf', '/out.pdf'])
  } catch (e) {
    // Emscripten may throw ExitStatus instead of returning
    exitCode = typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : 1
  }

  // 0 = success, 3 = success with warnings
  if (exitCode !== 0 && exitCode !== 3) throw new PasswordProtectedError()
  return { bytes: qpdf.FS.readFile('/out.pdf'), wasEncrypted: true }
}
