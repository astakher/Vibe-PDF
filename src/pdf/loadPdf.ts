import { nanoid } from 'nanoid'
import type { PageDescriptor, Rotation } from '../model/types'
import { getDocumentProxy, registerDocument } from './registry'
import { maybeDecrypt } from './decrypt'
import { clearHistory, useDocStore, useUiStore } from '../store'

const normRotation = (r: number): Rotation => ((((r % 360) + 360) % 360) as Rotation)

export async function buildDescriptors(docId: string, bytes: Uint8Array): Promise<PageDescriptor[]> {
  const proxy = await registerDocument(docId, bytes)
  const descriptors: PageDescriptor[] = []
  for (let i = 0; i < proxy.numPages; i++) {
    const page = await proxy.getPage(i + 1)
    const [x1, y1, x2, y2] = page.view // unrotated user-space box
    descriptors.push({
      id: nanoid(8),
      docId,
      sourceIndex: i,
      baseRotation: normRotation(page.rotate),
      extraRotation: 0,
      width: x2 - x1,
      height: y2 - y1,
    })
  }
  return descriptors
}

/** Load a file as the primary document, replacing any current one. */
export async function openPdfFile(file: File): Promise<void> {
  const raw = new Uint8Array(await file.arrayBuffer())
  const { bytes, wasEncrypted } = await maybeDecrypt(raw)
  const docId = nanoid(8)
  const descriptors = await buildDescriptors(docId, bytes)
  useDocStore.getState().setDocument(descriptors)
  clearHistory()
  useUiStore.getState().setLoadedDocument(docId, file.name)
  // XFA (LiveCycle) detection — drives the experimental XFA form mode
  let isXfa = false
  try {
    isXfa = getDocumentProxy(docId).isPureXfa === true
  } catch {
    /* best effort */
  }
  useUiStore.getState().setIsXfa(isXfa)
  void announceDocument(docId, wasEncrypted, isXfa)
}

/** Merge another PDF's pages into the current document at the given index (default: end). */
export async function mergePdfFile(file: File, atIndex?: number): Promise<void> {
  const raw = new Uint8Array(await file.arrayBuffer())
  const { bytes } = await maybeDecrypt(raw)
  const docId = nanoid(8)
  const descriptors = await buildDescriptors(docId, bytes)
  useDocStore.getState().appendPages(descriptors, atIndex)
}

/** Post-load notice: decrypted copy, or guidance when the PDF has no form fields. */
async function announceDocument(docId: string, wasEncrypted: boolean, isXfa: boolean): Promise<void> {
  const { setNotice } = useUiStore.getState()
  if (isXfa) {
    setNotice({
      kind: 'no-form',
      message:
        'This is an Adobe LiveCycle (XFA) form. Vibe PDF shows a limited experimental view — for full functionality, open it in Adobe Acrobat Reader.',
    })
    return
  }
  if (wasEncrypted) {
    setNotice({
      kind: 'decrypted',
      message: "This PDF was password-protected — you're editing an unlocked copy.",
    })
    return
  }
  try {
    const fields = await getDocumentProxy(docId).getFieldObjects()
    const hasFormFields = !!fields && Object.keys(fields).length > 0
    if (!hasFormFields) {
      setNotice({
        kind: 'no-form',
        message:
          'No fillable fields in this PDF — double-click anywhere to type, or use Edit text to change existing text.',
      })
    }
  } catch {
    // notice is best-effort only
  }
}
