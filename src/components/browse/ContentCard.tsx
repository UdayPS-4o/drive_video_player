import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { Play, Folder, Film, Star, ChevronRight, CheckCircle } from 'lucide-react'
import type { DriveItem, ViewMode } from '../../types'
import {
  formatSize,
  formatRelative,
  prettyTitle,
  qualityTag,
  hueFromString,
  initials,
  parseVideoTitle,
} from '../../lib/format'
import { isFavorite, toggleFavorite, getSettings, isWatched } from '../../lib/storage'

interface ContentCardProps {
  item: DriveItem
  onOpen: () => void
  /** Resume progress 0..1; renders a pinned accent bar + sub-label when present. */
  progress?: number
  layout: ViewMode
  /** Optional override for the sub-text (e.g. "watched 3d ago"). */
  subtitle?: string
  /** Stagger index for entrance animation. */
  index?: number
}

function cardGradient(name: string): string {
  const h = hueFromString(name)
  return `linear-gradient(135deg, hsl(${h} 55% 28%), hsl(${(h + 40) % 360} 60% 16%))`
}

/** The gorgeous browsing tile — poster placeholder, hover overlay, favorite + meta. */
export default function ContentCard({
  item,
  onOpen,
  progress,
  layout,
  subtitle,
  index = 0,
}: ContentCardProps) {
  const isGroup = !!item.IsGroup
  const isDir = item.IsDir && !isGroup
  
  const parsed = useMemo(() => parseVideoTitle(item.Name), [item.Name])
  const title = isDir
    ? item.Name
    : parsed.isSeries && parsed.season != null && parsed.episode != null
      ? `${parsed.title} - S${String(parsed.season).padStart(2, '0')}E${String(parsed.episode).padStart(2, '0')}${parsed.episodeTitle ? ` - ${parsed.episodeTitle}` : ''}`
      : prettyTitle(item.Name)

  const isEpisode = parsed.isSeries && parsed.season != null && parsed.episode != null
  const isPortrait = isGroup || (!isDir && !isEpisode)

  const tag = isGroup ? 'Series' : (isDir ? null : qualityTag(item.Name))
  const fav = isFavorite(item.Path)
  const grad = cardGradient(item.Name)
  const sizeLabel = formatSize(item.Size)
  const relLabel = formatRelative(item.ModTime)
  const epCount = item.GroupItems?.length || 0
  const sub = subtitle ?? (isGroup ? `${epCount} ${epCount === 1 ? 'Episode' : 'Episodes'}` : (isDir ? 'Folder' : [sizeLabel, relLabel].filter(Boolean).join('  ·  ')))

  const [posterUrl, setPosterUrl] = useState<string | null>(null)

  useEffect(() => {
    if (isDir && !isGroup) return
    
    const queryTitle = item.SeriesTitle || parsed.title || title
    const { tmdbApiKey } = getSettings()
    let alive = true

    async function loadImages() {
      // 1. If it's a series episode, try to fetch the episode still first
      if (parsed.isSeries && parsed.season != null && parsed.episode != null) {
        try {
          const url = `/api/tvshow?title=${encodeURIComponent(queryTitle)}${tmdbApiKey ? `&tmdbApiKey=${encodeURIComponent(tmdbApiKey)}` : ''}`
          const res = await fetch(url)
          const data = await res.json()
          if (!alive) return
          if (data.success && Array.isArray(data.episodes)) {
            const meta = data.episodes.find(
              (m: any) => m.season === parsed.season && m.number === parsed.episode
            )
            if (meta?.still) {
              setPosterUrl(meta.still)
              return // Found episode still! Exit early to avoid overwriting.
            }
          }
        } catch (e) {
          // ignore
        }
      }

      // 2. Fall back to show/movie poster
      try {
        const res = await fetch(`/api/poster?title=${encodeURIComponent(queryTitle)}`)
        const data = await res.json()
        if (!alive) return
        if (data.success && data.poster) {
          setPosterUrl(data.poster)
        }
      } catch (e) {
        // ignore
      }
    }

    loadImages()
      
    return () => {
      alive = false
    }
  }, [item.Name, isGroup, isDir, title, item.SeriesTitle, parsed])

  const onFav = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    toggleFavorite({ path: item.Path, name: item.Name, isDir, src: item.StreamUrl })
  }

  // ----------------------------------------------------------------- list row
  if (layout === 'list') {
    return (
      <div
        className="bx-row"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        }}
      >
        <div
          className="bx-row-thumb"
          style={{
            ['--bx-card-grad' as string]: grad,
            backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="bx-poster-grain" />
          <div className="bx-row-thumb-glyph">
            {posterUrl ? null : isGroup ? <Film size={20} /> : isDir ? <Folder size={20} /> : initials(item.Name)}
          </div>
          {!isDir && !isGroup && (
            <div className="bx-row-thumb-play">
              <Play size={18} fill="currentColor" />
            </div>
          )}
        </div>

        <div className="bx-row-main" style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="bx-row-name truncate">{title}</div>
            {((progress != null && progress >= 0.9) || isWatched(item.Path)) && (
              <CheckCircle size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            )}
          </div>
          <div className="bx-row-sub">
            {tag && <span className="badge badge-accent">{tag}</span>}
            <span>{sub}</span>
          </div>
          {progress != null && progress > 0 && (
            <div className="bx-row-progress" style={{ maxWidth: 240 }}>
              <div
                className="bx-row-progress-fill"
                style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
              />
            </div>
          )}
        </div>

        {!isDir && !isGroup && <div className="bx-row-col tabular">{sizeLabel}</div>}
        <div className="bx-row-col bx-row-col--meta">{relLabel || (isGroup ? `${epCount} Episodes` : isDir ? 'Folder' : '')}</div>

        {isDir || isGroup ? (
          <ChevronRight size={18} className="bx-crumb-sep" />
        ) : (
          <button
            className={`bx-row-fav${fav ? ' is-on' : ''}`}
            onClick={onFav}
            title={fav ? 'Remove from My List' : 'Add to My List'}
            aria-pressed={fav}
          >
            <Star size={17} />
          </button>
        )}
      </div>
    )
  }

  // -------------------------------------------------------------------- grid
  return (
    <div
      className={`bx-card stagger-item${isPortrait ? ' bx-card--portrait' : ' bx-card--landscape'}`}
      style={{ ['--i' as string]: index }}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div
        className={`bx-poster${isPortrait ? ' bx-poster--portrait' : isDir ? ' bx-poster--folder' : ''}`}
        style={{
          ['--bx-card-grad' as string]: grad,
          backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {posterUrl ? null : isGroup ? (
          <div className="bx-poster-folderico">
            <Film size={56} strokeWidth={1.4} />
          </div>
        ) : isDir ? (
          <div className="bx-poster-folderico">
            <Folder size={56} strokeWidth={1.4} />
          </div>
        ) : (
          <div className="bx-poster-glyph">{initials(item.Name)}</div>
        )}

        <div className="bx-poster-vignette" />
        <div className="bx-poster-grain" />

        <div className="bx-poster-badges">
          {tag && <span className="badge badge-accent">{tag}</span>}
          {isDir && <span className="badge">Folder</span>}
        </div>

        <div className="bx-poster-typeico">
          {isGroup ? <Film size={15} /> : isDir ? <Folder size={15} /> : <Film size={15} />}
        </div>

        {!isDir && !isGroup && (
          <button
            className={`bx-card-fav${fav ? ' is-on' : ''}`}
            onClick={onFav}
            title={fav ? 'Remove from My List' : 'Add to My List'}
            aria-pressed={fav}
          >
            <Star size={16} />
          </button>
        )}

        <div className="bx-poster-overlay">
          <div className="bx-overlay-meta">
            {isGroup ? (
              <span>View series</span>
            ) : isDir ? (
              <span>Open folder</span>
            ) : (
              <>
                {sizeLabel !== '—' && <span className="tabular">{sizeLabel}</span>}
                {sizeLabel !== '—' && relLabel && <span className="bx-hero-dot" />}
                {relLabel && <span>{relLabel}</span>}
              </>
            )}
          </div>
        </div>

        <div className="bx-play-fab">
          {isDir || isGroup ? <ChevronRight size={24} /> : <Play size={24} fill="currentColor" />}
        </div>

        {progress != null && progress > 0 && (
          <div className="bx-progress">
            <div
              className="bx-progress-fill"
              style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
            />
          </div>
        )}
      </div>

      <div className="bx-card-foot">
        <div className="bx-card-foot-text">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="bx-card-name clamp-2">{title}</div>
            {((progress != null && progress >= 0.9) || isWatched(item.Path)) && (
              <CheckCircle size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '-2px' }} />
            )}
          </div>
          <div className="bx-card-sub truncate">{sub}</div>
        </div>
      </div>
    </div>
  )
}
