import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { useToasts, type ToastType } from '@renderer/store/toasts'
import { cn } from '@renderer/lib/cn'

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={15} className="text-ok" />,
  error: <AlertTriangle size={15} className="text-danger" />,
  info: <Info size={15} className="text-accent" />
}

/** Fixed bottom-right stack of auto-dismissing toast notifications. */
export function ToastViewport(): React.JSX.Element {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'dd-toast-in pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5 shadow-xl'
          )}
        >
          <span className="mt-0.5 shrink-0">{ICONS[t.type]}</span>
          <span className="min-w-0 flex-1 text-xs leading-relaxed text-text">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="-mr-1 -mt-0.5 shrink-0 rounded p-0.5 text-faint hover:text-text"
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
