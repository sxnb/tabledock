import { cn } from '@renderer/lib/cn'

interface SliderProps {
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  onChange: (value: number) => void
  className?: string
}

export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  disabled,
  onChange,
  className
}: SliderProps): React.JSX.Element {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ accentColor: 'var(--color-accent)' }}
      className={cn(
        'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    />
  )
}
