export type Point = { x: number; y: number }

/** PDF user space: points (1/72"), origin bottom-left, unrotated page. (x, y) = bottom-left corner. */
export type Rect = { x: number; y: number; w: number; h: number }

export type RGB = { r: number; g: number; b: number } // 0..1

export type Rotation = 0 | 90 | 180 | 270

export type PageDescriptor = {
  id: string
  docId: string
  /** 0-based page index in the source document */
  sourceIndex: number
  /** /Rotate from the source page */
  baseRotation: Rotation
  /** user-applied rotation, additive to baseRotation */
  extraRotation: Rotation
  /** unrotated media box, points */
  width: number
  height: number
}

export type FontFamily = 'NotoSans' | 'NotoSansBold' | 'Helvetica'

export type CursiveFont = 'GreatVibes' | 'Pacifico' | 'Satisfy'

type BaseEdit = { id: string; pageId: string; z: number }

export type TextBoxEdit = BaseEdit & {
  type: 'text'
  rect: Rect
  text: string
  fontFamily: FontFamily
  fontSize: number
  color: RGB
}

export type WhiteoutEdit = BaseEdit & { type: 'whiteout'; rect: Rect; color: RGB }

/** Permanent black box; at export the whole page is rasterized with these burned in. */
export type RedactEdit = BaseEdit & { type: 'redact'; rect: Rect }

export type HighlightEdit = BaseEdit & { type: 'highlight'; rect: Rect; color: RGB; opacity: number }

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow'

export type ShapeEdit = BaseEdit & {
  type: 'shape'
  shape: ShapeKind
  /** rect for rect/ellipse */
  rect?: Rect
  /** endpoints for line/arrow */
  p1?: Point
  p2?: Point
  stroke: RGB
  strokeWidth: number
  fill?: RGB
}

export type InkEdit = BaseEdit & {
  type: 'ink'
  /** strokes, each an array of PDF-space points */
  points: Point[][]
  stroke: RGB
  strokeWidth: number
}

export type NoteEdit = BaseEdit & { type: 'note'; at: Point; text: string; color: RGB }

export type SignatureSource =
  | { kind: 'image'; pngDataUrl: string }
  | { kind: 'typed'; text: string; font: CursiveFont }

export type SignatureEdit = BaseEdit & { type: 'signature'; rect: Rect; source: SignatureSource }

export type Edit =
  | TextBoxEdit
  | WhiteoutEdit
  | RedactEdit
  | HighlightEdit
  | ShapeEdit
  | InkEdit
  | NoteEdit
  | SignatureEdit

export type EditType = Edit['type']

export type FormValue = string | boolean | string[]

/** Fixed render order of edit layers on a page (lower = drawn first / underneath). */
export const LAYER_ORDER: Record<EditType, number> = {
  whiteout: 0,
  highlight: 1,
  shape: 2,
  ink: 2,
  text: 3,
  signature: 4,
  redact: 5,
  note: 6,
}

export function sortEditsForRender(edits: Edit[]): Edit[] {
  return [...edits].sort((a, b) => LAYER_ORDER[a.type] - LAYER_ORDER[b.type] || a.z - b.z)
}

export function totalRotation(p: PageDescriptor): Rotation {
  return (((p.baseRotation + p.extraRotation) % 360) + 360) % 360 as Rotation
}

/** CSS display size of a page at a given zoom (accounts for rotation swapping w/h). */
export function pageCssSize(p: PageDescriptor, zoom: number): { width: number; height: number } {
  const rot = totalRotation(p)
  const swap = rot === 90 || rot === 270
  return {
    width: (swap ? p.height : p.width) * zoom,
    height: (swap ? p.width : p.height) * zoom,
  }
}
