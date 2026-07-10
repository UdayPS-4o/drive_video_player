import { useEffect, useRef, useState } from 'react'
import {
  Search,
  X,
  LayoutGrid,
  List as ListIcon,
  ArrowDownUp,
  ChevronLeft,
  Check,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import type { ViewMode, SortKey, SortDir, SortState } from '../../types'

interface TopBarProps {
  title: string
  subtitle?: string
  /** Back button shown when inside a subfolder (Browse view). */
  onBack?: () => void
  query: string
  onQuery: (value: string) => void
  view: ViewMode
  onView: (view: ViewMode) => void
  sort: SortState
  onSort: (sort: SortState) => void
  onOpenCommand: () => void
}

const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'date', label: 'Date modified' },
  { key: 'size', label: 'Size' },
]

const SORT_DIRS: { dir: SortDir; label: string }[] = [
  { dir: 'asc', label: 'Ascending' },
  { dir: 'desc', label: 'Descending' },
]

/** Sticky glass header: title/back, search, command, view toggle, sort menu. */
export default function TopBar({
  title,
  subtitle,
  onBack,
  query,
  onQuery,
  view,
  onView,
  sort,
  onSort,
  onOpenCommand,
}: TopBarProps) {
  const [sortOpen, setSortOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Close the sort menu on Escape.
  useEffect(() => {
    if (!sortOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSortOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sortOpen])

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <header className="bx-topbar">
      <div className="bx-topbar-lead">
        {onBack && (
          <button className="bx-iconbtn" onClick={onBack} title="Back" aria-label="Back">
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="bx-topbar-title">
          <h1 className="truncate">{title}</h1>
          {subtitle && <span className="bx-topbar-sub truncate">{subtitle}</span>}
        </div>
      </div>

      <span className="bx-topbar-grow" />

      <div className="bx-topbar-tools">
        <label className="bx-search">
          <Search size={17} className="bx-search-ico" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search this library…"
            spellCheck={false}
            aria-label="Search the library"
          />
          {query && (
            <button
              className="bx-search-clear"
              onClick={() => {
                onQuery('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </label>

        <button className="bx-cmd" onClick={onOpenCommand} title="Open command palette">
          <Search size={15} />
          <span className="kbd">{isMac ? '⌘' : 'Ctrl'}</span>
          <span className="kbd">K</span>
        </button>

        <span className="bx-divider-v" />

        <div className="bx-seg" role="group" aria-label="View mode">
          <button
            className={`bx-seg-btn${view === 'grid' ? ' is-active' : ''}`}
            onClick={() => onView('grid')}
            title="Grid view"
            aria-pressed={view === 'grid'}
          >
            <LayoutGrid size={17} />
          </button>
          <button
            className={`bx-seg-btn${view === 'list' ? ' is-active' : ''}`}
            onClick={() => onView('list')}
            title="List view"
            aria-pressed={view === 'list'}
          >
            <ListIcon size={17} />
          </button>
        </div>

        <div className="bx-sort">
          <button
            className="bx-iconbtn"
            onClick={() => setSortOpen((v) => !v)}
            title="Sort"
            aria-haspopup="menu"
            aria-expanded={sortOpen}
          >
            <ArrowDownUp size={17} />
          </button>

          {sortOpen && (
            <>
              <div className="bx-backdrop" onClick={() => setSortOpen(false)} />
              <div className="bx-sort-menu glass surface" role="menu">
                <div className="bx-sort-group">
                  <div className="bx-sort-head">Sort by</div>
                  {SORT_KEYS.map(({ key, label }) => (
                    <button
                      key={key}
                      className={`bx-sort-opt${sort.key === key ? ' is-active' : ''}`}
                      onClick={() => onSort({ ...sort, key })}
                      role="menuitemradio"
                      aria-checked={sort.key === key}
                    >
                      <span className="bx-sort-check">{sort.key === key && <Check size={15} />}</span>
                      <span className="bx-sort-opt-grow">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="bx-sort-group">
                  <div className="bx-sort-head">Order</div>
                  {SORT_DIRS.map(({ dir, label }) => (
                    <button
                      key={dir}
                      className={`bx-sort-opt${sort.dir === dir ? ' is-active' : ''}`}
                      onClick={() => onSort({ ...sort, dir })}
                      role="menuitemradio"
                      aria-checked={sort.dir === dir}
                    >
                      <span className="bx-sort-check">{sort.dir === dir && <Check size={15} />}</span>
                      <span className="bx-sort-opt-grow">{label}</span>
                      {dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
