import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import './ui.css'

export interface Command {
  id: string
  title: string
  hint?: string
  group?: string
  icon?: ReactNode
  keywords?: string
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  commands: Command[]
}

const UNGROUPED = 'Commands'

function matches(cmd: Command, q: string): boolean {
  if (!q) return true
  const hay = `${cmd.title} ${cmd.keywords ?? ''} ${cmd.group ?? ''}`.toLowerCase()
  const needle = q.toLowerCase().trim()
  // loose subsequence: every char of the query appears in order
  let i = 0
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++
  }
  return i === needle.length
}

export default function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // flat, filtered, order-preserving list (used for keyboard nav)
  const filtered = useMemo(
    () => commands.filter((c) => matches(c, query)),
    [commands, query],
  )

  // grouped view (preserves first-seen group order)
  const groups = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, Command[]>()
    for (const c of filtered) {
      const g = c.group ?? UNGROUPED
      if (!map.has(g)) {
        map.set(g, [])
        order.push(g)
      }
      map.get(g)!.push(c)
    }
    return order.map((g) => ({ label: g, items: map.get(g)! }))
  }, [filtered])

  // reset query + highlight whenever the palette opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // focus after paint
      const id = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [open])

  // keep highlight in range as the filtered list shrinks
  useEffect(() => {
    setActive((a) => (filtered.length === 0 ? 0 : Math.min(a, filtered.length - 1)))
  }, [filtered.length])

  // scroll the active item into view
  useEffect(() => {
    if (!open) return
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

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

  const runAt = (idx: number) => {
    const cmd = filtered[idx]
    if (!cmd) return
    cmd.run()
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (filtered.length ? (a + 1) % filtered.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (filtered.length ? (a - 1 + filtered.length) % filtered.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runAt(active)
    }
  }

  // map a command back to its index in `filtered` for highlight/hover
  const indexOf = (cmd: Command) => filtered.indexOf(cmd)

  return createPortal(
    <div
      className="ui-overlay ui-overlay--top"
      style={{ zIndex: 'var(--z-modal)' }}
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="ui-cmdk"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="ui-cmdk__search">
          <Search size={18} />
          <input
            ref={inputRef}
            className="ui-cmdk__input"
            placeholder="Search commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Search commands"
          />
        </div>

        <div className="ui-cmdk__list" ref={listRef} role="listbox">
          {filtered.length === 0 ? (
            <div className="ui-cmdk__empty">No commands found</div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div className="ui-cmdk__group-label">{group.label}</div>
                {group.items.map((cmd) => {
                  const idx = indexOf(cmd)
                  const isActive = idx === active
                  return (
                    <button
                      key={cmd.id}
                      className="ui-cmdk__item"
                      data-active={isActive || undefined}
                      role="option"
                      aria-selected={isActive}
                      onMouseMove={() => setActive(idx)}
                      onClick={() => runAt(idx)}
                    >
                      {cmd.icon && <span className="ui-cmdk__item-icon">{cmd.icon}</span>}
                      <span className="ui-cmdk__item-title truncate">{cmd.title}</span>
                      {cmd.hint && <span className="ui-cmdk__item-hint">{cmd.hint}</span>}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="ui-cmdk__foot">
          <span className="ui-cmdk__foot-item">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd>
            navigate
          </span>
          <span className="ui-cmdk__foot-item">
            <kbd className="kbd">
              <CornerDownLeft size={12} />
            </kbd>
            select
          </span>
          <span className="ui-cmdk__foot-item">
            <kbd className="kbd">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
