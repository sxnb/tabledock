import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@renderer/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, className, id, ...props },
  ref
) {
  const inputEl = (
    <input
      ref={ref}
      id={id}
      className={cn(
        'h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] text-text',
        'placeholder:text-faint transition-colors',
        'hover:border-border-strong focus:border-accent focus:outline-none',
        'focus:ring-2 focus:ring-accent/30',
        className
      )}
      {...props}
    />
  )

  if (!label) return inputEl

  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {inputEl}
    </label>
  )
})
