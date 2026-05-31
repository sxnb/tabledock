import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  /** Auto-dismiss delay in ms; 0 keeps it until dismissed. */
  duration: number
}

interface ToastState {
  toasts: Toast[]
  push: (type: ToastType, message: string, duration?: number) => void
  dismiss: (id: string) => void
}

const DEFAULTS: Record<ToastType, number> = { success: 3000, info: 3500, error: 6000 }

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (type, message, duration) => {
    const id = crypto.randomUUID()
    const toast: Toast = { id, type, message, duration: duration ?? DEFAULTS[type] }
    set((state) => ({ toasts: [...state.toasts, toast] }))
    if (toast.duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
      }, toast.duration)
    }
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))

/** Imperative helper so non-component code can raise toasts. */
export const toast = {
  success: (message: string, duration?: number): void =>
    useToasts.getState().push('success', message, duration),
  error: (message: string, duration?: number): void =>
    useToasts.getState().push('error', message, duration),
  info: (message: string, duration?: number): void =>
    useToasts.getState().push('info', message, duration)
}
