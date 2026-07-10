import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  House,
  FolderOpen,
  Star,
  Clock,
  Settings,
  Clapperboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  HardDrive,
} from 'lucide-react'
import type { SavedFolder } from '../../types'

export type NavTab = 'home' | 'browse' | 'favorites' | 'recent'

interface SidebarProps {
  active: NavTab
  onNavigate: (tab: NavTab) => void
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenSettings: () => void
  favCount: number
  recentCount: number
  folders: SavedFolder[]
  onAddFolder: () => void
  onDeleteFolder: (id: string) => void
  onRenameFolder: (id: string, name: string) => void
}

interface ItemDef {
  tab: NavTab
  label: string
  icon: ReactNode
  count?: number
}

function NavButton({
  label,
  icon,
  active,
  count,
  onClick,
}: {
  label: string
  icon: ReactNode
  active?: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button
      className={`bx-navitem${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      {active && <span className="bx-navitem-rail" />}
      <span className="bx-navitem-ico">{icon}</span>
      <span className="bx-navitem-text">{label}</span>
      {count != null && count > 0 && <span className="bx-navitem-count">{count}</span>}
      <span className="bx-tip">{label}</span>
    </button>
  )
}

interface FolderNavButtonProps {
  folder: SavedFolder
  collapsed: boolean
  onDelete: () => void
  onRename: (name: string) => void
}

function FolderNavButton({
  folder,
  collapsed,
  onDelete,
  onRename,
}: FolderNavButtonProps) {
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState(folder.name)

  const handleRenameSubmit = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    const trimmed = newName.trim()
    if (trimmed && trimmed !== folder.name) {
      onRename(trimmed)
    }
    setEditing(false)
  }

  if (editing && !collapsed) {
    return (
      <div className="bx-navitem bx-navitem--edit" onClick={(e) => e.stopPropagation()}>
        <span className="bx-navitem-ico" style={{ opacity: 0.6 }}><HardDrive size={18} /></span>
        <input
          type="text"
          className="bx-folder-rename-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit(e)
            if (e.key === 'Escape') setEditing(false)
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <button className="btn-icon btn-success-sm" onClick={handleRenameSubmit} style={{ padding: 2, display: 'inline-flex' }}>
          <Check size={14} />
        </button>
        <button className="btn-icon" onClick={() => setEditing(false)} style={{ padding: 2, display: 'inline-flex' }}>
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div
      className="bx-navitem bx-folder-navitem"
      style={{ cursor: 'default' }}
    >
      <span className="bx-navitem-ico">
        <HardDrive size={20} />
      </span>
      <span className="bx-navitem-text truncate" style={{ marginRight: 'auto' }}>{folder.name}</span>
      <span className="bx-tip">{folder.name}</span>
      
      {!collapsed && (
        <span className="bx-folder-actions">
          <span
            className="bx-folder-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
            title="Rename library"
            style={{ cursor: 'pointer' }}
          >
            <Edit2 size={13} />
          </span>
          <span
            className="bx-folder-action-btn bx-folder-action-btn--danger"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            title="Delete library"
            style={{ cursor: 'pointer' }}
          >
            <Trash2 size={13} />
          </span>
        </span>
      )}
    </div>
  )
}

export default function Sidebar({
  active,
  onNavigate,
  collapsed,
  onToggleCollapse,
  onOpenSettings,
  favCount,
  recentCount,
  folders,
  onAddFolder,
  onDeleteFolder,
  onRenameFolder,
}: SidebarProps) {
  const items: ItemDef[] = [
    { tab: 'home', label: 'Home', icon: <House size={20} /> },
    { tab: 'browse', label: 'Browse', icon: <FolderOpen size={20} /> },
    { tab: 'favorites', label: 'My List', icon: <Star size={20} />, count: favCount },
    { tab: 'recent', label: 'Recent', icon: <Clock size={20} />, count: recentCount },
  ]

  return (
    <aside className="bx-sidebar">
      <div className="bx-sidebar-header">
        <div className="bx-brand">
          <span className="bx-brand-mark">
            <Clapperboard size={20} />
          </span>
          <span className="bx-brand-word">
            AURORA<span className="bx-brand-dot">.</span>
          </span>
          <span className="bx-tip">Aurora</span>
        </div>

        <button
          className="bx-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="bx-nav" aria-label="Primary">
        {!collapsed && <div className="bx-nav-label">Library</div>}
        {items.map((it) => (
          <NavButton
            key={it.tab}
            label={it.label}
            icon={it.icon}
            count={it.count}
            active={active === it.tab}
            onClick={() => onNavigate(it.tab)}
          />
        ))}
      </nav>

      {/* Folders List Section */}
      <div className="bx-sidebar-folders">
        {!collapsed && (
          <div className="bx-sidebar-folders-head">
            <div className="bx-nav-label">Folders</div>
            <button
              className="bx-folder-action-btn"
              onClick={onAddFolder}
              title="Add library folder"
            >
              <Plus size={15} />
            </button>
          </div>
        )}

        <div className="bx-nav bx-sidebar-folders-list">
          {folders.map((f) => (
            <FolderNavButton
              key={f.id}
              folder={f}
              collapsed={collapsed}
              onDelete={() => onDeleteFolder(f.id)}
              onRename={(name) => onRenameFolder(f.id, name)}
            />
          ))}
          {collapsed && (
            <button className="bx-navitem" onClick={onAddFolder} title="Add library folder">
              <span className="bx-navitem-ico">
                <Plus size={20} />
              </span>
              <span className="bx-tip">Add library folder</span>
            </button>
          )}
        </div>
      </div>

      <div className="bx-sidebar-foot">
        <button className="bx-navitem" onClick={onOpenSettings}>
          <span className="bx-navitem-ico">
            <Settings size={20} />
          </span>
          <span className="bx-navitem-text">Settings</span>
          <span className="bx-tip">Settings</span>
        </button>
      </div>
    </aside>
  )
}
