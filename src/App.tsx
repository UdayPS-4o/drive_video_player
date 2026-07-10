import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import {
  Settings as SettingsIcon,
  FolderSymlink,
  RotateCcw,
  Palette,
  Eye,
  X,
} from 'lucide-react'

import type { DriveItem, PlayableItem, AccentKey, SavedFolder } from './types'
import { setFolder, listDir } from './lib/api'
import { parseVideoTitle } from './lib/format'
import {
  getSettings,
  saveSettings,
  getResume,
  setResume,
  getSavedFolders,
  saveFolder,
  deleteFolder,
  markWatched,
} from './lib/storage'

import ConnectScreen from './components/ui/ConnectScreen'
import SettingsPanel from './components/ui/SettingsPanel'
import CommandPalette from './components/ui/CommandPalette'
import type { Command } from './components/ui/CommandPalette'
import { useToast } from './components/ui/Toast'
import BrowseExperience from './components/browse/BrowseExperience'
import VideoPlayer from './components/player/VideoPlayer'
import AddFolderModal from './components/ui/AddFolderModal'

interface ActiveSession {
  item: PlayableItem
  queue: PlayableItem[]
  startTime: number
}

const ACCENTS: { key: AccentKey; label: string }[] = [
  { key: 'crimson', label: 'Crimson' },
  { key: 'azure', label: 'Azure' },
  { key: 'violet', label: 'Violet' },
  { key: 'emerald', label: 'Emerald' },
  { key: 'amber', label: 'Amber' },
]

function applyAccent(accent: AccentKey) {
  document.documentElement.setAttribute('data-accent', accent)
  saveSettings({ accent })
}



export default function App() {
  const toast = useToast()

  const [connected, setConnected] = useState<boolean>(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [folders, setFolders] = useState<SavedFolder[]>(() => getSavedFolders())
  const [isAddFolderOpen, setIsAddFolderOpen] = useState(false)

  const [active, setActive] = useState<ActiveSession | null>(null)
  const activeRef = useRef<ActiveSession | null>(null)
  
  // Sync active state to ref for synchronous access in handleProgress
  useEffect(() => {
    activeRef.current = active
  }, [active])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)

  // ── data source: live rclone backend ──
  const fetchDir = useCallback(
    async (path: string, folderId?: string): Promise<DriveItem[]> => {
      const saved = getSavedFolders()
      if (saved.length === 0) return []
      
      const targetFolders = folderId
        ? saved.filter((f) => f.id === folderId)
        : saved
      
      const promises = targetFolders.map(async (f) => {
        try {
          const items = await listDir(path, f.id)
          return items.map((it) => ({ ...it, FolderId: f.id }))
        } catch {
          return []
        }
      })
      
      const results = await Promise.all(promises)
      const allItems = results.flat()
      
      // Merge items by name
      const merged: Record<string, DriveItem> = {}
      const finalItems: DriveItem[] = []
      
      for (const item of allItems) {
        const key = `${item.IsDir ? 'dir' : 'file'}:${item.Name.toLowerCase()}`
        if (item.IsDir) {
          if (!merged[key]) {
            merged[key] = { ...item }
            finalItems.push(merged[key])
          } else {
            merged[key].Size += item.Size
            if (item.GroupItems) {
              if (!merged[key].GroupItems) {
                merged[key].GroupItems = []
              }
              const existingPaths = new Set(merged[key].GroupItems?.map((g) => g.Path) || [])
              for (const ep of item.GroupItems) {
                if (!existingPaths.has(ep.Path)) {
                  merged[key].GroupItems!.push({ ...ep, FolderId: item.FolderId })
                }
              }
            }
          }
        } else {
          finalItems.push(item)
        }
      }
      
      return finalItems
    },
    [],
  )

  // ── connection flow ──
  const handleConnect = useCallback(
    async (url: string): Promise<boolean> => {
      setConnecting(true)
      setConnectError(null)
      try {
        const res = await setFolder(url)
        if (res.success && res.folderId) {
          const id = res.folderId
          const existing = getSavedFolders()
          const found = existing.find((f) => f.id === id)
          
          const folderObj: SavedFolder = {
            id,
            url,
            name: found ? found.name : `Library (${id.slice(0, 6)})`,
            addedAt: found ? found.addedAt : Date.now(),
          }
          
          saveFolder(folderObj)
          setFolders(getSavedFolders())
          
          setConnected(true)
          toast({ title: 'Connected', description: 'Your library is ready.', variant: 'success' })
          return true
        } else {
          setConnectError(res.error ?? 'Could not connect to that folder.')
          return false
        }
      } catch {
        setConnectError('Backend unreachable — is the stream server running?')
        return false
      } finally {
        setConnecting(false)
      }
    },
    [toast],
  )

  // Auto-connect on mount if folders exist
  useEffect(() => {
    const saved = getSavedFolders()
    if (saved.length > 0) {
      setConnected(true)
      void setFolder(saved[0].url)
    }
  }, [])

  const handleDeleteFolder = useCallback((id: string) => {
    deleteFolder(id)
    const updated = getSavedFolders()
    setFolders(updated)
    
    // If no folders remain, drop back to connect screen
    if (updated.length === 0) {
      setConnected(false)
    }
  }, [])

  const handleRenameFolder = useCallback((id: string, name: string) => {
    const saved = getSavedFolders()
    const found = saved.find((f) => f.id === id)
    if (found) {
      found.name = name
      saveFolder(found)
      setFolders(getSavedFolders())
    }
  }, [])

  // ── playback ──
  const handlePlay = useCallback((item: PlayableItem, queue: PlayableItem[]) => {
    if (item.folderId) {
      const saved = getSavedFolders()
      const folder = saved.find((f) => f.id === item.folderId)
      if (folder) {
        void setFolder(folder.url)
      }
    }
    const resume = getResume(item.path)
    setActive({ item, queue, startTime: resume?.time ?? 0 })
  }, [])

  const handlePlayItem = useCallback((next: PlayableItem) => {
    if (next.folderId) {
      const saved = getSavedFolders()
      const folder = saved.find((f) => f.id === next.folderId)
      if (folder) {
        void setFolder(folder.url)
      }
    }
    const resume = getResume(next.path)
    setActive((cur) => (cur ? { ...cur, item: next, startTime: resume?.time ?? 0 } : cur))
  }, [])

  const handleProgress = useCallback(
    (path: string, time: number, duration: number) => {
      const cur = activeRef.current
      if (!cur) return

      const it = cur.item.path === path ? cur.item : cur.queue.find((q) => q.path === path)
      setResume({ path, name: it?.name ?? path, src: it?.src, time, duration })
      
      if (duration > 0 && time / duration >= 0.9) {
        markWatched(path)
        
        if (it) {
          const parsed = parseVideoTitle(it.name)
          if (parsed.isSeries && parsed.season != null && parsed.episode != null) {
            const epsToMark: string[] = []
            cur.queue.forEach(q => {
              const qp = parseVideoTitle(q.name)
              if (qp.isSeries && qp.season === parsed.season && qp.episode != null && qp.episode < parsed.episode!) {
                epsToMark.push(q.path)
              }
            })
            if (epsToMark.length > 0) markWatched(epsToMark)
          }
          
          const idx = cur.queue.findIndex(q => q.path === path)
          if (idx >= 0 && idx < cur.queue.length - 1) {
            const nextItem = cur.queue[idx + 1]
            setResume({
              path: nextItem.path,
              name: nextItem.name,
              src: nextItem.src,
              time: 0,
              duration: 0,
              isNext: true
            })
          }
        }
      }
    },
    [],
  )



  // ── global ⌘K / Ctrl+K ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const autoplayNext = getSettings().autoplayNext

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: 'settings',
        title: 'Open settings',
        group: 'App',
        hint: 'Preferences',
        icon: <SettingsIcon size={16} />,
        keywords: 'preferences accent theme',
        run: () => setSettingsOpen(true),
      },
      {
        id: 'add-folder',
        title: 'Add library folder',
        group: 'App',
        icon: <FolderSymlink size={16} />,
        keywords: 'connect switch library root add folders',
        run: () => setIsAddFolderOpen(true),
      },
      {
        id: 'reload',
        title: 'Reload app',
        group: 'App',
        icon: <RotateCcw size={16} />,
        keywords: 'refresh restart',
        run: () => location.reload(),
      },
      {
        id: 'reduce-motion',
        title: 'Toggle reduced motion',
        group: 'Appearance',
        icon: <Eye size={16} />,
        keywords: 'animations accessibility',
        run: () => {
          const next = !getSettings().reduceMotion
          saveSettings({ reduceMotion: next })
          document.documentElement.setAttribute('data-reduce-motion', String(next))
          toast({ title: next ? 'Reduced motion on' : 'Reduced motion off', variant: 'info' })
        },
      },
      ...ACCENTS.map<Command>((a) => ({
        id: `accent-${a.key}`,
        title: `Accent · ${a.label}`,
        group: 'Appearance',
        icon: <Palette size={16} />,
        keywords: 'color theme accent',
        run: () => {
          applyAccent(a.key)
          toast({ title: `Accent set to ${a.label}`, variant: 'success' })
        },
      })),
    ]
    if (active) {
      list.unshift({
        id: 'close-player',
        title: 'Close player',
        group: 'Playback',
        icon: <X size={16} />,
        keywords: 'stop exit back',
        run: () => setActive(null),
      })
    }
    return list
  }, [active, toast])

  if (!connected) {
    return (
      <ConnectScreen
        onConnect={handleConnect}
        connecting={connecting}
        error={connectError}
        folders={folders}
        onDeleteFolder={handleDeleteFolder}
        onRenameFolder={handleRenameFolder}
      />
    )
  }

  return (
    <>
      <BrowseExperience
        fetchDir={fetchDir}
        onPlay={handlePlay}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenCommand={() => setCommandOpen(true)}
        folders={folders}
        onAddFolder={() => setIsAddFolderOpen(true)}
        onDeleteFolder={handleDeleteFolder}
        onRenameFolder={handleRenameFolder}
      />

      {active && (
        <VideoPlayer
          key={active.item.path}
          item={active.item}
          queue={active.queue}
          startTime={active.startTime}
          autoplayNext={autoplayNext}
          onClose={() => setActive(null)}
          onPlayItem={handlePlayItem}
          onProgress={handleProgress}
        />
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} commands={commands} />
      
      <AddFolderModal
        isOpen={isAddFolderOpen}
        onClose={() => {
          setIsAddFolderOpen(false)
          setConnectError(null)
        }}
        onConnect={handleConnect}
        connecting={connecting}
        error={connectError}
      />
    </>
  )
}
