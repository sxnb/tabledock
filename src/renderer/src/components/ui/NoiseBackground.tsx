import { lighten, darken } from '@renderer/lib/color'

/**
 * Generate a tile of random grayscale static as a PNG data URI (once). Drawn
 * at a small resolution and upscaled with `image-rendering: pixelated`, it
 * reads as chunky pixel noise rather than smooth grain.
 */
let cachedNoise: string | null = null
function pixelNoise(): string {
  if (cachedNoise) return cachedNoise
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.createImageData(size, size)
  for (let i = 0; i < image.data.length; i += 4) {
    const v = (Math.random() * 255) | 0
    image.data[i] = v
    image.data[i + 1] = v
    image.data[i + 2] = v
    image.data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  cachedNoise = canvas.toDataURL('image/png')
  return cachedNoise
}

/** A soft multi-stop mesh derived from a single base color. */
function buildGradient(color: string): string {
  return [
    `radial-gradient(120% 75% at 0% 0%, ${lighten(color, 0.16)}, transparent 55%)`,
    `radial-gradient(120% 75% at 100% 15%, ${lighten(color, 0.05)}, transparent 50%)`,
    `linear-gradient(165deg, ${darken(color, 0.04)}, ${darken(color, 0.24)})`
  ].join(', ')
}

interface NoiseBackgroundProps {
  color: string | null
  /** Noise opacity, 0..1. */
  noise: number
}

/**
 * Arc-style background layer: a mesh gradient with a configurable pixelated
 * noise overlay. Renders nothing when no color is chosen. Absolutely
 * positioned, so the host element must be `relative`; content sits above it.
 */
export function NoiseBackground({ color, noise }: NoiseBackgroundProps): React.JSX.Element | null {
  if (!color) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: buildGradient(color) }} />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${pixelNoise()}")`,
          // Source tile is 128px; upscaling to 256px makes each pixel a 2px block.
          backgroundSize: '256px 256px',
          imageRendering: 'pixelated',
          opacity: noise,
          mixBlendMode: 'overlay'
        }}
      />
    </div>
  )
}
