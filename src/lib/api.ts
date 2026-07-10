// Thin typed client over the Vite middleware backend (see vite.config.ts).

import type { DriveItem } from '../types'

export interface SetFolderResult {
  success: boolean
  folderId?: string
  error?: string
}

const RCLONE_BASE = 'http://127.0.0.1:8080'

/** Point the backend at a Google Drive folder URL/ID. */
export async function setFolder(url: string): Promise<SetFolderResult> {
  const res = await fetch('/api/set-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  return res.json()
}

/** List a directory (relative to the connected root). */
export async function listDir(path: string, folderId?: string): Promise<DriveItem[]> {
  const url = folderId
    ? `/api/ls?path=${encodeURIComponent(path)}&folderId=${encodeURIComponent(folderId)}`
    : `/api/ls?path=${encodeURIComponent(path)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to list "${path}" (${res.status})`)
  const data = (await res.json()) as DriveItem[]
  return Array.isArray(data) ? data : []
}

/** Browser-playable URL (proxied through Vite to rclone). */
export function streamUrl(path: string): string {
  return `/stream/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** Absolute rclone URL — needed by native players (MPV/VLC). */
export function absoluteUrl(path: string): string {
  return `${RCLONE_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`
}


