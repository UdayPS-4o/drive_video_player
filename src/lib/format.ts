import type { DriveItem } from '../types'

// Formatting and naming helpers shared across the app.

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'flv', 'wmv', 'mpg', 'mpeg',
  'ts', 'm2ts', '3gp', 'ogv', 'vob', 'divx',
])

export function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  const value = bytes / Math.pow(k, i)
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${sizes[i]}`
}

/** Seconds -> "M:SS" or "H:MM:SS". */
export function formatTime(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const s = Math.floor(totalSeconds)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (hh > 0) return `${hh}:${pad(mm)}:${pad(ss)}`
  return `${mm}:${pad(ss)}`
}

/** Human relative time, e.g. "3 days ago". */
export function formatRelative(epochMs?: number | string): string {
  if (!epochMs) return ''
  const then = typeof epochMs === 'string' ? new Date(epochMs).getTime() : epochMs
  if (!isFinite(then)) return ''
  const diff = Date.now() - then
  const sec = Math.round(diff / 1000)
  const min = Math.round(sec / 60)
  const hr = Math.round(min / 60)
  const day = Math.round(hr / 24)
  const month = Math.round(day / 30)
  const year = Math.round(day / 365)
  if (sec < 45) return 'just now'
  if (min < 60) return `${min}m ago`
  if (hr < 24) return `${hr}h ago`
  if (day < 30) return `${day}d ago`
  if (month < 12) return `${month}mo ago`
  return `${year}y ago`
}

export function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx <= 0) return ''
  return name.slice(idx + 1).toLowerCase()
}

export function isVideoFile(item: { Name: string; MimeType?: string; IsDir: boolean }): boolean {
  if (item.IsDir) return false
  if (item.MimeType && item.MimeType.startsWith('video/')) return true
  return VIDEO_EXTENSIONS.has(fileExtension(item.Name))
}

/** Turn "The.Movie.2021.1080p.x265.mkv" into "The Movie 2021 1080p x265". */
export function prettyTitle(name: string): string {
  let base = name
  const ext = fileExtension(name)
  if (ext) base = name.slice(0, -(ext.length + 1))
  return base
    .replace(/[._]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** A short uppercase quality/format tag derived from the filename, e.g. "4K", "HEVC". */
export function qualityTag(name: string): string | null {
  const upper = name.toUpperCase()
  if (/\b(2160P|4K|UHD)\b/.test(upper)) return '4K'
  if (/\b1080P\b/.test(upper)) return '1080p'
  if (/\b720P\b/.test(upper)) return '720p'
  if (/\b480P\b/.test(upper)) return 'SD'
  if (/\b(X265|HEVC|H265)\b/.test(upper)) return 'HEVC'
  return null
}

/** Deterministic hue (0-360) from a string — used for placeholder art. */
export function hueFromString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 360
}

/** Two-letter initials for placeholder posters. */
export function initials(name: string): string {
  const words = prettyTitle(name).split(' ').filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export interface TitleParseResult {
  isSeries: boolean
  title: string
  season?: number
  episode?: number
  episodeTitle?: string
  year?: string
}

export function parseVideoTitle(filename: string): TitleParseResult {
  const cleanFilename = filename.replace(/\.[a-zA-Z0-9]+$/, ''); // strip extension
  
  // Try matching standard patterns like S05E01 or Season 5 Episode 1 or 5x01
  const sPattern = /\bS(\d{1,2})E(\d{1,3})\b/i;
  const seasonPattern = /\bSeason\s*(\d{1,2})\s*Episode\s*(\d{1,3})\b/i;
  const xPattern = /\b(\d{1,2})x(\d{2,3})\b/i;
  
  let match = cleanFilename.match(sPattern) || cleanFilename.match(seasonPattern) || cleanFilename.match(xPattern);
  
  const junkRegex = /\b(2160p|1080p|720p|480p|4k|uhd|hdr|atmos|dolby|5\.1|ddp5|ddp|ac3|x264|x265|hevc|h264|h265|hindi|english|org|dual|audio|series|season|episode|web-dl|webrip|web|bluray|hdtv|hdrip|esubs|msubs|sub|eng|hin|amzn|nf|dsnp|hc|proper|repack|readnfo)\b.*/i;

  if (match) {
    const season = parseInt(match[1], 10);
    const episode = parseInt(match[2], 10);
    
    const matchIndex = match.index || 0;
    const matchLength = match[0].length;
    
    let leftPart = cleanFilename.substring(0, matchIndex).trim();
    let rightPart = cleanFilename.substring(matchIndex + matchLength).trim();
    
    // Clean left part (Series title)
    let year: string | undefined;
    const yearMatch = leftPart.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
      year = yearMatch[1];
      leftPart = leftPart.replace(/\b(19\d\d|20\d\d)\b/, '').replace(/\(\s*\)/, '');
    }
    
    leftPart = leftPart.replace(junkRegex, '');
    leftPart = leftPart.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
    leftPart = leftPart.replace(/[-–—:]+$/, '').trim();
    
    // Clean right part (Episode title)
    let epTitle = rightPart.replace(/[._]+/g, ' ').replace(/\s+/g, ' ');
    epTitle = epTitle.replace(junkRegex, '').trim();
    epTitle = epTitle.replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').trim();
    
    return {
      isSeries: true,
      title: leftPart || 'Unknown Series',
      season,
      episode,
      episodeTitle: epTitle || undefined,
      year
    };
  }
  
  // If not a series, maybe it's a movie part of a movie series?
  let title = cleanFilename.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  let year: string | undefined;
  const yearMatch = title.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    year = yearMatch[1];
    title = title.replace(/\b(19\d\d|20\d\d)\b/, '').replace(/\(\s*\)/, '').trim();
  }
  
  return {
    isSeries: false,
    title: title.replace(/[-–—:\s]+$/, '').trim(),
    year
  };
}

export function groupItems(items: DriveItem[]): DriveItem[] {
  const groupedList: DriveItem[] = []
  const seriesGroups: Record<string, DriveItem[]> = {}
  const processedKeys = new Set<string>()
  
  for (const item of items) {
    if (item.IsDir) {
      groupedList.push(item)
      continue
    }
    
    const parsed = parseVideoTitle(item.Name)
    if (parsed.isSeries) {
      const groupKey = `${parsed.title.toLowerCase()}:${parsed.season ?? 0}`
      if (!seriesGroups[groupKey]) {
        seriesGroups[groupKey] = []
      }
      seriesGroups[groupKey].push(item)
    } else {
      groupedList.push(item)
    }
  }
  
  for (const item of items) {
    if (item.IsDir) {
      continue
    }
    
    const parsed = parseVideoTitle(item.Name)
    if (parsed.isSeries) {
      const groupKey = `${parsed.title.toLowerCase()}:${parsed.season ?? 0}`
      const groupEpisodes = seriesGroups[groupKey]
      
      if (!processedKeys.has(groupKey)) {
        processedKeys.add(groupKey)
        
        // Sort episodes inside the group by episode number ascending
        groupEpisodes.sort((a, b) => {
          const pa = parseVideoTitle(a.Name)
          const pb = parseVideoTitle(b.Name)
          return (pa.episode ?? 0) - (pb.episode ?? 0)
        })
        
        const firstEp = groupEpisodes[0]
        const groupTitle = parsed.season
          ? `${parsed.title} (Season ${parsed.season})`
          : parsed.title
        
        const groupItem: DriveItem = {
          Path: `group:${groupKey}`,
          Name: groupTitle,
          Size: groupEpisodes.reduce((acc, it) => acc + it.Size, 0),
          MimeType: 'inode/directory',
          IsDir: true,
          ModTime: firstEp.ModTime,
          IsGroup: true,
          GroupKey: groupKey,
          GroupItems: groupEpisodes,
          SeriesTitle: parsed.title
        }
        
        groupedList.push(groupItem)
      }
    }
  }
  
  return groupedList
}
