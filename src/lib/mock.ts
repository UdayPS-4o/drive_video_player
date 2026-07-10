// Demo dataset so the full UI (and the real video player) can be explored
// without connecting a live Google Drive folder. Uses Google's public sample
// clips as playable sources.

import type { DriveItem } from '../types'

const SAMPLES: { name: string; url: string; size: number }[] = [
  { name: 'Big Buck Bunny', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', size: 158_008_374 },
  { name: 'Sintel', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', size: 122_440_802 },
  { name: 'Elephants Dream', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', size: 169_801_578 },
  { name: 'Tears of Steel', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', size: 161_421_961 },
  { name: 'For Bigger Blazes', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', size: 2_498_125 },
  { name: 'For Bigger Escapes', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', size: 2_358_385 },
  { name: 'Subaru Outback On Street And Dirt', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4', size: 2_586_000 },
  { name: 'Volkswagen GTI Review', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4', size: 2_524_000 },
  { name: 'We Are Going On Bullrun', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4', size: 2_623_000 },
]

const DAY = 86_400_000

function video(name: string, path: string, sample: number, ageDays: number, qualityTag = '1080p'): DriveItem {
  const s = SAMPLES[sample % SAMPLES.length]
  return {
    Path: path,
    Name: `${name}.${qualityTag}.x264.mp4`,
    Size: s.size,
    MimeType: 'video/mp4',
    IsDir: false,
    ModTime: new Date(Date.now() - ageDays * DAY).toISOString(),
    StreamUrl: s.url,
  }
}

function folder(name: string, path: string, ageDays: number): DriveItem {
  return {
    Path: path,
    Name: name,
    Size: 0,
    MimeType: 'inode/directory',
    IsDir: true,
    ModTime: new Date(Date.now() - ageDays * DAY).toISOString(),
  }
}

const TREE: Record<string, DriveItem[]> = {
  '': [
    folder('Movies', 'Movies', 2),
    folder('Series', 'Series', 1),
    folder('Documentaries', 'Documentaries', 9),
    video('Open Source Heroes', 'Open Source Heroes', 0, 0, '4K'),
    video('The Midnight Drive', 'The Midnight Drive', 6, 3),
    video('Neon Skyline', 'Neon Skyline', 1, 5),
    video('Echoes of Tomorrow', 'Echoes of Tomorrow', 3, 11),
  ],
  Movies: [
    video('Big Buck Bunny', 'Movies/Big Buck Bunny', 0, 1, '4K'),
    video('Sintel', 'Movies/Sintel', 1, 4),
    video('Tears of Steel', 'Movies/Tears of Steel', 3, 7, '4K'),
    video('Elephants Dream', 'Movies/Elephants Dream', 2, 20),
    video('The Last Outback', 'Movies/The Last Outback', 6, 30),
  ],
  Series: [
    folder('Aurora — Season 1', 'Series/Aurora — Season 1', 1),
    folder('City Lights — Season 1', 'Series/City Lights — Season 1', 8),
  ],
  'Series/Aurora — Season 1': [
    video('Aurora S01E01 — Pilot', 'Series/Aurora — Season 1/E01', 4, 1),
    video('Aurora S01E02 — Drift', 'Series/Aurora — Season 1/E02', 5, 1),
    video('Aurora S01E03 — Signal', 'Series/Aurora — Season 1/E03', 6, 1),
    video('Aurora S01E04 — Bullrun', 'Series/Aurora — Season 1/E04', 8, 1),
  ],
  'Series/City Lights — Season 1': [
    video('City Lights S01E01', 'Series/City Lights — Season 1/E01', 7, 9),
    video('City Lights S01E02', 'Series/City Lights — Season 1/E02', 8, 9),
  ],
  Documentaries: [
    video('Planet Render', 'Documentaries/Planet Render', 2, 12, '4K'),
    video('The Engine Room', 'Documentaries/The Engine Room', 7, 18),
    video('Glass & Steel', 'Documentaries/Glass & Steel', 3, 40),
  ],
}

export function isDemoActive(): boolean {
  return sessionStorage.getItem('aurora:demo') === '1'
}

export function setDemoActive(on: boolean) {
  if (on) sessionStorage.setItem('aurora:demo', '1')
  else sessionStorage.removeItem('aurora:demo')
}

export function mockListDir(path: string): DriveItem[] {
  return TREE[path] ?? []
}
