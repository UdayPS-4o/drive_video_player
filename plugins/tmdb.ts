import fs from 'fs'
import path from 'path'

export interface EpisodeInfo {
  season: number
  number: number
  name: string
  still: string | null
  summary: string | null
}

/**
 * Fetches TV show metadata from Tvmaze and falls back to TMDb for episode stills if they are missing.
 * Requires a TMDb API key or Bearer token to perform the TMDb lookups.
 */
export async function fetchTvShowMetadata(title: string, tmdbKey: string): Promise<EpisodeInfo[] | null> {
  if (!title) return null

  const cachePath = path.resolve('./tvshow_cache.json')
  let cache: Record<string, EpisodeInfo[]> = {}
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
    } catch (e) {
      // ignore
    }
  }

  const normalizedTitle = title.trim().toLowerCase()
  if (cache[normalizedTitle]) {
    return cache[normalizedTitle]
  }

  // Tvmaze lookup is free and doesn't require a key
  const searchUrl = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}&embed=episodes`
  try {
    const response = await fetch(searchUrl)
    if (response.ok) {
      const data = await response.json() as any
      if (data && data._embedded && Array.isArray(data._embedded.episodes)) {
        let episodes: EpisodeInfo[] = data._embedded.episodes.map((ep: any) => ({
          season: ep.season,
          number: ep.number,
          name: ep.name,
          still: ep.image?.medium || ep.image?.original || null,
          summary: ep.summary || null
        }))

        const hasMissingStills = episodes.some((ep) => !ep.still)
        if (hasMissingStills && tmdbKey) {
          try {
            // Headers for tmdb request
            const headers = tmdbKey.startsWith('ey')
              ? { Authorization: `Bearer ${tmdbKey}`, Accept: 'application/json' }
              : { Accept: 'application/json' };

            const getTmdbUrl = (url: string) => {
              if (tmdbKey.startsWith('ey')) return url;
              const connector = url.includes('?') ? '&' : '?';
              return `${url}${connector}api_key=${tmdbKey}`;
            };

            const tmdbSearchRes = await fetch(getTmdbUrl(`https://api.tmdb.org/3/search/tv?query=${encodeURIComponent(title)}`), { headers })
            if (tmdbSearchRes.ok) {
              const tmdbSearchData = await tmdbSearchRes.json() as any
              if (tmdbSearchData.results && tmdbSearchData.results.length > 0) {
                const showId = tmdbSearchData.results[0].id
                const seasonsWithMissing = Array.from(new Set(
                  episodes.filter((ep) => !ep.still).map((ep) => ep.season)
                ))

                for (const seasonNum of seasonsWithMissing) {
                  const tmdbSeasonRes = await fetch(getTmdbUrl(`https://api.tmdb.org/3/tv/${showId}/season/${seasonNum}`), { headers })
                  if (tmdbSeasonRes.ok) {
                    const tmdbSeasonData = await tmdbSeasonRes.json() as any
                    if (Array.isArray(tmdbSeasonData.episodes)) {
                      episodes = episodes.map((ep) => {
                        if (ep.season === seasonNum && !ep.still) {
                          const tmdbEp = tmdbSeasonData.episodes.find((tEp: any) => tEp.episode_number === ep.number)
                          if (tmdbEp && tmdbEp.still_path) {
                            return {
                              ...ep,
                              still: `https://image.tmdb.org/t/p/w500${tmdbEp.still_path}`
                            }
                          }
                        }
                        return ep
                      })
                    }
                  }
                }
              }
            }
          } catch (tmdbErr: any) {
            console.error('TMDb fallback error in plugin:', tmdbErr.message)
          }
        }

        cache[normalizedTitle] = episodes
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2))
        return episodes
      }
    }
  } catch (err: any) {
    console.error('Error fetching Tvmaze metadata:', err.message)
  }

  // Cache empty episodes array so we don't spam the API for invalid shows
  cache[normalizedTitle] = []
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2))
  return null
}
