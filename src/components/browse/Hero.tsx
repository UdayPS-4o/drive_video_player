import { Play, Info, Sparkles } from 'lucide-react'
import type { DriveItem } from '../../types'
import {
  prettyTitle,
  qualityTag,
  formatSize,
  formatRelative,
  formatTime,
  hueFromString,
  initials,
} from '../../lib/format'

interface HeroProps {
  item: DriveItem
  onPlay: () => void
  onInfo: () => void
  /** When resuming, current time + duration in seconds for a progress bar. */
  resume?: { time: number; duration: number }
}

/** Cinematic featured banner with gradient placeholder art and Play / Info CTAs. */
export default function Hero({ item, onPlay, onInfo, resume }: HeroProps) {
  const h = hueFromString(item.Name)
  const grad = `radial-gradient(120% 120% at 78% 18%, hsl(${(h + 30) % 360} 65% 26%), transparent 60%),
    linear-gradient(135deg, hsl(${h} 58% 22%) 0%, hsl(${(h + 40) % 360} 62% 12%) 100%)`
  const title = prettyTitle(item.Name)
  const tag = qualityTag(item.Name)
  const size = formatSize(item.Size)
  const rel = formatRelative(item.ModTime)
  const pct = resume && resume.duration > 0 ? Math.min(1, resume.time / resume.duration) : 0
  const remaining = resume ? Math.max(0, resume.duration - resume.time) : 0

  return (
    <section className="bx-hero anim-fade" aria-label="Featured">
      <div className="bx-hero-art" style={{ ['--bx-hero-grad' as string]: grad }} />
      <div className="bx-hero-glyph" aria-hidden="true">
        {initials(item.Name)}
      </div>
      <div className="bx-hero-scrim" />
      <div className="bx-hero-grain" />

      <div className="bx-hero-body anim-rise">
        <div className="bx-hero-eyebrow">
          <Sparkles size={14} />
          {resume ? 'Continue watching' : 'Featured'}
        </div>

        <h1 className="bx-hero-title">{title}</h1>

        <div className="bx-hero-meta">
          {tag && <span className="badge badge-accent">{tag}</span>}
          {size !== '—' && <span className="chip tabular">{size}</span>}
          {rel && (
            <>
              <span className="bx-hero-dot" />
              <span style={{ color: 'var(--text-dim)', fontSize: 13, fontWeight: 600 }}>{rel}</span>
            </>
          )}
        </div>

        {resume && pct > 0 && (
          <div className="bx-hero-resume">
            <div className="bx-hero-resume-track">
              <div className="bx-hero-resume-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
            </div>
            <span className="bx-hero-resume-txt tabular">{formatTime(remaining)} left</span>
          </div>
        )}

        <div className="bx-hero-actions">
          <button className="btn btn-primary" onClick={onPlay}>
            <Play size={18} fill="currentColor" />
            {resume ? 'Resume' : 'Play'}
          </button>
          <button className="btn" onClick={onInfo}>
            <Info size={18} />
            {item.IsDir ? 'Open' : 'More info'}
          </button>
        </div>
      </div>
    </section>
  )
}
