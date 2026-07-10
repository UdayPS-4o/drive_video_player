import { ChevronLeft, ChevronRight, House } from 'lucide-react'

interface BreadcrumbsProps {
  /** The folder stack, e.g. ['Movies', 'Action']. */
  path: string[]
  /** Navigate to a given depth (0 = root, n = first n segments). */
  onNavigate: (depth: number) => void
  /** Pop one level up. */
  onBack: () => void
  groupName?: string
  onBackGroup?: () => void
}

/** Clickable path trail with a back chevron and a Home/root crumb. */
export default function Breadcrumbs({
  path,
  onNavigate,
  onBack,
  groupName,
  onBackGroup,
}: BreadcrumbsProps) {
  const handleBack = groupName && onBackGroup ? onBackGroup : onBack
  const isBackDisabled = groupName ? false : path.length === 0

  return (
    <nav className="bx-crumbs" aria-label="Folder path">
      <button
        className="bx-iconbtn"
        onClick={handleBack}
        disabled={isBackDisabled}
        title="Back"
        aria-label="Go back"
      >
        <ChevronLeft size={18} />
      </button>

      <button
        className={`bx-crumb${path.length === 0 && !groupName ? ' is-current' : ''}`}
        onClick={() => {
          if (groupName && onBackGroup) onBackGroup()
          onNavigate(0)
        }}
        disabled={path.length === 0 && !groupName}
      >
        <House size={15} />
        <span>Library</span>
      </button>

      {path.map((segment, i) => {
        const isLast = i === path.length - 1 && !groupName
        return (
          <span key={`${segment}-${i}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <ChevronRight size={15} className="bx-crumb-sep" />
            <button
              className={`bx-crumb truncate${isLast ? ' is-current' : ''}`}
              onClick={() => {
                if (groupName && onBackGroup) onBackGroup()
                onNavigate(i + 1)
              }}
              disabled={isLast}
              title={segment}
            >
              {segment}
            </button>
          </span>
        )
      })}

      {groupName && (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          <ChevronRight size={15} className="bx-crumb-sep" />
          <button className="bx-crumb truncate is-current" disabled title={groupName}>
            {groupName}
          </button>
        </span>
      )}
    </nav>
  )
}
