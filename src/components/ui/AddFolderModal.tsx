import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link2, ArrowRight, X } from 'lucide-react'
import Spinner from './Spinner'
import './ui.css'

interface AddFolderModalProps {
  isOpen: boolean
  onClose: () => void
  onConnect: (url: string) => Promise<boolean>
  connecting: boolean
  error?: string | null
}

export default function AddFolderModal({
  isOpen,
  onClose,
  onConnect,
  connecting,
  error,
}: AddFolderModalProps) {
  const [url, setUrl] = useState('')

  if (!isOpen) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed || connecting) return
    const success = await onConnect(trimmed)
    if (success) {
      setUrl('')
      onClose()
    }
  }

  return (
    <div className="ui-modal-overlay">
      <div className="ui-modal-backdrop" onClick={onClose} />
      <div className="ui-modal-content glass anim-scale">
        <button className="ui-modal-close" onClick={onClose} aria-label="Close dialog">
          <X size={18} />
        </button>

        <h3 className="ui-modal-title">Connect a new folder</h3>
        <p className="ui-modal-desc">
          Paste a Google Drive folder link or ID below to add it to your libraries.
        </p>

        <form onSubmit={submit}>
          <div className="ui-connect__inputwrap" style={{ marginTop: 'var(--s-4)' }}>
            <Link2 size={18} />
            <input
              className="ui-connect__input"
              type="text"
              placeholder="Paste link or folder ID..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={connecting}
              spellCheck={false}
              autoComplete="off"
              autoFocus
              aria-label="Google Drive folder link or ID"
            />
            <button
              type="submit"
              className="btn btn-primary ui-connect__submit"
              disabled={connecting || !url.trim()}
            >
              {connecting ? (
                <>
                  <Spinner size={16} stroke={2} />
                  Connecting
                </>
              ) : (
                <>
                  Connect
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="ui-connect__error" role="alert" style={{ marginTop: 'var(--s-3)' }}>
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
