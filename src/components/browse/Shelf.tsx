import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ShelfProps {
  title: string
  icon?: ReactNode
  count?: number
  children: ReactNode
  /** Apply wider cards (used by Continue Watching). */
  wide?: boolean
}

/** Horizontally-scrollable row of cards with hover chevron controls. */
export default function Shelf({ title, icon, count, children, wide }: ShelfProps) {
  const railRef = useRef<HTMLDivElement | null>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const update = () => {
    const el = railRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft < max - 4)
  }

  useEffect(() => {
    update()
    const el = railRef.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
    // re-evaluate when children change (lazy rows fill in)
  }, [children])

  const scrollBy = (dir: -1 | 1) => {
    const el = railRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: 'smooth' })
  }

  return (
    <section className="bx-shelf">
      <div className="bx-shelf-head">
        <h2 className="bx-shelf-title">
          {icon && <span className="bx-shelf-title-ico">{icon}</span>}
          {title}
        </h2>
        {count != null && <span className="bx-shelf-count">{count}</span>}
        <span className="bx-shelf-head-grow" />
        <div className="bx-shelf-nav">
          <button
            className="bx-shelf-chev"
            onClick={() => scrollBy(-1)}
            disabled={!canLeft}
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="bx-shelf-chev"
            onClick={() => scrollBy(1)}
            disabled={!canRight}
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className={`bx-shelf-rail${wide ? ' bx-shelf-rail--wide' : ''}`} ref={railRef}>
        {children}
      </div>
    </section>
  )
}
