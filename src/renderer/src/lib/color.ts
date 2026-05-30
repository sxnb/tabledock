type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const n = parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: RGB): string {
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')
}

/** Mix a hex color toward a target RGB by `amount` (0..1). */
function mix(hex: string, target: RGB, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return toHex([
    rgb[0] + (target[0] - rgb[0]) * amount,
    rgb[1] + (target[1] - rgb[1]) * amount,
    rgb[2] + (target[2] - rgb[2]) * amount
  ])
}

export const lighten = (hex: string, amount: number): string => mix(hex, [255, 255, 255], amount)
export const darken = (hex: string, amount: number): string => mix(hex, [0, 0, 0], amount)
