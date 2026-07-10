import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec, spawn, ChildProcess, execSync } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { fetchTvShowMetadata } from './plugins/tmdb'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

let hasLibPlacebo = false
try {
  hasLibPlacebo = execSync(`"${ffmpegStatic}" -filters`, { encoding: 'utf8' }).includes('libplacebo')
} catch (e) {
  // Ignore
}

ffmpeg.setFfprobePath(ffprobeStatic.path)

const execAsync = promisify(exec)

let currentFolderId = ''
let rcloneServerProcess: ChildProcess | null = null

// Helper to extract ID from URL
function extractFolderId(urlOrId: string) {
  const match = urlOrId.match(/folders\/([a-zA-Z0-9-_]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9-_]{20,}$/.test(urlOrId)) return urlOrId
  return null
}

function resolveRclonePath() {
  const winPath = path.resolve('./rclone.exe')
  const unixPath = path.resolve('./rclone')
  if (process.platform === 'win32') return winPath
  if (fs.existsSync(unixPath)) return unixPath
  return fs.existsSync(winPath) ? winPath : unixPath
}

function startRcloneServer(folderId: string) {
  const rclonePath = resolveRclonePath()
  const configPath = path.resolve('./rclone.conf')
  
  if (rcloneServerProcess) {
    rcloneServerProcess.kill()
    rcloneServerProcess = null
  }

  if (!folderId) return

  rcloneServerProcess = spawn(rclonePath, [
    'serve', 'http', 'drive:',
    '--addr', '127.0.0.1:8080',
    '--vfs-cache-mode', 'full',
    '--buffer-size', '256M',        // in-memory IO buffer per open file
    '--vfs-read-ahead', '512M',     // read 512 MB ahead from Drive (prevents stalls)
    '--drive-root-folder-id', folderId,
    '--config', configPath
  ])

  rcloneServerProcess.stdout?.on('data', (data) => console.log(`rclone: ${data}`))
  rcloneServerProcess.stderr?.on('data', (data) => console.error(`rclone err: ${data}`))
}

// Ensure cleanup
process.on('exit', () => {
  if (rcloneServerProcess) rcloneServerProcess.kill()
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'rclone-api',
      configureServer(server) {
        
        server.middlewares.use('/api/set-folder', async (req, res) => {
          // Parse JSON body
          let body = ''
          req.on('data', chunk => body += chunk.toString())
          req.on('end', () => {
            try {
              const { url } = JSON.parse(body)
              const folderId = extractFolderId(url)
              if (folderId) {
                if (folderId !== currentFolderId || !rcloneServerProcess) {
                  currentFolderId = folderId
                  startRcloneServer(folderId)
                }
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true, folderId }))
              } else {
                res.statusCode = 400
                res.end(JSON.stringify({ success: false, error: 'Invalid Folder URL or ID' }))
              }
            } catch (e) {
              res.statusCode = 400
              res.end(JSON.stringify({ success: false }))
            }
          })
        })

        server.middlewares.use('/api/ls', async (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const urlObj = new URL(req.url!, `http://${req.headers.host}`)
            const targetPath = urlObj.searchParams.get('path') || ''
            const folderId = urlObj.searchParams.get('folderId') || currentFolderId
            
            if (!folderId) {
              res.end(JSON.stringify([]))
              return
            }

            // Ensure path doesn't break out
            const safePath = targetPath.replace(/\\/g, '/').replace(/^\/+/, '')
            
            const rclonePath = resolveRclonePath()
            const configPath = path.resolve('./rclone.conf')

            if (fs.existsSync(configPath) && fs.existsSync(rclonePath)) {
              // Non-recursive listing
              const cmd = `"${rclonePath}" lsjson "drive:${safePath}" --drive-root-folder-id ${folderId} --config "${configPath}"`
              const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 64 })
              // rclone returns Path relative to the listed dir (leaf names only).
              // Rewrite to a root-relative path so streaming + navigation work at any depth.
              try {
                const arr = JSON.parse(stdout)
                const prefixed = safePath
                  ? arr.map((it: any) => ({ ...it, Path: `${safePath}/${it.Path}` }))
                  : arr
                res.end(JSON.stringify(prefixed))
              } catch {
                res.end(stdout)
              }
            } else {
              res.end(JSON.stringify([]))
            }
          } catch (err: any) {
            console.error('Rclone lsjson error:', err.message)
            res.end(JSON.stringify([]))
          }
        })



        // API endpoint to search for poster image
        server.middlewares.use('/api/poster', async (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const urlObj = new URL(req.url!, `http://${req.headers.host}`)
            const title = urlObj.searchParams.get('title')
            
            if (!title) {
              res.end(JSON.stringify({ success: false, error: 'No title provided' }))
              return
            }
            
            const cachePath = path.resolve('./poster_cache.json')
            let cache: Record<string, string> = {}
            if (fs.existsSync(cachePath)) {
              try {
                cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
              } catch (e) {
                // ignore
              }
            }
            
            const normalizedTitle = title.trim().toLowerCase()
            if (cache[normalizedTitle]) {
              res.end(JSON.stringify({ success: true, poster: cache[normalizedTitle] }))
              return
            }
            
            const searchUrl = `https://imdb.iamidiotareyoutoo.com/search?q=${encodeURIComponent(title)}`
            const response = await fetch(searchUrl)
            if (response.ok) {
              const data = await response.json() as any
              if (data.ok && Array.isArray(data.description) && data.description.length > 0) {
                const match = data.description.find((d: any) => d['#IMG_POSTER'])
                if (match) {
                  const posterUrl = match['#IMG_POSTER']
                  cache[normalizedTitle] = posterUrl
                  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2))
                  res.end(JSON.stringify({ success: true, poster: posterUrl }))
                  return
                }
              }
            }
            
            res.end(JSON.stringify({ success: false, error: 'Not found' }))
          } catch (e: any) {
             res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })

        // API endpoint to search for TV show details and episodes
        server.middlewares.use('/api/tvshow', async (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const urlObj = new URL(req.url!, `http://${req.headers.host}`)
            const title = urlObj.searchParams.get('title')
            const tmdbApiKey = urlObj.searchParams.get('tmdbApiKey') || ''
            
            if (!title) {
              res.end(JSON.stringify({ success: false, error: 'No title provided' }))
              return
            }
            
            const episodes = await fetchTvShowMetadata(title, tmdbApiKey)
            if (episodes) {
              res.end(JSON.stringify({ success: true, episodes }))
            } else {
              res.end(JSON.stringify({ success: false, error: 'Not found' }))
            }
          } catch (e: any) {
             res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })

        // API endpoint to get media metadata (audio tracks)
        server.middlewares.use('/api/metadata', (req, res) => {
          try {
            const urlObj = new URL(req.url!, `http://${req.headers.host}`)
            const targetPath = urlObj.searchParams.get('path')
            
            if (!targetPath) {
              res.statusCode = 400
              res.end('No path provided')
              return
            }
            
            const rcloneUrl = `http://127.0.0.1:8080/${encodeURIComponent(targetPath).replace(/%2F/g, '/')}`
            
            ffmpeg.ffprobe(rcloneUrl, (err, metadata) => {
              res.setHeader('Content-Type', 'application/json')
              if (err) {
                res.end(JSON.stringify({ success: false, error: err.message }))
                return
              }
              const audioStreams = metadata.streams.filter((s: any) => s.codec_type === 'audio')
              const tracks = audioStreams.map((s: any, idx: number) => ({
                index: idx,
                label: s.tags?.language || s.tags?.title || `Audio Track ${idx + 1}`
              }))
              res.end(JSON.stringify({ success: true, tracks }))
            })
          } catch (e: any) {
            res.statusCode = 500
            res.end()
          }
        })

        // API endpoint to transcode unsupported audio streams to AAC
        server.middlewares.use('/api/transcode', (req, res) => {
          try {
            const urlObj = new URL(req.url!, `http://${req.headers.host}`)
            const targetPath = urlObj.searchParams.get('path')
            const start = urlObj.searchParams.get('start') || '0'
            const audioIndex = urlObj.searchParams.get('audio')
            const videoTonemap = urlObj.searchParams.get('videoTonemap') === 'true'
            
            if (!targetPath) {
              res.statusCode = 400
              res.end('No path provided')
              return
            }
            
            const rcloneUrl = `http://127.0.0.1:8080/${encodeURIComponent(targetPath).replace(/%2F/g, '/')}`
            
            res.setHeader('Content-Type', 'video/x-matroska')
            
            const outputOptions = [
              '-map 0:v:0?',
              audioIndex != null ? `-map 0:a:${audioIndex}?` : '-map 0:a?',
            ];

            if (videoTonemap) {
              if (process.platform === 'darwin') {
                outputOptions.push(
                  '-c:v h264_videotoolbox',
                  '-b:v 15M'
                )
              } else {
                outputOptions.push(
                  '-c:v h264_nvenc',
                  '-preset p4',
                  '-b:v 15M'
                )
              }

              // Vulkan/libplacebo hw tonemapping isn't available on macOS (no Vulkan),
              // so always fall back to the software zscale tonemap path there.
              if (hasLibPlacebo && process.platform !== 'darwin') {
                // Perfect DOVI P5 Tonemapping using libplacebo
                outputOptions.push(
                  '-init_hw_device', 'vulkan=vulkan',
                  '-filter_hw_device', 'vulkan',
                  '-vf', 'hwupload,libplacebo=tonemapping=hable:apply_dolbyvision=true:colorspace=bt709:color_primaries=bt709:color_trc=bt709:format=yuv420p,hwdownload,format=yuv420p'
                )
              } else {
                // Fallback basic tonemapping (colors will still be slightly off for DV P5)
                outputOptions.push(
                  '-vf', 'setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p'
                )
              }
            } else {
              outputOptions.push('-c:v copy');
            }

            outputOptions.push(
              '-c:a aac',
              '-ac 2',
              '-f matroska'
            );

            const inputOpts = [`-ss ${start}`];
            if (videoTonemap) {
              // Tolerate DOVI RPU parsing errors (DV Profile 5 RPUs confuse ffmpeg 6.x)
              inputOpts.push('-err_detect', 'ignore_err');
            }

            const command = ffmpeg(rcloneUrl)
              .setFfmpegPath(ffmpegStatic as string)
              .inputOptions(inputOpts)
              .outputOptions(outputOptions)
              
            command.on('error', (err) => {
               if (err.message && !err.message.includes('Output stream closed')) {
                 console.error('FFmpeg error:', err.message)
               }
            })

            command.on('stderr', (line: string) => {
               console.error('FFmpeg stderr:', line)
            })

            console.log('FFmpeg transcode starting:', { rcloneUrl, videoTonemap, start, audioIndex })
            console.log('FFmpeg outputOptions:', outputOptions)
            
            command.pipe(res, { end: true })
            
            req.on('close', () => {
               command.kill('SIGKILL')
            })
          } catch (e: any) {
            console.error('Transcode error:', e.message)
            res.statusCode = 500
            res.end()
          }
        })
      }
    }
  ],
  server: {
    proxy: {
      '/stream': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/stream/, '')
      }
    }
  }
})
