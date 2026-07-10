import type { ReactNode } from 'react'
import { RotateCw } from 'lucide-react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  message: string
  variant?: 'default' | 'error'
  /** Primary action (e.g. retry). */
  onRetry?: () => void
  retryLabel?: string
  /** Optional secondary action node (e.g. a "Browse library" button). */
  action?: ReactNode
}

/** Centered illustrative state for empty folders, no results, and errors. */
export default function EmptyState({
  icon,
  title,
  message,
  variant = 'default',
  onRetry,
  retryLabel = 'Try again',
  action,
}: EmptyStateProps) {
  return (
    <div className="bx-empty anim-fade">
      <div className={`bx-empty-orb${variant === 'error' ? ' is-error' : ''}`}>{icon}</div>
      <div className="bx-empty-title">{title}</div>
      <p className="bx-empty-text">{message}</p>
      {(onRetry || action) && (
        <div className="bx-empty-actions">
          {onRetry && (
            <button className="btn btn-primary" onClick={onRetry}>
              <RotateCw size={16} />
              {retryLabel}
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  )
}
