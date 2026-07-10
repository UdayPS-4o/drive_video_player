import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { ReactNode, MouseEvent } from 'react'
import './ui.css'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: number
}

/** Accessible centered dialog with backdrop + Esc dismissal and scroll lock. */
export default function Modal({ open, onClose, title, children, width = 520 }: ModalProps) {
  // Esc to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // lock background scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const stop = (e: MouseEvent) => e.stopPropagation()

  return createPortal(
    <div
      className="ui-overlay"
      style={{ zIndex: 'var(--z-modal)' }}
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="ui-modal"
        style={{ maxWidth: width }}
        onMouseDown={stop}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {title && (
          <header className="ui-modal__head">
            <h2 className="ui-modal__title">{title}</h2>
            <button className="ui-x" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </header>
        )}
        <div className="ui-modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
