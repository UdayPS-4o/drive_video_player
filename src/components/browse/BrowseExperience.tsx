import './browse.css'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  House,
  Clock,
  Star,
  Sparkles,
  Folder as FolderIcon,
  FolderOpen,
  PlayCircle,
  SearchX,
  WifiOff,
  Inbox,
  Play,
  ChevronLeft,
  Film,
  CheckCircle,
} from 'lucide-react'

import type {
  DriveItem,
  PlayableItem,
  ViewMode,
  SortState,
  ResumeEntry,
  FavoriteEntry,
  SavedFolder,
} from '../../types'
import { streamUrl } from '../../lib/api'
import { isVideoFile, prettyTitle, formatRelative, groupItems, formatSize, parseVideoTitle } from '../../lib/format'
import {
  getSettings,
  saveSettings,
  getContinueWatching,
  getFavorites,
  useStorageVersion,
  isWatched,
} from '../../lib/storage'

import Sidebar from './Sidebar'
import type { NavTab } from './Sidebar'
import TopBar from './TopBar'
import Hero from './Hero'
import Shelf from './Shelf'
import ContentCard from './ContentCard'
import Breadcrumbs from './Breadcrumbs'
import EmptyState from './EmptyState'
import { CardSkeleton, ContentSkeletons, HeroSkeleton, ShelfSkeleton } from './Skeletons'

// ───────────────────────────────────────────────────────────── contract
interface BrowseExperienceProps {
  fetchDir: (path: string, folderId?: string) => Promise<DriveItem[]>
  onPlay: (item: PlayableItem, queue: PlayableItem[]) => void
  onOpenSettings: () => void
  onOpenCommand: () => void
  folders: SavedFolder[]
  onAddFolder: () => void
  onDeleteFolder: (id: string) => void
  onRenameFolder: (id: string, name: string) => void
}

// ───────────────────────────────────────────────────────────── helpers
function isPortraitItem(it: DriveItem): boolean {
  if (it.IsGroup) return true
  if (it.IsDir) return false
  const parsed = parseVideoTitle(it.Name)
  const isEpisode = parsed.isSeries && parsed.season != null && parsed.episode != null
  return !isEpisode
}

function toPlayable(it: DriveItem): PlayableItem {
  return {
    path: it.Path,
    name: it.Name,
    src: it.StreamUrl ?? streamUrl(it.Path),
    size: it.Size,
    modTime: it.ModTime,
    folderId: it.FolderId,
  }
}

function videosOf(items: DriveItem[]): DriveItem[] {
  return items.filter((it) => isVideoFile(it))
}

function modMs(it: DriveItem): number {
  return it.ModTime ? new Date(it.ModTime).getTime() : 0
}

function sortItems(items: DriveItem[], sort: SortState): DriveItem[] {
  const factor = sort.dir === 'asc' ? 1 : -1
  const sorted = [...items].sort((a, b) => {
    // folders always first, regardless of direction
    if (a.IsDir !== b.IsDir) return a.IsDir ? -1 : 1
    let cmp = 0
    if (sort.key === 'name') cmp = a.Name.localeCompare(b.Name, undefined, { numeric: true })
    else if (sort.key === 'size') cmp = a.Size - b.Size
    else cmp = modMs(a) - modMs(b)
    if (cmp === 0) cmp = a.Name.localeCompare(b.Name, undefined, { numeric: true })
    return cmp * factor
  })
  return sorted
}

function matchesQuery(it: DriveItem, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return it.Name.toLowerCase().includes(needle) || prettyTitle(it.Name).toLowerCase().includes(needle)
}

const TAB_TITLES: Record<NavTab, string> = {
  home: 'Home',
  browse: 'Browse',
  favorites: 'My List',
  recent: 'Recent',
}

// Convert a stored resume / favorite into a DriveItem shell for rendering.
function resumeToItem(r: ResumeEntry): DriveItem {
  return {
    Path: r.path,
    Name: r.name,
    Size: 0,
    MimeType: 'video/mp4',
    IsDir: false,
    ModTime: new Date(r.updatedAt).toISOString(),
    StreamUrl: r.src,
  }
}

function favToItem(f: FavoriteEntry): DriveItem {
  return {
    Path: f.path,
    Name: f.name,
    Size: 0,
    MimeType: f.isDir ? 'inode/directory' : 'video/mp4',
    IsDir: f.isDir,
    ModTime: new Date(f.addedAt).toISOString(),
    StreamUrl: f.src,
  }
}

// ─────────────────────────────────────────────── directory loading hook
interface DirState {
  items: DriveItem[]
  loading: boolean
  error: string | null
}

function useDirectory(
  fetchDir: (path: string) => Promise<DriveItem[]>,
  path: string,
  enabled: boolean,
) {
  const [state, setState] = useState<DirState>({ items: [], loading: enabled, error: null })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!enabled) return
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchDir(path)
      .then((data) => {
        if (!alive) return
        const filtered = data.filter((it) => it.IsDir || isVideoFile(it))
        setState({ items: filtered, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (!alive) return
        const message = err instanceof Error ? err.message : 'Something went wrong loading this folder.'
        setState({ items: [], loading: false, error: message })
      })
    return () => {
      alive = false
    }
  }, [fetchDir, path, enabled, nonce])

  return { ...state, reload }
}

// ── lazy per-folder rows for Home ──
function useFolderRows(
  fetchDir: (path: string, folderId?: string) => Promise<DriveItem[]>,
  folders: DriveItem[],
) {
  const [rows, setRows] = useState<Record<string, DriveItem[] | 'loading' | 'error'>>({})

  useEffect(() => {
    let alive = true
    // Reset when the set of folders changes so stale rows don't linger.
    setRows({})
    folders.forEach((folder) => {
      setRows((r) => ({ ...r, [folder.Path]: 'loading' }))
      fetchDir(folder.Path, folder.FolderId)
        .then((data) => {
          if (!alive) return
          const filtered = data.filter((it) => it.IsDir || isVideoFile(it))
          setRows((r) => ({ ...r, [folder.Path]: filtered }))
        })
        .catch(() => {
          if (!alive) return
          setRows((r) => ({ ...r, [folder.Path]: 'error' }))
        })
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDir, folders.map((f) => f.Path).join('|')])

  return rows
}

// ═══════════════════════════════════════════════════════════ component
export default function BrowseExperience({
  fetchDir,
  onPlay,
  onOpenSettings,
  onOpenCommand,
  folders,
  onAddFolder,
  onDeleteFolder,
  onRenameFolder,
}: BrowseExperienceProps) {
  const storageVersion = useStorageVersion()

  // ── persistent + UI state ───────────────────────────────────────────
  const [active, setActive] = useState<NavTab>('home')
  const [path, setPath] = useState<string[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string>('')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [view, setView] = useState<ViewMode>(() => getSettings().view)
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' })
  const [selectedGroup, setSelectedGroup] = useState<DriveItem | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Reset selectedGroup only when the path changes (drilling into a subfolder).
  // We do NOT reset on active change because openItem sets both active+selectedGroup
  // in the same event; resetting on active would clear the group before it renders.
  useEffect(() => {
    setSelectedGroup(null)
  }, [path])

  // Persist view mode.
  const changeView = useCallback((next: ViewMode) => {
    setView(next)
    saveSettings({ view: next })
  }, [])

  // Reset search + scroll when switching tabs or folders.
  useEffect(() => {
    setQuery('')
  }, [active])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [active, path])

  // ── data sources ────────────────────────────────────────────────────
  const browsePath = path.join('/')
  const fetchDirForBrowse = useCallback(
    (p: string) => fetchDir(p, activeFolderId),
    [fetchDir, activeFolderId]
  )
  const browseDir = useDirectory(fetchDirForBrowse, browsePath, active === 'browse')
  const rootDir = useDirectory(fetchDir, '', active === 'home')

  const rootFolders = useMemo(() => rootDir.items.filter((it) => it.IsDir), [rootDir.items])
  const rootVideos = useMemo(() => videosOf(rootDir.items), [rootDir.items])
  const folderRows = useFolderRows(fetchDir, active === 'home' ? rootFolders : [])

  // Storage-derived collections (recompute on storageVersion bump).
  const continueWatching = useMemo(() => getContinueWatching(), [storageVersion])
  const favorites = useMemo(() => getFavorites(), [storageVersion])

  // Quick lookup of resume progress by path.
  const resumeByPath = useMemo(() => {
    const map = new Map<string, ResumeEntry>()
    for (const r of continueWatching) map.set(r.path, r)
    return map
  }, [continueWatching])

  const progressOf = useCallback(
    (p: string): number | undefined => {
      const r = resumeByPath.get(p)
      if (!r || r.duration <= 0) return undefined
      return r.time / r.duration
    },
    [resumeByPath],
  )

  // ── play helpers ────────────────────────────────────────────────────
  // Play a video building its sibling-video queue (display order).
  const playFrom = useCallback(
    (target: DriveItem, siblings: DriveItem[]) => {
      const queue = videosOf(siblings).map(toPlayable)
      onPlay(toPlayable(target), queue)
    },
    [onPlay],
  )

  // Play a "loose" item (resume / favorite) where siblings are unknown.
  const playLoose = useCallback(
    (it: DriveItem) => {
      const playable = toPlayable(it)
      onPlay(playable, [playable])
    },
    [onPlay],
  )

  // Open a DriveItem: folders navigate (switching to Browse), videos play.
  const openItem = useCallback(
    (it: DriveItem, siblings: DriveItem[]) => {
      if (it.IsGroup) {
        // Set both active and selectedGroup together. The selectedGroup reset
        // effect only watches `path`, so this is safe.
        setActive('browse')
        setSelectedGroup(it)
      } else if (it.IsDir) {
        setSelectedGroup(null)
        setActive('browse')
        setPath(it.Path.split('/').filter(Boolean))
        setActiveFolderId(it.FolderId || '')
      } else {
        playFrom(it, siblings)
      }
    },
    [playFrom],
  )

  // ── navigation ──────────────────────────────────────────────────────
  const goToDepth = useCallback((depth: number) => {
    setPath((p) => {
      const nextPath = p.slice(0, depth)
      if (nextPath.length === 0) {
        setActiveFolderId('')
      }
      return nextPath
    })
  }, [])
  const goBack = useCallback(() => {
    setPath((p) => {
      const nextPath = p.slice(0, -1)
      if (nextPath.length === 0) {
        setActiveFolderId('')
      }
      return nextPath
    })
  }, [])

  const onNavigate = useCallback((tab: NavTab) => {
    setSelectedGroup(null)
    setActive(tab)
    if (tab === 'browse') {
      setPath([])
      setActiveFolderId('')
    }
  }, [])

  // ── derived: filtered + sorted current browse items ─────────────────
  const browseVisible = useMemo(() => {
    const grouped = groupItems(browseDir.items)
    const filtered = grouped.filter((it) => matchesQuery(it, query))
    return sortItems(filtered, sort)
  }, [browseDir.items, query, sort])

  // Filtered favorites + recent for their views.
  const favoriteItems = useMemo(() => {
    const items = favorites.map(favToItem).filter((it) => matchesQuery(it, query))
    return sortItems(items, sort)
  }, [favorites, query, sort])

  const recentItems = useMemo(
    () => continueWatching.map(resumeToItem).filter((it) => matchesQuery(it, query)),
    [continueWatching, query],
  )

  // ── top bar context ─────────────────────────────────────────────────
  const inSubfolder = selectedGroup ? true : active === 'browse' && path.length > 0
  const topTitle = selectedGroup
    ? selectedGroup.Name
    : active === 'browse'
      ? path.length > 0
        ? path[path.length - 1]
        : 'Library'
      : TAB_TITLES[active]
  const topSubtitle = selectedGroup
    ? (path.length > 0 ? path.join('  ›  ') : 'Library')
    : active === 'browse' && path.length > 1 ? path.slice(0, -1).join('  ›  ') : undefined

  return (
    <div className={`bx-root${collapsed ? ' is-collapsed' : ''}`}>
      <Sidebar
        active={active}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onOpenSettings={onOpenSettings}
        favCount={favorites.length}
        recentCount={continueWatching.length}
        folders={folders}
        onAddFolder={onAddFolder}
        onDeleteFolder={onDeleteFolder}
        onRenameFolder={onRenameFolder}
      />

      <div className="bx-main">
        {!(active === 'browse' && selectedGroup) && (
          <TopBar
            title={topTitle}
            subtitle={topSubtitle}
            onBack={inSubfolder ? (selectedGroup ? () => setSelectedGroup(null) : goBack) : undefined}
            query={query}
            onQuery={setQuery}
            view={view}
            onView={changeView}
            sort={sort}
            onSort={setSort}
            onOpenCommand={onOpenCommand}
          />
        )}

        <div className="bx-scroll" ref={scrollRef}>
          {active === 'home' && (
            <HomeView
              loading={rootDir.loading}
              error={rootDir.error}
              onRetry={rootDir.reload}
              rootVideos={rootVideos}
              rootFolders={rootFolders}
              folderRows={folderRows}
              continueWatching={continueWatching}
              favorites={favorites}
              progressOf={progressOf}
              openItem={openItem}
              playFrom={playFrom}
              playLoose={playLoose}
              onAddFolder={onAddFolder}
            />
          )}

          {active === 'browse' && selectedGroup ? (
            <SeasonDetailView
              group={selectedGroup}
              progressOf={progressOf}
              onPlayEpisode={(ep, sibs) => openItem(ep, sibs)}
              onClose={() => setSelectedGroup(null)}
            />
          ) : active === 'browse' ? (
            <BrowseView
              loading={browseDir.loading}
              error={browseDir.error}
              onRetry={browseDir.reload}
              items={browseVisible}
              rawCount={browseDir.items.length}
              query={query}
              path={path}
              view={view}
              goToDepth={goToDepth}
              goBack={goBack}
              progressOf={progressOf}
              openItem={openItem}
            />
          ) : null}

          {active === 'favorites' && (
            <CollectionView
              kind="favorites"
              items={favoriteItems}
              rawCount={favorites.length}
              query={query}
              view={view}
              progressOf={progressOf}
              openItem={openItem}
              playLoose={playLoose}
              onBrowse={() => setActive('browse')}
            />
          )}

          {active === 'recent' && (
            <CollectionView
              kind="recent"
              items={recentItems}
              rawCount={continueWatching.length}
              query={query}
              view={view}
              progressOf={progressOf}
              openItem={openItem}
              playLoose={playLoose}
              onBrowse={() => setActive('home')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════ HOME
interface HomeViewProps {
  loading: boolean
  error: string | null
  onRetry: () => void
  rootVideos: DriveItem[]
  rootFolders: DriveItem[]
  folderRows: Record<string, DriveItem[] | 'loading' | 'error'>
  continueWatching: ResumeEntry[]
  favorites: FavoriteEntry[]
  progressOf: (path: string) => number | undefined
  openItem: (it: DriveItem, siblings: DriveItem[]) => void
  playFrom: (it: DriveItem, siblings: DriveItem[]) => void
  playLoose: (it: DriveItem) => void
  onAddFolder: () => void
}

function HomeView({
  loading,
  error,
  onRetry,
  rootVideos,
  rootFolders,
  folderRows,
  continueWatching,
  favorites,
  progressOf,
  openItem,
  playFrom,
  playLoose,
  onAddFolder,
}: HomeViewProps) {
  // Choose a featured item: most-recent continue-watching, else newest root video.
  const recentlyAdded = useMemo(() => {
    const grouped = groupItems(rootVideos)
    return [...grouped].sort((a, b) => modMs(b) - modMs(a))
  }, [rootVideos])
  const topResume = continueWatching[0]
  const featured: DriveItem | undefined = topResume
    ? resumeToItem(topResume)
    : recentlyAdded[0]

  if (loading && rootVideos.length === 0 && rootFolders.length === 0) {
    return (
      <div className="bx-page--flush">
        <HeroSkeleton />
        <div style={{ marginTop: 8 }}>
          <div className="bx-shelf-head">
            <div className="bx-skel-line skeleton" style={{ width: 220, height: 18 }} />
          </div>
          <ShelfSkeleton />
        </div>
        <div>
          <div className="bx-shelf-head">
            <div className="bx-skel-line skeleton" style={{ width: 180, height: 18 }} />
          </div>
          <ShelfSkeleton />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bx-page">
        <EmptyState
          variant="error"
          icon={<WifiOff size={40} />}
          title="Couldn't reach your library"
          message={error}
          onRetry={onRetry}
          action={
            <button className="btn" onClick={onAddFolder}>
              <FolderOpen size={16} />
              Add folder
            </button>
          }
        />
      </div>
    )
  }

  const nothing = rootVideos.length === 0 && rootFolders.length === 0
  if (nothing) {
    return (
      <div className="bx-page">
        <EmptyState
          icon={<Inbox size={40} />}
          title="Your library is empty"
          message="No videos or folders were found at the root of this Drive. Try connecting a different folder."
          action={
            <button className="btn btn-primary" onClick={onAddFolder}>
              <FolderOpen size={16} />
              Add folder
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="bx-page--flush anim-fade">
      {featured && (
        <Hero
          item={featured}
          resume={
            topResume ? { time: topResume.time, duration: topResume.duration } : undefined
          }
          onPlay={() => {
            if (topResume) playLoose(featured)
            else if (featured.IsGroup && featured.GroupItems && featured.GroupItems.length > 0) {
              playFrom(featured.GroupItems[0], featured.GroupItems)
            } else if (!featured.IsDir) {
              playFrom(featured, recentlyAdded)
            } else {
              openItem(featured, recentlyAdded)
            }
          }}
          onInfo={() => openItem(featured, recentlyAdded)}
        />
      )}

      {/* Continue Watching */}
      {continueWatching.length > 0 && (
        <Shelf title="Continue Watching" icon={<PlayCircle size={20} />} wide>
          {continueWatching.map((r, i) => {
            const it = resumeToItem(r)
            return (
              <div className="bx-shelf-card bx-shelf-card--wide" key={r.path}>
                <ContentCard
                  item={it}
                  layout="grid"
                  index={i}
                  progress={r.duration > 0 ? r.time / r.duration : undefined}
                  subtitle={r.isNext ? 'Up Next' : undefined}
                  onOpen={() => playLoose(it)}
                />
              </div>
            )
          })}
        </Shelf>
      )}

      {/* Recently Added */}
      {recentlyAdded.length > 0 && (
        <Shelf title="Recently Added" icon={<Sparkles size={20} />}>
          {recentlyAdded.map((it, i) => (
            <div className={isPortraitItem(it) ? "bx-shelf-card--portrait" : "bx-shelf-card"} key={it.Path}>
              <ContentCard
                item={it}
                layout="grid"
                index={i}
                progress={progressOf(it.Path)}
                onOpen={() => openItem(it, recentlyAdded)}
              />
            </div>
          ))}
        </Shelf>
      )}

      {/* My List */}
      {favorites.length > 0 && (
        <Shelf title="My List" icon={<Star size={20} />}>
          {favorites.map((f, i) => {
            const it = favToItem(f)
            return (
              <div className={isPortraitItem(it) ? "bx-shelf-card--portrait" : "bx-shelf-card"} key={f.path}>
                <ContentCard
                  item={it}
                  layout="grid"
                  index={i}
                  progress={progressOf(it.Path)}
                  onOpen={() => (it.IsDir ? openItem(it, []) : playLoose(it))}
                />
              </div>
            )
          })}
        </Shelf>
      )}

      {/* One shelf per top-level folder (lazy) */}
      {rootFolders.map((folder) => {
        const row = folderRows[folder.Path]
        const displayRow = Array.isArray(row) ? groupItems(row) : []
        return (
          <Shelf
            key={folder.Path}
            title={folder.Name}
            icon={<FolderIcon size={20} />}
            count={Array.isArray(row) ? row.length : undefined}
          >
            {row === undefined || row === 'loading' ? (
              <ShelfSkeletonRow />
            ) : row === 'error' ? (
              <div className="bx-shelf-empty">Couldn't load this folder.</div>
            ) : displayRow.length === 0 ? (
              <div className="bx-shelf-empty">This folder is empty.</div>
            ) : (
              displayRow.map((it, i) => (
                <div className={isPortraitItem(it) ? "bx-shelf-card--portrait" : "bx-shelf-card"} key={it.Path}>
                  <ContentCard
                    item={it}
                    layout="grid"
                    index={i}
                    progress={progressOf(it.Path)}
                    onOpen={() => openItem(it, displayRow)}
                  />
                </div>
              ))
            )}
          </Shelf>
        )
      })}

      <div style={{ height: 16 }} />
    </div>
  )
}

// Card skeletons sized for a shelf rail (the parent <Shelf/> provides the rail).
function ShelfSkeletonRow() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="bx-shelf-card" key={i}>
          <CardSkeleton />
        </div>
      ))}
    </>
  )
}

// ═════════════════════════════════════════════════════════════ BROWSE
interface BrowseViewProps {
  loading: boolean
  error: string | null
  onRetry: () => void
  items: DriveItem[]
  rawCount: number
  query: string
  path: string[]
  view: ViewMode
  goToDepth: (depth: number) => void
  goBack: () => void
  progressOf: (path: string) => number | undefined
  openItem: (it: DriveItem, siblings: DriveItem[]) => void
  groupName?: string
  onBackGroup?: () => void
}

function BrowseView({
  loading,
  error,
  onRetry,
  items,
  rawCount,
  query,
  path,
  view,
  goToDepth,
  goBack,
  progressOf,
  openItem,
  groupName,
  onBackGroup,
}: BrowseViewProps) {
  return (
    <div className="bx-page anim-fade">
      <div className="bx-browse-toolbar">
        <Breadcrumbs
          path={path}
          onNavigate={goToDepth}
          onBack={goBack}
          groupName={groupName}
          onBackGroup={onBackGroup}
        />
        <span className="bx-browse-toolbar-grow" />
        {!loading && !error && (
          <span className="chip">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      {loading ? (
        <ContentSkeletons layout={view} />
      ) : error ? (
        <EmptyState
          variant="error"
          icon={<WifiOff size={40} />}
          title="Couldn't load this folder"
          message={error}
          onRetry={onRetry}
        />
      ) : rawCount === 0 ? (
        <EmptyState
          icon={<FolderOpen size={40} />}
          title="This folder is empty"
          message="There are no videos or subfolders here yet."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<SearchX size={40} />}
          title="No matches"
          message={`Nothing here matches “${query}”. Try a different search.`}
        />
      ) : (
        <ItemCollection items={items} view={view} progressOf={progressOf} openItem={openItem} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════ FAVORITES + RECENT views
interface CollectionViewProps {
  kind: 'favorites' | 'recent'
  items: DriveItem[]
  rawCount: number
  query: string
  view: ViewMode
  progressOf: (path: string) => number | undefined
  openItem: (it: DriveItem, siblings: DriveItem[]) => void
  playLoose: (it: DriveItem) => void
  onBrowse: () => void
}

function CollectionView({
  kind,
  items,
  rawCount,
  query,
  view,
  progressOf,
  openItem,
  playLoose,
  onBrowse,
}: CollectionViewProps) {
  const isFav = kind === 'favorites'
  const heading = isFav ? 'My List' : 'Continue Watching'
  const blurb = isFav
    ? 'Everything you’ve starred, in one place.'
    : 'Pick up right where you left off.'

  if (rawCount === 0) {
    return (
      <div className="bx-page">
        <EmptyState
          icon={isFav ? <Star size={40} /> : <Clock size={40} />}
          title={isFav ? 'Your list is empty' : 'Nothing to resume'}
          message={
            isFav
              ? 'Star videos and folders while you browse to keep them here.'
              : 'Videos you’ve started watching will show up here so you can finish them later.'
          }
          action={
            <button className="btn btn-primary" onClick={onBrowse}>
              {isFav ? <FolderOpen size={16} /> : <House size={16} />}
              {isFav ? 'Browse library' : 'Go home'}
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="bx-page anim-fade">
      <div className="bx-view-head">
        <div className="bx-view-head-text">
          <h2>{heading}</h2>
          <p>{blurb}</p>
        </div>
        <span className="bx-view-head-grow" />
        <span className="chip">
          {rawCount} {rawCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<SearchX size={40} />}
          title="No matches"
          message={`Nothing here matches “${query}”.`}
        />
      ) : (
        <ItemCollection
          items={items}
          view={view}
          progressOf={progressOf}
          openItem={(it, siblings) => {
            // Recent + favorite videos are "loose": play them directly.
            if (!it.IsDir) playLoose(it)
            else openItem(it, siblings)
          }}
          forceProgressLabel={kind === 'recent'}
        />
      )}
    </div>
  )
}

// ═════════════════════════════════════════ shared grid/list renderer
interface ItemCollectionProps {
  items: DriveItem[]
  view: ViewMode
  progressOf: (path: string) => number | undefined
  openItem: (it: DriveItem, siblings: DriveItem[]) => void
  /** When set, videos render a "watched … ago" subtitle (Recent view). */
  forceProgressLabel?: boolean
}

function ItemCollection({
  items,
  view,
  progressOf,
  openItem,
  forceProgressLabel,
}: ItemCollectionProps) {
  const body = items.map((it, i) => (
    <ContentCard
      key={it.Path}
      item={it}
      layout={view}
      index={i}
      progress={progressOf(it.Path)}
      subtitle={
        forceProgressLabel && !it.IsDir
          ? `watched ${formatRelative(it.ModTime) || 'recently'}`
          : undefined
      }
      onOpen={() => openItem(it, items)}
    />
  ))

  return view === 'list' ? <div className="bx-list">{body}</div> : <div className="bx-grid">{body}</div>
}

// ─────────────────────────────────────────────── Season Detail View (Netflix Style)
interface TVShowEpisodeMeta {
  season: number
  number: number
  name: string
  still: string | null
  summary: string | null
}

interface SeasonDetailViewProps {
  group: DriveItem
  progressOf: (path: string) => number | undefined
  onPlayEpisode: (target: DriveItem, siblings: DriveItem[]) => void
  onClose: () => void
}

function SeasonDetailView({
  group,
  progressOf,
  onPlayEpisode,
  onClose,
}: SeasonDetailViewProps) {
  const episodes = group.GroupItems || []
  const title = group.SeriesTitle || group.Name
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [episodesMeta, setEpisodesMeta] = useState<TVShowEpisodeMeta[]>([])

  useEffect(() => {
    let alive = true
    fetch(`/api/poster?title=${encodeURIComponent(title)}`)
      .then((res) => res.json())
      .then((data) => {
        if (alive && data.success && data.poster) {
          setPosterUrl(data.poster)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [title])

  useEffect(() => {
    let alive = true
    const { tmdbApiKey } = getSettings()
    const url = `/api/tvshow?title=${encodeURIComponent(title)}${tmdbApiKey ? `&tmdbApiKey=${encodeURIComponent(tmdbApiKey)}` : ''}`
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (alive && data.success && Array.isArray(data.episodes)) {
          setEpisodesMeta(data.episodes)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [title])

  const handlePlayAll = () => {
    if (episodes.length > 0) {
      onPlayEpisode(episodes[0], episodes)
    }
  }

  return (
    <div className="bx-season-detail anim-fade">
      {/* Detail Header / Hero */}
      <div className="bx-season-hero glass">
        {/* Blur background poster */}
        {posterUrl && (
          <div
            className="bx-season-hero-bg"
            style={{ backgroundImage: `url(${posterUrl})` }}
          />
        )}
        <div className="bx-season-hero-scrim" />
        
        <button className="bx-season-back" onClick={onClose} title="Back to library">
          <ChevronLeft size={20} />
          <span>Back</span>
        </button>

        <div className="bx-season-hero-content">
          <div
            className="bx-season-hero-poster"
            style={{
              backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
            }}
          >
            {!posterUrl && <Film size={48} className="bx-season-hero-placeholder" />}
          </div>
          
          <div className="bx-season-hero-meta">
            <h2 className="bx-season-hero-title">{title}</h2>
            <h3 className="bx-season-hero-subtitle">{group.Name.replace(title, '').trim() || 'Show details'}</h3>
            <div className="bx-season-hero-info">
              <span>{episodes.length} {episodes.length === 1 ? 'Episode' : 'Episodes'}</span>
              <span className="bx-hero-dot" />
              <span>{formatSize(group.Size)}</span>
            </div>
            <div className="bx-season-hero-actions">
              <button className="btn btn-primary" onClick={handlePlayAll} disabled={episodes.length === 0}>
                <Play size={15} fill="currentColor" />
                Play Season
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Episodes List */}
      <div className="bx-season-episodes">
        <h4 className="bx-season-episodes-heading">Episodes</h4>
        <div className="bx-season-episodes-list">
          {episodes.map((ep, i) => {
            const parsed = parseVideoTitle(ep.Name)
            const progress = progressOf(ep.Path)
            const epNum = parsed.episode != null ? `E${String(parsed.episode).padStart(2, '0')}` : `E${i + 1}`
            const epTitle = parsed.episodeTitle || prettyTitle(ep.Name)
            
            // Find episode metadata from TVMaze
            const meta = episodesMeta.find(
              (m) => m.season === parsed.season && m.number === parsed.episode
            )
            const episodeStill = meta?.still || posterUrl
            const episodeSummary = meta?.summary
              ? meta.summary.replace(/<[^>]*>/g, '') // strip HTML tags
              : null

            return (
              <div
                key={ep.Path}
                className="bx-episode-row glass"
                onClick={() => onPlayEpisode(ep, episodes)}
                role="button"
                tabIndex={0}
              >
                <div className="bx-episode-num">{epNum}</div>
                
                {/* Micro episode card preview */}
                <div
                  className="bx-episode-thumb"
                  style={{
                    backgroundImage: episodeStill ? `url(${episodeStill})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  <div className="bx-episode-thumb-overlay">
                    <Play size={16} fill="currentColor" />
                  </div>
                  {progress != null && progress > 0 && (
                    <div className="bx-episode-progress">
                      <div className="bx-episode-progress-fill" style={{ width: `${progress * 100}%` }} />
                    </div>
                  )}
                </div>

                <div className="bx-episode-details">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span className="bx-episode-title truncate">{epTitle}</span>
                    {((progress != null && progress >= 0.9) || isWatched(ep.Path)) && (
                      <CheckCircle size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    )}
                  </div>
                  <span className="bx-episode-subtitle">{formatSize(ep.Size)}</span>
                  {episodeSummary && (
                    <p className="bx-episode-summary">{episodeSummary}</p>
                  )}
                </div>

                <button className="bx-episode-playbtn" title="Play episode">
                  <Play size={16} fill="currentColor" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
