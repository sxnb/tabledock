import { Ban, Check, Plus } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

interface ColorPickerProps {
  value: string | null
  onChange: (color: string | null) => void
  presets: string[]
  /** Show a "no color" option that yields null. */
  allowNone?: boolean
  /** Show a native custom-color swatch. */
  allowCustom?: boolean
}

const SWATCH = 'grid h-7 w-7 place-items-center rounded-full transition-transform hover:scale-110'

/** A reusable row of color swatches: optional none + presets + optional custom. */
export function ColorPicker({
  value,
  onChange,
  presets,
  allowNone = true,
  allowCustom = false
}: ColorPickerProps): React.JSX.Element {
  const isCustom = allowCustom && value != null && !presets.includes(value)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowNone && (
        <button
          type="button"
          title="No color"
          onClick={() => onChange(null)}
          className={cn(
            SWATCH,
            'border border-border text-faint hover:text-text',
            !value && 'ring-2 ring-accent ring-offset-2 ring-offset-surface'
          )}
        >
          <Ban size={13} />
        </button>
      )}
      {presets.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          onClick={() => onChange(color)}
          style={{ background: color }}
          className={cn(
            SWATCH,
            'border border-white/10',
            value === color && 'ring-2 ring-white/80 ring-offset-2 ring-offset-surface'
          )}
        >
          {value === color && <Check size={13} className="text-white" />}
        </button>
      ))}
      {allowCustom && (
        <label
          title="Custom color"
          style={isCustom ? { background: value as string } : undefined}
          className={cn(
            SWATCH,
            'cursor-pointer border',
            isCustom
              ? 'border-white/10 text-white ring-2 ring-white/80 ring-offset-2 ring-offset-surface'
              : 'border-border text-faint hover:text-text'
          )}
        >
          <input
            type="color"
            value={value ?? '#2b2150'}
            onChange={(e) => onChange(e.target.value)}
            className="sr-only"
          />
          {isCustom ? <Check size={13} /> : <Plus size={13} />}
        </label>
      )}
    </div>
  )
}
