// ===== Core domain =====

/** A file or folder returned by the rclone backend (`/api/ls`). */
export interface DriveItem {
  Path: string
  Name: string
  Size: number
  MimeType: string
  IsDir: boolean
  ModTime?: string
  /** Optional absolute stream URL override (used by demo mode). */
  StreamUrl?: string
  
  // Custom properties for series grouping
  IsGroup?: boolean
  GroupKey?: string
  GroupItems?: DriveItem[]
  SeriesTitle?: string
  FolderId?: string
}

export interface SavedFolder {
  id: string
  url: string
  name: string
  addedAt: number
}

/** A video promoted into a playable queue item. */
export interface PlayableItem {
  path: string
  name: string
  src: string
  size: number
  modTime?: string
  folderId?: string
}

// ===== UI state =====

export type ViewMode = 'grid' | 'list'
export type SortKey = 'name' | 'size' | 'date'
export type SortDir = 'asc' | 'desc'

export interface SortState {
  key: SortKey
  dir: SortDir
}

// ===== Persistence =====

export interface ResumeEntry {
  path: string
  name: string
  src?: string
  time: number
  duration: number
  updatedAt: number
  isNext?: boolean
}

export interface FavoriteEntry {
  path: string
  name: string
  isDir: boolean
  src?: string
  addedAt: number
}

export type AccentKey = 'crimson' | 'azure' | 'violet' | 'emerald' | 'amber'

export interface Settings {
  accent: AccentKey
  autoplayNext: boolean
  rememberPosition: boolean
  reduceMotion: boolean
  defaultVolume: number
  defaultPlayer: 'web' | 'mpv'
  view: ViewMode
  tmdbApiKey?: string
}

// ===== Ephemeral UI =====

export type ToastVariant = 'default' | 'success' | 'error' | 'info'

export interface ToastMessage {
  id: string
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

// ===== Electron bridge =====

declare global {
  interface Window {
    electronAPI?: {
      getWindowHandle: () => Promise<number | null>
      minimize?: () => void
      maximize?: () => void
      close?: () => void
      isElectron?: boolean
    }
  }
}
