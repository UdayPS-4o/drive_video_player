import type { ViewMode } from '../../types'

/** A single card-shaped shimmer placeholder (used in grids + shelves). */
export function CardSkeleton() {
  return (
    <div className="bx-card" aria-hidden="true">
      <div className="bx-skel-poster skeleton" />
      <div className="bx-skel-foot">
        <div className="bx-skel-line skeleton" style={{ width: '78%' }} />
        <div className="bx-skel-line skeleton" style={{ width: '44%', height: 10 }} />
      </div>
    </div>
  )
}

/** A list-row shaped shimmer placeholder. */
export function RowSkeleton() {
  return (
    <div className="bx-skel-row" aria-hidden="true">
      <div className="bx-skel-thumb skeleton" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="bx-skel-line skeleton" style={{ width: '40%' }} />
        <div className="bx-skel-line skeleton" style={{ width: '24%', height: 10 }} />
      </div>
      <div className="bx-skel-line skeleton" style={{ width: 80, height: 10 }} />
    </div>
  )
}

/** Grid or list of placeholders shown while a directory loads. */
export function ContentSkeletons({ layout, count = 12 }: { layout: ViewMode; count?: number }) {
  const cells = Array.from({ length: count })
  if (layout === 'list') {
    return (
      <div className="bx-list">
        {cells.map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    )
  }
  return (
    <div className="bx-grid">
      {cells.map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

/** A horizontal strip of card skeletons for a lazily-loading shelf. */
export function ShelfSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="bx-shelf-rail" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bx-shelf-card">
          <CardSkeleton />
        </div>
      ))}
    </div>
  )
}

/** Full-bleed hero placeholder shown while the home page boots. */
export function HeroSkeleton() {
  return <div className="bx-skel-hero skeleton" aria-hidden="true" />
}
