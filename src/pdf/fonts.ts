import notoSansUrl from '../assets/fonts/NotoSans-Regular.ttf?url'
import notoSansBoldUrl from '../assets/fonts/NotoSans-Bold.ttf?url'
import greatVibesUrl from '../assets/fonts/GreatVibes-Regular.ttf?url'
import pacificoUrl from '../assets/fonts/Pacifico-Regular.ttf?url'
import satisfyUrl from '../assets/fonts/Satisfy-Regular.ttf?url'
import type { CursiveFont, FontFamily } from '../model/types'

/** Font faces available for embedding. 'Helvetica' is a pdf-lib StandardFont (no bytes). */
export type EmbeddableFont = Exclude<FontFamily, 'Helvetica'> | CursiveFont

const urls: Record<EmbeddableFont, string> = {
  NotoSans: notoSansUrl,
  NotoSansBold: notoSansBoldUrl,
  GreatVibes: greatVibesUrl,
  Pacifico: pacificoUrl,
  Satisfy: satisfyUrl,
}

/** CSS font-family name matching each embeddable font (see assets/fonts/fonts.css). */
export const cssFontFamily: Record<EmbeddableFont | 'Helvetica', string> = {
  NotoSans: "'NotoSans', sans-serif",
  NotoSansBold: "'NotoSansBold', sans-serif",
  Helvetica: 'Helvetica, Arial, sans-serif',
  GreatVibes: "'GreatVibes', cursive",
  Pacifico: "'Pacifico', cursive",
  Satisfy: "'Satisfy', cursive",
}

const cache = new Map<EmbeddableFont, Promise<Uint8Array>>()

export function getFontBytes(name: EmbeddableFont): Promise<Uint8Array> {
  let p = cache.get(name)
  if (!p) {
    p = fetch(urls[name])
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load font ${name}: ${r.status}`)
        return r.arrayBuffer()
      })
      .then((b) => new Uint8Array(b))
    cache.set(name, p)
  }
  return p
}
