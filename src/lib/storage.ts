// Typed, namespaced localStorage with safe parsing + a tiny pub/sub so views
// re-render when watch history / favorites / settings change.

import { useEffect, useState } from 'react'
import type { ResumeEntry, FavoriteEntry, Settings, SavedFolder } from '../types'

const NS = 'aurora:'
const K = {
  resume: NS + 'resume',
  favorites: NS + 'favorites',
  settings: NS + 'settings',
  folders: NS + 'folders',
  activeFolderId: NS + 'activeFolderId',
  watched: NS + 'watched',
} as const

export const DEFAULT_SETTINGS: Settings = {
  accent: 'crimson',
  autoplayNext: true,
  rememberPosition: true,
  reduceMotion: false,
  defaultVolume: 1,
  defaultPlayer: 'web',
  view: 'grid',
  tmdbApiKey: '',
}

// ---- low-level ----

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...(fallback as object), ...(JSON.parse(raw) as object) } as T
  } catch {
    return fallback
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    emit()
  } catch {
    /* quota / private mode — ignore */
  }
}

// ---- pub/sub ----

const listeners = new Set<() => void>()
function emit() {
  listeners.forEach((fn) => fn())
}
export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Re-render a component whenever any stored value changes. */
export function useStorageVersion(): number {
  const [v, setV] = useState(0)
  useEffect(() => subscribe(() => setV((n) => n + 1)), [])
  return v
}

// ---- settings ----

export function getSettings(): Settings {
  return read<Settings>(K.settings, DEFAULT_SETTINGS)
}
export function saveSettings(patch: Partial<Settings>) {
  write(K.settings, { ...getSettings(), ...patch })
}

// ---- resume / continue watching ----

const RESUME_MIN = 5 // don't track the first few seconds
const RESUME_DONE = 0.90 // treat >90% as finished (credits roll)

export function getResumeMap(): Record<string, ResumeEntry> {
  return read<Record<string, ResumeEntry>>(K.resume, {})
}

export function getResume(path: string): ResumeEntry | undefined {
  return getResumeMap()[path]
}

export function setResume(entry: Omit<ResumeEntry, 'updatedAt'>) {
  if (!getSettings().rememberPosition) return
  const map = getResumeMap()
  const finished = entry.duration > 0 && entry.time / entry.duration >= RESUME_DONE
  
  if (finished) {
    delete map[entry.path]
  } else if (entry.time < RESUME_MIN && !entry.isNext) {
    delete map[entry.path]
  } else {
    map[entry.path] = { ...entry, updatedAt: Date.now() }
  }
  write(K.resume, map)
}

export function clearResume(path: string) {
  const map = getResumeMap()
  delete map[path]
  write(K.resume, map)
}

/** Most-recent-first list of partially-watched items. */
export function getContinueWatching(limit = 20): ResumeEntry[] {
  return Object.values(getResumeMap())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}

// ---- watched ----

export function getWatchedMap(): Record<string, number> {
  return read<Record<string, number>>(K.watched, {})
}

export function isWatched(path: string): boolean {
  return !!getWatchedMap()[path]
}

export function markWatched(paths: string | string[]) {
  const map = getWatchedMap()
  const now = Date.now()
  if (Array.isArray(paths)) {
    paths.forEach(p => { map[p] = now })
  } else {
    map[paths] = now
  }
  write(K.watched, map)
}

export function unmarkWatched(path: string) {
  const map = getWatchedMap()
  delete map[path]
  write(K.watched, map)
}

// ---- favorites ----

export function getFavorites(): FavoriteEntry[] {
  return readArray<FavoriteEntry>(K.favorites)
}

export function isFavorite(path: string): boolean {
  return getFavorites().some((f) => f.path === path)
}

export function toggleFavorite(entry: Omit<FavoriteEntry, 'addedAt'>): boolean {
  const list = getFavorites()
  const idx = list.findIndex((f) => f.path === entry.path)
  if (idx >= 0) {
    list.splice(idx, 1)
    write(K.favorites, list)
    return false
  }
  list.unshift({ ...entry, addedAt: Date.now() })
  write(K.favorites, list)
  return true
}

// ---- folders ----

export function getSavedFolders(): SavedFolder[] {
  return readArray<SavedFolder>(K.folders)
}

export function saveFolder(folder: SavedFolder) {
  const folders = getSavedFolders()
  const exists = folders.findIndex((f) => f.id === folder.id)
  if (exists >= 0) {
    folders[exists] = folder
  } else {
    folders.push(folder)
  }
  write(K.folders, folders)
}

export function deleteFolder(id: string) {
  const folders = getSavedFolders().filter((f) => f.id !== id)
  write(K.folders, folders)
  if (getActiveFolderId() === id) {
    clearActiveFolderId()
  }
}

export function getActiveFolderId(): string {
  return localStorage.getItem(K.activeFolderId) || ''
}

export function setActiveFolderId(id: string) {
  localStorage.setItem(K.activeFolderId, id)
  emit()
}

export function clearActiveFolderId() {
  localStorage.removeItem(K.activeFolderId)
  emit()
}
