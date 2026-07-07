import { nanoid } from 'nanoid'
import type { PageDescriptor, Rotation } from '../model/types'
import { registerDocument } from './registry'
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
  const bytes = new Uint8Array(await file.arrayBuffer())
  const docId = nanoid(8)
  const descriptors = await buildDescriptors(docId, bytes)
  useDocStore.getState().setDocument(descriptors)
  clearHistory()
  useUiStore.getState().setLoadedDocument(docId, file.name)
}

/** Merge another PDF's pages into the current document at the given index (default: end). */
export async function mergePdfFile(file: File, atIndex?: number): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const docId = nanoid(8)
  const descriptors = await buildDescriptors(docId, bytes)
  useDocStore.getState().appendPages(descriptors, atIndex)
}
