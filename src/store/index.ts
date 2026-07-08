import { create } from 'zustand'
import { temporal } from 'zundo'
import type {
  Edit,
  FontFamily,
  FormValue,
  PageDescriptor,
  RGB,
  Rotation,
  SignatureSource,
} from '../model/types'

// ---------------------------------------------------------------------------
// Document store — serializable editing state, undo/redo-tracked via zundo.
// PDF bytes and pdf.js proxies live in src/pdf/registry.ts, never here.
// ---------------------------------------------------------------------------

export type DocState = {
  pages: PageDescriptor[]
  /** keyed by stable pageId so page reorder/delete never orphans edits */
  edits: Record<string, Edit[]>
  formValues: Record<string, FormValue>

  setDocument: (pages: PageDescriptor[]) => void
  appendPages: (pages: PageDescriptor[], atIndex?: number) => void
  movePage: (fromIndex: number, toIndex: number) => void
  rotatePage: (pageId: string, by: 90 | -90) => void
  deletePage: (pageId: string) => void

  addEdit: (edit: Edit) => void
  updateEdit: (id: string, patch: Partial<Edit>) => void
  removeEdit: (id: string) => void

  setFormValue: (name: string, value: FormValue) => void
  seedFormValues: (values: Record<string, FormValue>) => void
}

const rot = (r: Rotation, by: 90 | -90): Rotation => ((((r + by) % 360) + 360) % 360) as Rotation

export const useDocStore = create<DocState>()(
  temporal(
    (set) => ({
      pages: [],
      edits: {},
      formValues: {},

      setDocument: (pages) => set({ pages, edits: {}, formValues: {} }),

      appendPages: (newPages, atIndex) =>
        set((s) => {
          const pages = [...s.pages]
          pages.splice(atIndex ?? pages.length, 0, ...newPages)
          return { pages }
        }),

      movePage: (fromIndex, toIndex) =>
        set((s) => {
          if (fromIndex === toIndex) return s
          const pages = [...s.pages]
          const [moved] = pages.splice(fromIndex, 1)
          pages.splice(toIndex, 0, moved)
          return { pages }
        }),

      rotatePage: (pageId, by) =>
        set((s) => ({
          pages: s.pages.map((p) =>
            p.id === pageId ? { ...p, extraRotation: rot(p.extraRotation, by) } : p,
          ),
        })),

      // Descriptor-only delete: edits stay in the map so undo restores them.
      deletePage: (pageId) =>
        set((s) => ({ pages: s.pages.filter((p) => p.id !== pageId) })),

      addEdit: (edit) =>
        set((s) => ({
          edits: { ...s.edits, [edit.pageId]: [...(s.edits[edit.pageId] ?? []), edit] },
        })),

      updateEdit: (id, patch) =>
        set((s) => {
          const edits: DocState['edits'] = {}
          for (const [pageId, list] of Object.entries(s.edits)) {
            edits[pageId] = list.map((e) => (e.id === id ? ({ ...e, ...patch } as Edit) : e))
          }
          return { edits }
        }),

      removeEdit: (id) =>
        set((s) => {
          const edits: DocState['edits'] = {}
          for (const [pageId, list] of Object.entries(s.edits)) {
            edits[pageId] = list.filter((e) => e.id !== id)
          }
          return { edits }
        }),

      setFormValue: (name, value) =>
        set((s) => ({ formValues: { ...s.formValues, [name]: value } })),

      seedFormValues: (values) =>
        set((s) => ({ formValues: { ...values, ...s.formValues } })),
    }),
    {
      partialize: (s) =>
        ({ pages: s.pages, edits: s.edits, formValues: s.formValues }) as DocState,
      limit: 100,
    },
  ),
)

export const docTemporal = useDocStore.temporal

export const undo = () => docTemporal.getState().undo()
export const redo = () => docTemporal.getState().redo()
/** Coalesce a drag/resize/stroke gesture into a single undo step. */
export const pauseHistory = () => docTemporal.getState().pause()
export const resumeHistory = () => docTemporal.getState().resume()
export const clearHistory = () => docTemporal.getState().clear()

// ---------------------------------------------------------------------------
// UI store — never undo-tracked.
// ---------------------------------------------------------------------------

export type Tool =
  | 'select'
  | 'edittext'
  | 'text'
  | 'whiteout'
  | 'redact'
  | 'highlight'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'ink'
  | 'note'
  | 'signature'

export type Notice = { kind: 'decrypted' | 'no-form' | 'error'; message: string }

export type ToolOptions = {
  color: RGB
  highlightColor: RGB
  strokeWidth: number
  fontSize: number
  fontFamily: FontFamily
}

export type UiState = {
  loaded: boolean
  fileName: string | null
  primaryDocId: string | null
  tool: Tool
  zoom: number
  currentPageIndex: number
  selectedEditId: string | null
  /** edit whose text is being typed into (textarea interactive) */
  editingEditId: string | null
  /** signature waiting to be placed by clicking a page; aspect = width/height */
  pendingSignature: { source: SignatureSource; aspect: number } | null
  /** pageId the user wants scrolled into view (thumbnail click); consumed by DocumentView */
  scrollToPageId: string | null
  toolOptions: ToolOptions
  signatureDialogOpen: boolean
  exportDialogOpen: boolean
  notice: Notice | null

  setNotice: (notice: Notice | null) => void
  setLoadedDocument: (docId: string, fileName: string) => void
  setTool: (tool: Tool) => void
  setZoom: (zoom: number) => void
  setCurrentPageIndex: (i: number) => void
  setSelectedEditId: (id: string | null) => void
  setEditingEditId: (id: string | null) => void
  setPendingSignature: (p: { source: SignatureSource; aspect: number } | null) => void
  requestScrollToPage: (pageId: string | null) => void
  setToolOptions: (patch: Partial<ToolOptions>) => void
  setSignatureDialogOpen: (open: boolean) => void
  setExportDialogOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()((set) => ({
  loaded: false,
  fileName: null,
  primaryDocId: null,
  tool: 'select',
  zoom: 1,
  currentPageIndex: 0,
  selectedEditId: null,
  editingEditId: null,
  pendingSignature: null,
  scrollToPageId: null,
  toolOptions: {
    color: { r: 0.1, g: 0.1, b: 0.1 },
    highlightColor: { r: 1, g: 0.9, b: 0.2 },
    strokeWidth: 2,
    fontSize: 14,
    fontFamily: 'NotoSans',
  },
  signatureDialogOpen: false,
  exportDialogOpen: false,
  notice: null,

  setNotice: (notice) => set({ notice }),
  setLoadedDocument: (docId, fileName) =>
    set({
      loaded: true,
      primaryDocId: docId,
      fileName,
      currentPageIndex: 0,
      selectedEditId: null,
      notice: null,
    }),
  setTool: (tool) => set({ tool, selectedEditId: null, editingEditId: null }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.25, zoom)) }),
  setCurrentPageIndex: (currentPageIndex) => set({ currentPageIndex }),
  setSelectedEditId: (selectedEditId) =>
    set((s) => ({
      selectedEditId,
      editingEditId: s.editingEditId === selectedEditId ? s.editingEditId : null,
    })),
  setEditingEditId: (editingEditId) => set({ editingEditId }),
  setPendingSignature: (pendingSignature) => set({ pendingSignature }),
  requestScrollToPage: (scrollToPageId) => set({ scrollToPageId }),
  setToolOptions: (patch) => set((s) => ({ toolOptions: { ...s.toolOptions, ...patch } })),
  setSignatureDialogOpen: (signatureDialogOpen) => set({ signatureDialogOpen }),
  setExportDialogOpen: (exportDialogOpen) => set({ exportDialogOpen }),
}))
