import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Palette, Play, Volume2, Trash2, Check, X, Monitor, Tv } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AccentKey, Settings } from '../../types'
import {
  getSettings,
  saveSettings,
  getContinueWatching,
  clearResume,
  DEFAULT_SETTINGS,
} from '../../lib/storage'
import { useToast } from './Toast'
import './ui.css'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

const ACCENTS: { key: AccentKey; label: string; color: string }[] = [
  { key: 'crimson', label: 'Crimson', color: '#f5294e' },
  { key: 'azure', label: 'Azure', color: '#2f81f7' },
  { key: 'violet', label: 'Violet', color: '#8b5cf6' },
  { key: 'emerald', label: 'Emerald', color: '#10b981' },
  { key: 'amber', label: 'Amber', color: '#f59e0b' },
]

const PLAYERS: { key: Settings['defaultPlayer']; label: string; icon: ReactNode }[] = [
  { key: 'web', label: 'Web', icon: <Monitor size={15} /> },
  { key: 'mpv', label: 'Native MPV', icon: <Tv size={15} /> },
]

function applyAccent(accent: AccentKey) {
  document.documentElement.setAttribute('data-accent', accent)
}
function applyReduceMotion(on: boolean) {
  document.documentElement.setAttribute('data-reduce-motion', String(on))
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const toast = useToast()
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  // hydrate from storage every time the drawer opens
  useEffect(() => {
    if (open) setSettings(getSettings())
  }, [open])

  // Esc to close + scroll lock while open
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  // single patch helper: optimistic local state + persist
  const patch = useCallback((p: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...p }))
    saveSettings(p)
  }, [])

  const pickAccent = (accent: AccentKey) => {
    patch({ accent })
    applyAccent(accent)
  }

  const toggleReduceMotion = (on: boolean) => {
    patch({ reduceMotion: on })
    applyReduceMotion(on)
  }

  const clearHistory = () => {
    const entries = getContinueWatching(9999)
    entries.forEach((e) => clearResume(e.path))
    toast({
      title: 'Watch history cleared',
      description: entries.length
        ? `Removed ${entries.length} item${entries.length === 1 ? '' : 's'}.`
        : 'Nothing to clear.',
      variant: 'success',
    })
  }

  if (!open) return null

  return createPortal(
    <div className="ui-drawer-overlay" onMouseDown={onClose} role="presentation">
      <aside
        className="ui-drawer"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <header className="ui-drawer__head">
          <h2 className="ui-drawer__title">
            <Palette size={20} /> Settings
          </h2>
          <button className="ui-x" onClick={onClose} aria-label="Close settings">
            <X size={18} />
          </button>
        </header>

        <div className="ui-drawer__body">
          {/* ---------- Appearance ---------- */}
          <section className="ui-section">
            <div className="ui-section__label">Appearance</div>

            <div className="ui-field ui-field--col">
              <div className="ui-field__text">
                <span className="ui-field__name">Accent color</span>
                <span className="ui-field__hint">Tints buttons, highlights and glows.</span>
              </div>
              <div className="ui-swatches" role="radiogroup" aria-label="Accent color">
                {ACCENTS.map((a) => (
                  <button
                    key={a.key}
                    className="ui-swatch"
                    data-active={settings.accent === a.key || undefined}
                    style={{ background: a.color }}
                    onClick={() => pickAccent(a.key)}
                    role="radio"
                    aria-checked={settings.accent === a.key}
                    aria-label={a.label}
                    title={a.label}
                  >
                    {settings.accent === a.key && <Check size={16} />}
                  </button>
                ))}
              </div>
            </div>

            <Toggle
              name="Reduce motion"
              hint="Minimize animations and transitions."
              on={settings.reduceMotion}
              onChange={toggleReduceMotion}
            />
          </section>

          {/* ---------- Playback ---------- */}
          <section className="ui-section">
            <div className="ui-section__label">Playback</div>

            <Toggle
              name="Autoplay next"
              hint="Continue to the next video automatically."
              on={settings.autoplayNext}
              onChange={(v) => patch({ autoplayNext: v })}
            />
            <Toggle
              name="Remember position"
              hint="Resume titles where you left off."
              on={settings.rememberPosition}
              onChange={(v) => patch({ rememberPosition: v })}
            />

            <div className="ui-field ui-field--col">
              <div className="ui-field__text">
                <span className="ui-field__name">
                  <Volume2 size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
                  Default volume
                </span>
              </div>
              <div className="ui-range-row">
                <input
                  className="ui-range"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.defaultVolume}
                  onChange={(e) => patch({ defaultVolume: Number(e.target.value) })}
                  aria-label="Default volume"
                />
                <span className="ui-range-val tabular">
                  {Math.round(settings.defaultVolume * 100)}%
                </span>
              </div>
            </div>

            <div className="ui-field">
              <div className="ui-field__text">
                <span className="ui-field__name">
                  <Play size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
                  Default player
                </span>
                <span className="ui-field__hint">Engine used to open videos.</span>
              </div>
              <div className="ui-seg" role="radiogroup" aria-label="Default player">
                {PLAYERS.map((p) => (
                  <button
                    key={p.key}
                    className="ui-seg__btn"
                    data-active={settings.defaultPlayer === p.key || undefined}
                    onClick={() => patch({ defaultPlayer: p.key })}
                    role="radio"
                    aria-checked={settings.defaultPlayer === p.key}
                  >
                    {p.icon}
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ---------- Metadata & APIs ---------- */}
          <section className="ui-section">
            <div className="ui-section__label">Metadata & APIs</div>
            <div className="ui-field ui-field--col">
              <div className="ui-field__text">
                <span className="ui-field__name">TMDb API Key / Bearer Token</span>
                <span className="ui-field__hint">
                  Used for fetching show/episode thumbnails and matching season/episode titles. If not set, metadata lookup is disabled.
                </span>
              </div>
              <input
                type="text"
                className="ui-input"
                value={settings.tmdbApiKey || ''}
                onChange={(e) => patch({ tmdbApiKey: e.target.value })}
                placeholder="Enter TMDb API Key or Bearer Token..."
              />
            </div>
          </section>

          {/* ---------- Privacy ---------- */}
          <section className="ui-section">
            <div className="ui-section__label">Privacy</div>
            <div className="ui-field">
              <div className="ui-field__text">
                <span className="ui-field__name">Watch history</span>
                <span className="ui-field__hint">Clear your “continue watching” list.</span>
              </div>
              <button className="btn btn-sm ui-danger-btn" onClick={clearHistory}>
                <Trash2 size={15} />
                Clear history
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  )
}

/* --------- local switch control --------- */
function Toggle({
  name,
  hint,
  on,
  onChange,
}: {
  name: string
  hint?: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div className="ui-field">
      <div className="ui-field__text">
        <span className="ui-field__name">{name}</span>
        {hint && <span className="ui-field__hint">{hint}</span>}
      </div>
      <button
        className="ui-switch"
        data-on={on || undefined}
        role="switch"
        aria-checked={on}
        aria-label={name}
        onClick={() => onChange(!on)}
      >
        <span className="ui-switch__knob" />
      </button>
    </div>
  )
}
