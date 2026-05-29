import { Loader2 } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

export function Spinner({
  size = 16,
  className
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return <Loader2 size={size} className={cn('animate-spin text-accent', className)} />
}
