import { useState } from 'react'
import {
  Sparkles,
  Link2,
  ArrowRight,
  XCircle,
  Zap,
  Play,
  Eye,
  Trash2,
  Edit2,
  Check,
  X,
  HardDrive,
} from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import Spinner from './Spinner'
import type { SavedFolder } from '../../types'
import './ui.css'

interface ConnectScreenProps {
  onConnect: (url: string) => void
  connecting: boolean
  error?: string | null
  folders: SavedFolder[]
  onDeleteFolder: (id: string) => void
  onRenameFolder: (id: string, name: string) => void
}

const PILLS: { icon: ReactNode; label: string }[] = [
  { icon: <Zap size={14} />, label: '4K / HEVC' },
  { icon: <Play size={14} />, label: 'Resume anywhere' },
  { icon: <Eye size={14} />, label: 'Subtitles' },
]

export default function ConnectScreen({
  onConnect,
  connecting,
  error,
  folders,
  onDeleteFolder,
  onRenameFolder,
}: ConnectScreenProps) {
  const [url, setUrl] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed || connecting) return
    onConnect(trimmed)
  }

  return (
    <div className="ui-connect">
      {/* animated aurora backdrop */}
      <div className="ui-connect__bg" aria-hidden="true">
        <div className="ui-connect__blob ui-connect__blob--a" />
        <div className="ui-connect__blob ui-connect__blob--b" />
        <div className="ui-connect__blob ui-connect__blob--c" />
      </div>
      <div className="ui-connect__grain" aria-hidden="true" />

      <div className="ui-connect__inner">
        <span className="ui-connect__badge">
          <Sparkles size={14} />
          Cinematic Google Drive player
        </span>

        <h1 className="ui-connect__wordmark">AURORA</h1>
        <p className="ui-connect__tagline">
          Your Drive. <b>Cinematic.</b>
        </p>

        <form className="ui-connect__form" onSubmit={submit}>
          <div className="ui-connect__inputwrap">
            <Link2 size={18} />
            <input
              className="ui-connect__input"
              type="text"
              placeholder="Paste a Google Drive folder link or ID"
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
            <div className="ui-connect__error" role="alert">
              <XCircle size={16} />
              {error}
            </div>
          )}
        </form>

        {/* Saved Folders List */}
        {folders.length > 0 && (
          <div className="ui-connect__saved-folders">
            <h3 className="ui-connect__saved-title">Saved Libraries</h3>
            <div className="ui-connect__saved-list">
              {folders.map((f) => (
                <SavedFolderCard
                  key={f.id}
                  folder={f}
                  onConnect={onConnect}
                  onDelete={onDeleteFolder}
                  onRename={onRenameFolder}
                  disabled={connecting}
                />
              ))}
            </div>
          </div>
        )}

        <div className="ui-connect__pills">
          {PILLS.map((p) => (
            <span className="ui-connect__pill" key={p.label}>
              {p.icon}
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function SavedFolderCard({
  folder,
  onConnect,
  onDelete,
  onRename,
  disabled,
}: {
  folder: SavedFolder
  onConnect: (url: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  disabled: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState(folder.name)

  const handleRenameSubmit = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    const trimmed = newName.trim()
    if (trimmed && trimmed !== folder.name) {
      onRename(folder.id, trimmed)
    }
    setEditing(false)
  }

  const handleCardClick = () => {
    if (!disabled && !editing) {
      onConnect(folder.url)
    }
  }

  return (
    <div
      className={`ui-connect__folder-card glass${disabled ? ' is-disabled' : ''}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCardClick()
        }
      }}
    >
      <div className="ui-connect__folder-icon">
        <HardDrive size={20} />
      </div>
      <div className="ui-connect__folder-info">
        {editing ? (
          <div className="ui-connect__folder-rename" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              className="ui-connect__folder-rename-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit(e)
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <button className="btn-icon btn-success-sm" onClick={handleRenameSubmit}>
              <Check size={14} />
            </button>
            <button className="btn-icon" onClick={() => setEditing(false)}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <span className="ui-connect__folder-name truncate">{folder.name}</span>
            <span className="ui-connect__folder-url truncate">{folder.url}</span>
          </>
        )}
      </div>
      {!editing && (
        <div className="ui-connect__folder-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn-icon"
            onClick={() => setEditing(true)}
            title="Rename library"
            disabled={disabled}
          >
            <Edit2 size={14} />
          </button>
          <button
            className="btn-icon ui-danger-btn"
            onClick={() => onDelete(folder.id)}
            title="Delete library"
            disabled={disabled}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
