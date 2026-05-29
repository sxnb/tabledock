import { type SelectHTMLAttributes, forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, className, id, children, ...props },
  ref
) {
  const selectEl = (
    <div className="relative">
      <select
        ref={ref}
        id={id}
        className={cn(
          'h-9 w-full appearance-none rounded-md border border-border bg-surface pl-3 pr-8',
          'text-[13px] text-text transition-colors',
          'hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  )

  if (!label) return selectEl

  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {selectEl}
    </label>
  )
})
