import type { RGB } from '../model/types'

export function rgbToHex(c: RGB): string {
  const h = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return { r: 0, g: 0, b: 0 }
  const n = parseInt(m[1], 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

export function rgbCss(c: RGB, alpha = 1): string {
  const v = (x: number) => Math.round(x * 255)
  return alpha < 1 ? `rgba(${v(c.r)},${v(c.g)},${v(c.b)},${alpha})` : `rgb(${v(c.r)},${v(c.g)},${v(c.b)})`
}
