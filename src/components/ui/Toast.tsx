import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, CheckCircle2, XCircle, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ToastVariant, ToastMessage } from '../../types'
import './ui.css'

type PushToast = (t: {
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}) => void

const DEFAULT_DURATION = 3500

const ToastContext = createContext<PushToast | null>(null)

const ICONS: Record<ToastVariant, ReactNode> = {
  default: <Sparkles size={18} />,
  success: <CheckCircle2 size={18} />,
  error: <XCircle size={18} />,
  info: <Info size={18} />,
}

/** Returns a function that pushes a toast. No-op when used outside a provider. */
export function useToast(): PushToast {
  const ctx = useContext(ToastContext)
  return ctx ?? noop
}

function noop() {
  /* used outside provider — do nothing rather than crash */
}

let counter = 0
function nextId(): string {
  counter += 1
  return `t_${Date.now()}_${counter}`
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  // track timers so we can clean them up on unmount
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const remove = useCallback((id: string) => {
    // play the exit animation, then drop from state
    setLeaving((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    const exit = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      setLeaving((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      timers.current.delete(id)
    }, 260)
    timers.current.set(id + ':exit', exit)
  }, [])

  const push = useCallback<PushToast>(
    (t) => {
      const id = nextId()
      const duration = t.duration ?? DEFAULT_DURATION
      const toast: ToastMessage = {
        id,
        title: t.title,
        description: t.description,
        variant: t.variant ?? 'default',
        duration,
      }
      setToasts((prev) => [toast, ...prev])
      const timer = setTimeout(() => remove(id), duration)
      timers.current.set(id, timer)
    },
    [remove],
  )

  // clear all pending timers on unmount
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => clearTimeout(t))
      map.clear()
    }
  }, [])

  const dismiss = useCallback(
    (id: string) => {
      const t = timers.current.get(id)
      if (t) {
        clearTimeout(t)
        timers.current.delete(id)
      }
      remove(id)
    },
    [remove],
  )

  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="ui-toast-stack" role="region" aria-label="Notifications">
          {toasts.map((t) => {
            const variant = t.variant ?? 'default'
            return (
              <div
                key={t.id}
                className={`ui-toast ui-toast--${variant}`}
                data-leaving={leaving.has(t.id) || undefined}
                role="status"
                aria-live="polite"
              >
                <span className="ui-toast__icon">{ICONS[variant]}</span>
                <div className="ui-toast__body">
                  <div className="ui-toast__title">{t.title}</div>
                  {t.description && <div className="ui-toast__desc">{t.description}</div>}
                </div>
                <button
                  className="ui-toast__close"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                >
                  <X size={15} />
                </button>
                <span
                  className="ui-toast__progress"
                  style={{ animationDuration: `${t.duration ?? DEFAULT_DURATION}ms` }}
                />
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
