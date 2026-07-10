import './player.css'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Subtitles,
  PictureInPicture2,
  Camera,
  Activity,
  ChevronLeft,
  RotateCcw,
  RotateCw,
  Check,
  X,
  Repeat,
  Gauge,
  AudioLines,
  Loader2,
  AlertTriangle,
  Palette,
} from 'lucide-react'

import type { PlayableItem } from '../../types'
import { formatTime, prettyTitle, initials, hueFromString, parseVideoTitle } from '../../lib/format'
import { getSettings, saveSettings } from '../../lib/storage'

// =============================================================================
// Constants / small types
// =============================================================================

const CONTROLS_HIDE_MS = 2800
const PROGRESS_SAVE_MS = 5000
const UP_NEXT_WINDOW = 20 // seconds from the end to surface the up-next card
const UP_NEXT_COUNT = 8 // countdown seconds before auto-advance
const SEEK_STEP = 10
const ARROW_STEP = 5
const DOUBLE_TAP_MS = 320

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

type OsdKind = 'volume' | 'seek-forward' | 'seek-back' | 'speed' | 'info'
interface OsdState {
  id: number
  kind: OsdKind
  label: string
}

type MenuPanel = 'root' | 'speed' | 'audio' | 'captions'

interface TrackInfo {
  index: number
  label: string
}

// =============================================================================
// Component
// =============================================================================

export default function VideoPlayer(props: VideoPlayerProps) {
  const {
    item,
    queue = [],
    startTime = 0,
    autoplayNext = false,
    onClose,
    onPlayItem,
    onProgress,
  } = props

  // ---- refs to DOM ----
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)
  const volumeBarRef = useRef<HTMLDivElement>(null)

  // ---- playback state ----
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [waiting, setWaiting] = useState(true)
  const [errored, setErrored] = useState(false)
  const [metaLoaded, setMetaLoaded] = useState(false)

  // ---- transcode ----
  const [transcoding, setTranscoding] = useState(false)
  const transcodingRef = useRef(transcoding)
  transcodingRef.current = transcoding

  const [videoTonemap, setVideoTonemap] = useState(false)

  const [transcodeStart, setTranscodeStart] = useState(0)
  const transcodeStartRef = useRef(transcodeStart)
  transcodeStartRef.current = transcodeStart

  // ---- volume ----
  const initialVolume = useMemo(() => {
    const v = getSettings().defaultVolume
    return typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : 1
  }, [])
  const [volume, setVolume] = useState(initialVolume)
  const [muted, setMuted] = useState(false)

  // ---- ui chrome ----
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPip, setIsPip] = useState(false)
  const [showRemaining, setShowRemaining] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPanel, setMenuPanel] = useState<MenuPanel>('root')
  const [showStats, setShowStats] = useState(false)
  const [statsTick, setStatsTick] = useState(0)

  // ---- playback options ----
  const [playbackRate, setPlaybackRate] = useState(1)
  const [looping, setLooping] = useState(false)

  // ---- tracks ----
  const [audioTracks, setAudioTracks] = useState<TrackInfo[]>([])
  const [serverAudioTracks, setServerAudioTracks] = useState<TrackInfo[]>([])
  const [activeAudio, setActiveAudio] = useState(-1)
  const [textTracks, setTextTracks] = useState<TrackInfo[]>([])
  const [activeCaption, setActiveCaption] = useState(-1)
  const [captionsOn, setCaptionsOn] = useState(false)

  // ---- scrubbing ----
  const [scrubbing, setScrubbing] = useState(false)
  const [scrubTime, setScrubTime] = useState(0)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverX, setHoverX] = useState(0)
  const [volExpanded, setVolExpanded] = useState(false)

  // ---- osd + resume toast ----
  const [osd, setOsd] = useState<OsdState | null>(null)
  const [resumeToast, setResumeToast] = useState<string | null>(null)

  // ---- up next ----
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null)

  // ===========================================================================
  // Derived
  // ===========================================================================

  const title = useMemo(() => prettyTitle(item.name), [item.name])

  const { prevItem, nextItem } = useMemo(() => {
    const idx = queue.findIndex((q) => q.path === item.path)
    if (idx < 0) return { prevItem: undefined, nextItem: undefined }
    return {
      prevItem: idx > 0 ? queue[idx - 1] : undefined,
      nextItem: idx < queue.length - 1 ? queue[idx + 1] : undefined,
    }
  }, [queue, item.path])

  const displayTime = scrubbing ? scrubTime : currentTime
  const progressPct = duration > 0 ? (displayTime / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0

  // ===========================================================================
  // Refs that mirror state for use inside listeners / intervals (avoid stale)
  // ===========================================================================

  const latest = useRef({ currentTime, duration, path: item.path, isPlaying, volume, muted })
  latest.current = { currentTime, duration, path: item.path, isPlaying, volume, muted }

  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress
  const onPlayItemRef = useRef(onPlayItem)
  onPlayItemRef.current = onPlayItem
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const reportProgress = useCallback(() => {
    const { currentTime: t, duration: d, path } = latest.current
    if (d > 0 && isFinite(t)) onProgressRef.current?.(path, t, d)
  }, [])

  const handleClose = useCallback(() => {
    reportProgress()
    onCloseRef.current()
  }, [reportProgress])

  // ===========================================================================
  // OSD helper
  // ===========================================================================

  const osdId = useRef(0)
  const showOsd = useCallback((kind: OsdKind, label: string) => {
    osdId.current += 1
    setOsd({ id: osdId.current, kind, label })
  }, [])

  useEffect(() => {
    if (!osd) return
    const t = window.setTimeout(() => {
      setOsd((cur) => (cur && cur.id === osd.id ? null : cur))
    }, 620)
    return () => window.clearTimeout(t)
  }, [osd])

  // ===========================================================================
  // Controls auto-hide
  // ===========================================================================

  const hideTimer = useRef<number | null>(null)

  const revealControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      // Keep controls up if paused, menu open, or hovering important UI.
      if (latest.current.isPlaying && !menuOpenRef.current && !scrubbingRef.current) {
        setControlsVisible(false)
      }
    }, CONTROLS_HIDE_MS)
  }, [])

  const menuOpenRef = useRef(menuOpen)
  menuOpenRef.current = menuOpen
  const scrubbingRef = useRef(scrubbing)
  scrubbingRef.current = scrubbing

  useEffect(() => {
    // Re-arm hide whenever play state / menu / scrub changes.
    revealControls()
  }, [isPlaying, menuOpen, scrubbing, revealControls])

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [])

  // ===========================================================================
  // Imperative helpers
  // ===========================================================================

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused || v.ended) {
      void v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [])

  const seekTo = useCallback((time: number) => {
    const v = videoRef.current
    if (!v || !isFinite(time)) return
    const clamped = Math.min(Math.max(0, time), v.duration && isFinite(v.duration) ? v.duration : duration || time)
    if (transcodingRef.current) {
      setTranscodeStart(clamped)
      setCurrentTime(clamped)
      setWaiting(true)
    } else {
      v.currentTime = clamped
      setCurrentTime(clamped)
    }
  }, [duration])

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current
      if (!v) return
      seekTo(v.currentTime + delta)
      if (delta >= 0) showOsd('seek-forward', `+${Math.abs(delta)}s`)
      else showOsd('seek-back', `-${Math.abs(delta)}s`)
    },
    [seekTo, showOsd],
  )

  const applyVolume = useCallback(
    (next: number, opts: { osd?: boolean } = {}) => {
      const clamped = Math.min(1, Math.max(0, next))
      const v = videoRef.current
      setVolume(clamped)
      if (clamped > 0 && muted) setMuted(false)
      if (v) {
        v.volume = clamped
        if (clamped > 0) v.muted = false
      }
      saveSettings({ defaultVolume: clamped })
      if (opts.osd) showOsd('volume', `${Math.round(clamped * 100)}%`)
    },
    [muted, showOsd],
  )

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    setMuted((m) => {
      const next = !m
      if (v) v.muted = next
      showOsd('volume', next ? 'Muted' : `${Math.round(latest.current.volume * 100)}%`)
      return next
    })
  }, [showOsd])

  const changeRate = useCallback(
    (rate: number) => {
      const v = videoRef.current
      setPlaybackRate(rate)
      if (v) v.playbackRate = rate
      showOsd('speed', `${rate}×`)
    },
    [showOsd],
  )

  const stepRate = useCallback(
    (dir: 1 | -1) => {
      const idx = PLAYBACK_RATES.indexOf(playbackRate as (typeof PLAYBACK_RATES)[number])
      const safeIdx = idx < 0 ? PLAYBACK_RATES.indexOf(1) : idx
      const nextIdx = Math.min(PLAYBACK_RATES.length - 1, Math.max(0, safeIdx + dir))
      changeRate(PLAYBACK_RATES[nextIdx])
    },
    [playbackRate, changeRate],
  )

  // ---- fullscreen ----
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      void el.requestFullscreen().catch(() => {})
    }
  }, [])

  // ---- pip ----
  const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document &&
    document.pictureInPictureEnabled
  const togglePip = useCallback(() => {
    const v = videoRef.current
    if (!v || !pipSupported) return
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => {})
    } else {
      void v.requestPictureInPicture().catch(() => {})
    }
  }, [pipSupported])

  // ---- captions ----
  const setCaptionTrack = useCallback((index: number) => {
    const v = videoRef.current
    if (!v) return
    const tracks = v.textTracks
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = i === index ? 'showing' : 'disabled'
    }
    setActiveCaption(index)
    setCaptionsOn(index >= 0)
  }, [])

  const toggleCaptions = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (captionsOn) {
      setCaptionTrack(-1)
      showOsd('info', 'Captions off')
    } else {
      // Re-enable last active, else first available.
      const target = activeCaption >= 0 ? activeCaption : textTracks.length > 0 ? textTracks[0].index : -1
      if (target >= 0) {
        setCaptionTrack(target)
        showOsd('info', 'Captions on')
      } else {
        showOsd('info', 'No captions')
      }
    }
  }, [captionsOn, activeCaption, textTracks, setCaptionTrack, showOsd])

  const setAudioTrack = useCallback((index: number) => {
    if (serverAudioTracks.length > 0) {
      setActiveAudio(index)
      setTranscoding(true)
      setTranscodeStart(latest.current.currentTime)
    } else {
      const v = videoRef.current as HTMLVideoElementWithAudio | null
      if (!v || !v.audioTracks) return
      for (let i = 0; i < v.audioTracks.length; i++) {
        v.audioTracks[i].enabled = i === index
      }
      setActiveAudio(index)
    }
  }, [serverAudioTracks])

  // ---- screenshot ----
  const takeScreenshot = useCallback(() => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    try {
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      const stamp = formatTime(v.currentTime).replace(/:/g, '.')
      a.href = url
      a.download = `${title} @ ${stamp}.png`
      a.click()
      showOsd('info', 'Frame saved')
    } catch {
      showOsd('info', 'Capture blocked')
    }
  }, [title, showOsd])

  // ===========================================================================
  // Fetch server metadata for tracks
  // ===========================================================================

  useEffect(() => {
    fetch(`/api/metadata?path=${encodeURIComponent(item.path)}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.tracks) {
          setServerAudioTracks(d.tracks)
          if (d.tracks.length > 0) {
             setActiveAudio((prev) => prev === -1 ? d.tracks[0].index : prev)
          }
        }
      })
      .catch(console.error)
  }, [item.path])

  // ===========================================================================
  // Wire native <video> events
  // ===========================================================================

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onLoadedMeta = () => {
      const liveDuration = v.duration || 0
      if (liveDuration && isFinite(liveDuration)) {
        setDuration(liveDuration)
      }
      setMetaLoaded(true)
      v.volume = latest.current.volume
      v.muted = latest.current.muted
      v.playbackRate = playbackRateRef.current
      v.loop = loopingRef.current
      // Resume seek.
      if (transcodingRef.current) {
        setWaiting(false)
      } else if (startTimeRef.current > 0 && startTimeRef.current < (v.duration || Infinity)) {
        v.currentTime = startTimeRef.current
        setCurrentTime(startTimeRef.current)
        setResumeToast(`Resuming from ${formatTime(startTimeRef.current)}`)
        window.setTimeout(() => setResumeToast(null), 2600)
      }
      refreshTracks()
      void v.play().catch(() => {})
    }
    const onTimeUpdate = () => {
      if (!scrubbingRef.current) {
        if (transcodingRef.current) {
          setCurrentTime(v.currentTime + transcodeStartRef.current)
        } else {
          setCurrentTime(v.currentTime)
        }
      }
    }
    const onDurationChange = () => {
      if (v.duration && isFinite(v.duration)) {
        setDuration(v.duration)
      }
    }
    const onProgressEv = () => {
      try {
        if (v.buffered.length > 0) {
          // furthest buffered range covering current position
          let end = 0
          for (let i = 0; i < v.buffered.length; i++) {
            if (v.buffered.start(i) <= v.currentTime + 0.5) end = Math.max(end, v.buffered.end(i))
          }
          if (end === 0) end = v.buffered.end(v.buffered.length - 1)
          setBuffered(end)
        }
      } catch {
        /* buffered access can throw on some states */
      }
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => {
      setIsPlaying(false)
      reportProgress()
    }
    const onWaiting = () => setWaiting(true)
    const onPlaying = () => {
      setWaiting(false)
      setErrored(false)
    }
    const onCanPlay = () => setWaiting(false)
    const onSeeking = () => setWaiting(true)
    const onSeeked = () => setWaiting(false)
    const onVolumeChange = () => {
      setVolume(v.volume)
      setMuted(v.muted)
    }
    const onRateChange = () => setPlaybackRate(v.playbackRate)
    const onError = () => {
      setErrored(true)
      setWaiting(false)
    }
    const onEnded = () => {
      setIsPlaying(false)
      reportProgress()
      if (autoplayNextRef.current && nextItemRef.current) {
        onPlayItemRef.current?.(nextItemRef.current)
      }
    }

    v.addEventListener('loadedmetadata', onLoadedMeta)
    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('durationchange', onDurationChange)
    v.addEventListener('progress', onProgressEv)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('playing', onPlaying)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('seeking', onSeeking)
    v.addEventListener('seeked', onSeeked)
    v.addEventListener('volumechange', onVolumeChange)
    v.addEventListener('ratechange', onRateChange)
    v.addEventListener('error', onError)
    v.addEventListener('ended', onEnded)

    // If metadata is already available (fast cache), kick it.
    if (v.readyState >= 1) onLoadedMeta()

    return () => {
      v.removeEventListener('loadedmetadata', onLoadedMeta)
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('durationchange', onDurationChange)
      v.removeEventListener('progress', onProgressEv)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('playing', onPlaying)
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('seeking', onSeeking)
      v.removeEventListener('seeked', onSeeked)
      v.removeEventListener('volumechange', onVolumeChange)
      v.removeEventListener('ratechange', onRateChange)
      v.removeEventListener('error', onError)
      v.removeEventListener('ended', onEnded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportProgress])

  // refs read inside the video-event effect (kept up to date below)
  const startTimeRef = useRef(startTime)
  startTimeRef.current = startTime
  const playbackRateRef = useRef(playbackRate)
  playbackRateRef.current = playbackRate
  const loopingRef = useRef(looping)
  loopingRef.current = looping
  const autoplayNextRef = useRef(autoplayNext)
  autoplayNextRef.current = autoplayNext
  const nextItemRef = useRef(nextItem)
  nextItemRef.current = nextItem

  // Refresh track lists from the live media element.
  const refreshTracks = useCallback(() => {
    const v = videoRef.current as HTMLVideoElementWithAudio | null
    if (!v) return
    // text tracks (captions / subtitles)
    const texts: TrackInfo[] = []
    let activeText = -1
    for (let i = 0; i < v.textTracks.length; i++) {
      const tt = v.textTracks[i]
      if (tt.kind === 'subtitles' || tt.kind === 'captions') {
        texts.push({ index: i, label: tt.label || tt.language || `Track ${texts.length + 1}` })
        if (tt.mode === 'showing') activeText = i
      }
    }
    setTextTracks(texts)
    setActiveCaption(activeText)
    setCaptionsOn(activeText >= 0)

    // audio tracks (Chromium-only API)
    const audios: TrackInfo[] = []
    let activeAud = -1
    if (v.audioTracks) {
      for (let i = 0; i < v.audioTracks.length; i++) {
        const at = v.audioTracks[i]
        audios.push({ index: i, label: at.label || at.language || `Audio ${i + 1}` })
        if (at.enabled) activeAud = i
      }
    }
    setAudioTracks(audios)
    setActiveAudio(activeAud)
  }, [])

  // Listen for late-added tracks (subtitle sidecars attach asynchronously).
  useEffect(() => {
    const v = videoRef.current as HTMLVideoElementWithAudio | null
    if (!v) return
    const onChange = () => refreshTracks()
    v.textTracks.addEventListener?.('addtrack', onChange)
    v.textTracks.addEventListener?.('change', onChange)
    v.audioTracks?.addEventListener?.('addtrack', onChange)
    v.audioTracks?.addEventListener?.('change', onChange)
    return () => {
      v.textTracks.removeEventListener?.('addtrack', onChange)
      v.textTracks.removeEventListener?.('change', onChange)
      v.audioTracks?.removeEventListener?.('addtrack', onChange)
      v.audioTracks?.removeEventListener?.('change', onChange)
    }
  }, [refreshTracks])

  // Keep loop attr in sync.
  useEffect(() => {
    const v = videoRef.current
    if (v) v.loop = looping
  }, [looping])

  // ===========================================================================
  // Progress save interval + unmount flush
  // ===========================================================================

  useEffect(() => {
    const id = window.setInterval(() => {
      if (latest.current.isPlaying) reportProgress()
    }, PROGRESS_SAVE_MS)
    return () => {
      window.clearInterval(id)
      reportProgress() // flush on unmount
    }
  }, [reportProgress])

  // ===========================================================================
  // Fullscreen / PiP state listeners
  // ===========================================================================

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onEnter = () => setIsPip(true)
    const onLeave = () => setIsPip(false)
    v.addEventListener('enterpictureinpicture', onEnter)
    v.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter)
      v.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [])

  // ===========================================================================
  // Stats sampler
  // ===========================================================================

  useEffect(() => {
    if (!showStats) return
    const id = window.setInterval(() => setStatsTick((t) => t + 1), 500)
    return () => window.clearInterval(id)
  }, [showStats])

  // ===========================================================================
  // Stall detection + auto-recovery
  // ===========================================================================
  // When the browser fires `waiting` and readyState stays low for > 4 s
  // (common with proxied HTTP streams), nudge currentTime slightly to force
  // Chrome to re-open its HTTP range request and recover from the stall.

  useEffect(() => {
    const v = videoRef.current
    if (!waiting || !v || errored) return
    const STALL_TIMEOUT_MS = 4000
    const id = window.setTimeout(() => {
      const ve = videoRef.current
      if (!ve || ve.readyState >= 3 || ve.paused) return // recovered or paused by user
      // micro-seek: step back 0.1 s (or forward if at start) to re-trigger range request
      const nudge = ve.currentTime > 0.2 ? -0.1 : 0.1
      ve.currentTime = Math.max(0, ve.currentTime + nudge)
    }, STALL_TIMEOUT_MS)
    return () => window.clearTimeout(id)
  }, [waiting, errored])

  // ===========================================================================
  // Up-next countdown
  // ===========================================================================

  const parsedTitle = useMemo(() => parseVideoTitle(item.name), [item.name])
  const isSeries = parsedTitle.isSeries
  const upNextWindow = isSeries ? Math.min(360, Math.max(120, duration * 0.08)) : UP_NEXT_WINDOW

  const remaining = duration - currentTime
  const upNextActive = autoplayNext && !!nextItem && duration > 0 && remaining <= upNextWindow && remaining > 0

  useEffect(() => {
    if (!upNextActive || remaining > UP_NEXT_COUNT) {
      setUpNextCountdown(null)
      return
    }
    setUpNextCountdown(Math.min(UP_NEXT_COUNT, Math.ceil(remaining)))
    // The actual auto-advance is handled by the 'ended' event; this is the visual ring.
  }, [upNextActive, remaining])

  const playNext = useCallback(() => {
    if (nextItem) onPlayItemRef.current?.(nextItem)
  }, [nextItem])
  const playPrev = useCallback(() => {
    if (prevItem) onPlayItemRef.current?.(prevItem)
  }, [prevItem])

  // ===========================================================================
  // Keyboard shortcuts
  // ===========================================================================

  // Stable refs for the handlers used in the key listener.
  const handlers = useRef({
    togglePlay,
    seekBy,
    seekTo,
    applyVolume,
    toggleMute,
    toggleFullscreen,
    toggleCaptions,
    togglePip,
    takeScreenshot,
    stepRate,
    playNext,
    playPrev,
    revealControls,
  })
  handlers.current = {
    togglePlay,
    seekBy,
    seekTo,
    applyVolume,
    toggleMute,
    toggleFullscreen,
    toggleCaptions,
    togglePip,
    takeScreenshot,
    stepRate,
    playNext,
    playPrev,
    revealControls,
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const h = handlers.current
      h.revealControls()
      const v = videoRef.current

      // number 0-9 -> seek to percentage
      if (/^[0-9]$/.test(e.key) && v && v.duration) {
        e.preventDefault()
        h.seekTo((parseInt(e.key, 10) / 10) * v.duration)
        return
      }

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault()
          h.togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          h.seekBy(-ARROW_STEP)
          break
        case 'ArrowRight':
          e.preventDefault()
          h.seekBy(ARROW_STEP)
          break
        case 'j':
        case 'J':
          e.preventDefault()
          h.seekBy(-SEEK_STEP)
          break
        case 'l':
        case 'L':
          e.preventDefault()
          h.seekBy(SEEK_STEP)
          break
        case 'ArrowUp':
          e.preventDefault()
          h.applyVolume(latest.current.volume + 0.05, { osd: true })
          break
        case 'ArrowDown':
          e.preventDefault()
          h.applyVolume(latest.current.volume - 0.05, { osd: true })
          break
        case 'm':
        case 'M':
          e.preventDefault()
          h.toggleMute()
          break
        case 'f':
        case 'F':
          e.preventDefault()
          h.toggleFullscreen()
          break
        case 'c':
        case 'C':
          e.preventDefault()
          h.toggleCaptions()
          break
        case 'p':
        case 'P':
          e.preventDefault()
          h.togglePip()
          break
        case 's':
        case 'S':
          e.preventDefault()
          h.takeScreenshot()
          break
        case ',':
          if (v && v.paused) {
            e.preventDefault()
            h.seekBy(-1)
          }
          break
        case '.':
          if (v && v.paused) {
            e.preventDefault()
            h.seekBy(1)
          }
          break
        case '<':
          e.preventDefault()
          h.stepRate(-1)
          break
        case '>':
          e.preventDefault()
          h.stepRate(1)
          break
        case 'n':
          e.preventDefault()
          h.playNext()
          break
        case 'N':
          e.preventDefault()
          h.playPrev()
          break
        case 'Escape':
          if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => {})
          } else {
            handleClose()
          }
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ===========================================================================
  // Pointer: seek bar scrubbing
  // ===========================================================================

  const timeFromSeekPointer = useCallback((clientX: number): number => {
    const bar = seekBarRef.current
    if (!bar || !duration) return 0
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }, [duration])

  const onSeekPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const bar = seekBarRef.current
      bar?.setPointerCapture(e.pointerId)
      setScrubbing(true)
      setScrubTime(timeFromSeekPointer(e.clientX))
    },
    [timeFromSeekPointer],
  )

  const onSeekPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const t = timeFromSeekPointer(e.clientX)
      setHoverTime(t)
      const rect = seekBarRef.current?.getBoundingClientRect()
      if (rect) setHoverX(e.clientX - rect.left)
      if (scrubbingRef.current) setScrubTime(t)
    },
    [timeFromSeekPointer],
  )

  const onSeekPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!scrubbingRef.current) return
      const t = timeFromSeekPointer(e.clientX)
      seekTo(t)
      setScrubbing(false)
      seekBarRef.current?.releasePointerCapture?.(e.pointerId)
    },
    [timeFromSeekPointer, seekTo],
  )

  const onSeekLeave = useCallback(() => {
    if (!scrubbingRef.current) setHoverTime(null)
  }, [])

  // ===========================================================================
  // Pointer: volume slider
  // ===========================================================================

  const volFromPointer = useCallback((clientX: number): number => {
    const bar = volumeBarRef.current
    if (!bar) return latest.current.volume
    const rect = bar.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

  const volDragging = useRef(false)
  const onVolPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      volDragging.current = true
      volumeBarRef.current?.setPointerCapture(e.pointerId)
      applyVolume(volFromPointer(e.clientX))
    },
    [applyVolume, volFromPointer],
  )
  const onVolPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (volDragging.current) applyVolume(volFromPointer(e.clientX))
    },
    [applyVolume, volFromPointer],
  )
  const onVolPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    volDragging.current = false
    volumeBarRef.current?.releasePointerCapture?.(e.pointerId)
  }, [])

  // ===========================================================================
  // Surface gestures: click toggles, double-click fullscreen, double-tap seek,
  // wheel changes volume.
  // ===========================================================================

  const lastTap = useRef<{ t: number; side: 'l' | 'r' | null }>({ t: 0, side: null })
  const singleClickTimer = useRef<number | null>(null)

  const onSurfacePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const relX = (e.clientX - rect.left) / rect.width
      const side: 'l' | 'r' = relX < 0.5 ? 'l' : 'r'
      const now = Date.now()
      const isDouble = now - lastTap.current.t < DOUBLE_TAP_MS

      if (isDouble) {
        // cancel pending single-click play toggle
        if (singleClickTimer.current) {
          window.clearTimeout(singleClickTimer.current)
          singleClickTimer.current = null
        }
        // edge double-tap = seek; center-ish double tap = fullscreen
        if (relX < 0.35) {
          seekBy(-SEEK_STEP)
        } else if (relX > 0.65) {
          seekBy(SEEK_STEP)
        } else {
          toggleFullscreen()
        }
        lastTap.current = { t: 0, side: null }
      } else {
        lastTap.current = { t: now, side }
        if (singleClickTimer.current) window.clearTimeout(singleClickTimer.current)
        singleClickTimer.current = window.setTimeout(() => {
          togglePlay()
          singleClickTimer.current = null
        }, DOUBLE_TAP_MS)
      }
    },
    [seekBy, toggleFullscreen, togglePlay],
  )

  useEffect(() => {
    return () => {
      if (singleClickTimer.current) window.clearTimeout(singleClickTimer.current)
    }
  }, [])

  const onSurfaceWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault()
      const step = e.deltaY < 0 ? 0.05 : -0.05
      applyVolume(latest.current.volume + step, { osd: true })
    },
    [applyVolume],
  )

  // ===========================================================================
  // Stats snapshot
  // ===========================================================================

  const stats = useMemo(() => {
    const v = videoRef.current
    void statsTick // re-evaluate on tick
    if (!v) return null
    const q = v.getVideoPlaybackQuality?.()
    // Read buffered ranges directly from the element (not stale React state)
    let liveAhead = 0
    try {
      const ct = v.currentTime
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= ct + 0.5 && v.buffered.end(i) > ct) {
          liveAhead = Math.max(liveAhead, v.buffered.end(i) - ct)
        }
      }
    } catch { /* buffered may throw */ }
    return {
      res: v.videoWidth && v.videoHeight ? `${v.videoWidth} × ${v.videoHeight}` : '—',
      time: formatTime(v.currentTime),
      ahead: liveAhead.toFixed(1) + 's',
      rate: `${v.playbackRate}×`,
      vol: `${Math.round((muted ? 0 : volume) * 100)}%`,
      dropped: q ? `${q.droppedVideoFrames}/${q.totalVideoFrames}` : 'n/a',
      readyState: v.readyState,
    }
  }, [statsTick, muted, volume])

  // ===========================================================================
  // Render helpers
  // ===========================================================================

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  const timeLabel = showRemaining && duration > 0
    ? `-${formatTime(Math.max(0, duration - displayTime))}`
    : formatTime(displayTime)

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    setMenuPanel('root')
  }, [])

  // Click-away for the settings menu.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.vp-menu') && !t.closest('.vp-menu-trigger')) closeMenu()
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [menuOpen, closeMenu])

  const displayAudioTracks = serverAudioTracks.length > 0 ? serverAudioTracks : audioTracks
  const hasTrackMenus = displayAudioTracks.length > 1 || textTracks.length > 0

  // ===========================================================================
  // JSX
  // ===========================================================================

  return (
    <div
      ref={containerRef}
      className={`vp-root anim-fade${controlsVisible ? '' : ' vp-hide-cursor'}`}
      data-playing={isPlaying}
      onMouseMove={revealControls}
      onPointerMove={revealControls}
    >
      {/* ---- video surface ---- */}
      <div
        className="vp-surface"
        onPointerMove={onSeekHoverNoop}
        onPointerUp={onSurfacePointerUp}
        onWheel={onSurfaceWheel}
      >
        <video
          ref={videoRef}
          className="vp-video"
          src={transcoding ? `/api/transcode?path=${encodeURIComponent(item.path)}&start=${transcodeStart}${activeAudio >= 0 ? `&audio=${activeAudio}` : ''}${videoTonemap ? '&videoTonemap=true' : ''}` : item.src}
          playsInline
          preload="auto"
          crossOrigin="anonymous"
        />
      </div>

      {/* ---- buffering spinner ---- */}
      {waiting && !errored && (
        <div className="vp-spinner" aria-label="Buffering">
          <Loader2 size={54} className="spin" />
        </div>
      )}

      {/* ---- big center ripple play/pause indicator ---- */}
      {osd && (
        <div className="vp-osd" key={osd.id}>
          <div className="vp-osd-inner">
            {osd.kind === 'seek-back' && <RotateCcw size={30} />}
            {osd.kind === 'seek-forward' && <RotateCw size={30} />}
            {osd.kind === 'volume' && <VolumeIcon size={30} />}
            {osd.kind === 'speed' && <Gauge size={30} />}
            {osd.kind === 'info' && <Activity size={30} />}
            <span className="vp-osd-label tabular">{osd.label}</span>
          </div>
        </div>
      )}

      {/* big play ripple when paused (and no error) */}
      {!isPlaying && !waiting && !errored && metaLoaded && (
        <button className="vp-center-play" onClick={togglePlay} aria-label="Play">
          <Play size={38} fill="currentColor" />
        </button>
      )}

      {/* ---- resume toast ---- */}
      {resumeToast && (
        <div className="vp-resume-toast glass">
          <RotateCcw size={15} />
          <span className="tabular">{resumeToast}</span>
        </div>
      )}

      {/* ---- error overlay ---- */}
      {errored && (
        <div className="vp-error">
          <div className="vp-error-card glass">
            <AlertTriangle size={34} className="vp-error-icon" />
            <h3>This video can’t be played here</h3>
            <p>The format may be unsupported (HEVC/MKV).</p>
            <div className="vp-error-actions">
              <button className="btn btn-primary" onClick={handleClose}>
                <ChevronLeft size={16} /> Go back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- top gradient bar ---- */}
      <div className={`vp-top${controlsVisible ? '' : ' vp-chrome-hidden'}`}>
        <button className="vp-iconbtn vp-back" onClick={handleClose} aria-label="Back" title="Back (Esc)">
          <ChevronLeft size={22} />
        </button>
        <div className="vp-title-wrap">
          <span className="vp-title truncate">{title}</span>
          {nextItem && (
            <span className="vp-subtitle truncate">Up next · {prettyTitle(nextItem.name)}</span>
          )}
        </div>
      </div>

      {/* ---- stats for nerds ---- */}
      {showStats && stats && (
        <div className="vp-stats glass">
          <div className="vp-stats-head">
            <Activity size={14} /> <span>Stats for nerds</span>
            <button className="vp-stats-close" onClick={() => setShowStats(false)} aria-label="Close stats">
              <X size={13} />
            </button>
          </div>
          <Stat k="Resolution" v={stats.res} />
          <Stat k="Current time" v={stats.time} />
          <Stat k="Buffer ahead" v={stats.ahead} />
          <Stat k="Playback rate" v={stats.rate} />
          <Stat k="Volume" v={stats.vol} />
          <Stat k="Dropped frames" v={stats.dropped} />
          <Stat k="Ready state" v={String(stats.readyState)} />
        </div>
      )}

      {/* ---- up next card ---- */}
      {upNextActive && nextItem && (
        isSeries ? (
          <button className="vp-next-ep-btn glass" onClick={playNext}>
            <div className="vp-next-ep-info">
              <span className="vp-next-ep-label">Next Episode</span>
              <span className="vp-next-ep-title truncate">{prettyTitle(nextItem.name)}</span>
            </div>
            {upNextCountdown != null ? (
              <div className="vp-next-ep-ring" title="Auto-playing next">
                <svg viewBox="0 0 36 36" width="36" height="36">
                  <circle className="vp-ring-track" cx="18" cy="18" r="15" />
                  <circle
                    className="vp-ring-fill"
                    cx="18"
                    cy="18"
                    r="15"
                    style={{
                      strokeDashoffset: 94.24 * (1 - Math.min(1, upNextCountdown / UP_NEXT_COUNT)),
                    }}
                  />
                </svg>
                <div className="vp-next-ep-num tabular">{upNextCountdown}</div>
              </div>
            ) : (
              <div className="vp-next-ep-icon-wrap">
                <Play size={18} fill="currentColor" />
              </div>
            )}
          </button>
        ) : (
          <div className="vp-upnext glass">
            <div
              className="vp-upnext-poster"
              style={{ background: `hsl(${hueFromString(nextItem.name)} 60% 22%)` }}
            >
              {initials(nextItem.name)}
            </div>
            <div className="vp-upnext-body">
              <span className="vp-upnext-eyebrow">Up next</span>
              <span className="vp-upnext-title truncate">{prettyTitle(nextItem.name)}</span>
              <div className="vp-upnext-actions">
                <button className="btn btn-primary btn-sm" onClick={playNext}>
                  <Play size={14} fill="currentColor" /> Play now
                </button>
              </div>
            </div>
            <div className="vp-upnext-ring" title="Auto-playing next">
              <svg viewBox="0 0 40 40" width="40" height="40">
                <circle className="vp-ring-track" cx="20" cy="20" r="17" />
                <circle
                  className="vp-ring-fill"
                  cx="20"
                  cy="20"
                  r="17"
                  style={{
                    strokeDashoffset:
                      upNextCountdown != null
                        ? 106.8 * (1 - Math.min(1, upNextCountdown / UP_NEXT_COUNT))
                        : 106.8,
                  }}
                />
              </svg>
              <span className="vp-ring-num tabular">{upNextCountdown ?? ''}</span>
            </div>
          </div>
        )
      )}

      {/* ===================== bottom controls scrim ===================== */}
      <div className={`vp-bottom${controlsVisible ? '' : ' vp-chrome-hidden'}`}>
        {/* seek bar */}
        <div className="vp-seek-row">
          <div
            ref={seekBarRef}
            className={`vp-seek${scrubbing ? ' vp-seek-active' : ''}`}
            onPointerDown={onSeekPointerDown}
            onPointerMove={onSeekPointerMove}
            onPointerUp={onSeekPointerUp}
            onPointerLeave={onSeekLeave}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={duration || 0}
            aria-valuenow={displayTime}
            tabIndex={0}
          >
            <div className="vp-seek-track" />
            <div className="vp-seek-buffered" style={{ width: `${bufferedPct}%` }} />
            <div className="vp-seek-fill" style={{ width: `${progressPct}%` }} />
            <div className="vp-seek-thumb" style={{ left: `${progressPct}%` }} />
            {hoverTime != null && (
              <div
                className="vp-seek-tooltip tabular"
                style={{ left: `${Math.min(Math.max(28, hoverX), (seekBarRef.current?.clientWidth ?? 0) - 28)}px` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>
        </div>

        {/* control buttons */}
        <div className="vp-controls">
          <div className="vp-controls-left">
            <button className="vp-iconbtn" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} title="Play/Pause (k)">
              {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
            </button>

            <button className="vp-iconbtn" onClick={() => seekBy(-SEEK_STEP)} aria-label="Back 10 seconds" title="Back 10s (j)">
              <RotateCcw size={19} />
            </button>
            <button className="vp-iconbtn" onClick={() => seekBy(SEEK_STEP)} aria-label="Forward 10 seconds" title="Forward 10s (l)">
              <RotateCw size={19} />
            </button>

            {/* volume cluster */}
            <div
              className={`vp-vol${volExpanded ? ' vp-vol-open' : ''}`}
              onMouseEnter={() => setVolExpanded(true)}
              onMouseLeave={() => setVolExpanded(false)}
            >
              <button className="vp-iconbtn" onClick={toggleMute} aria-label="Mute" title="Mute (m)">
                <VolumeIcon size={21} />
              </button>
              <div
                ref={volumeBarRef}
                className="vp-vol-bar"
                onPointerDown={onVolPointerDown}
                onPointerMove={onVolPointerMove}
                onPointerUp={onVolPointerUp}
                role="slider"
                aria-label="Volume"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((muted ? 0 : volume) * 100)}
              >
                <div className="vp-vol-fill" style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
                <div className="vp-vol-thumb" style={{ left: `${(muted ? 0 : volume) * 100}%` }} />
              </div>
            </div>

            {/* time */}
            <button className="vp-time tabular" onClick={() => setShowRemaining((r) => !r)} title="Toggle remaining time">
              {timeLabel} <span className="vp-time-sep">/</span> {formatTime(duration)}
            </button>
          </div>

          <div className="vp-controls-right">
            {/* captions */}
            {textTracks.length > 0 && (
              <button
                className={`vp-iconbtn${captionsOn ? ' vp-active' : ''}`}
                onClick={toggleCaptions}
                aria-label="Captions"
                title="Captions (c)"
              >
                <Subtitles size={20} />
              </button>
            )}

            {/* pip */}
            {pipSupported && (
              <button
                className={`vp-iconbtn${isPip ? ' vp-active' : ''}`}
                onClick={togglePip}
                aria-label="Picture in picture"
                title="Picture-in-Picture (p)"
              >
                <PictureInPicture2 size={19} />
              </button>
            )}

            {/* screenshot */}
            <button className="vp-iconbtn" onClick={takeScreenshot} aria-label="Screenshot" title="Screenshot (s)">
              <Camera size={19} />
            </button>

            {/* stats */}
            <button
              className={`vp-iconbtn${showStats ? ' vp-active' : ''}`}
              onClick={() => setShowStats((s) => !s)}
              aria-label="Stats for nerds"
              title="Stats for nerds"
            >
              <Activity size={19} />
            </button>

            {/* settings */}
            <div className="vp-menu-anchor">
              <button
                className={`vp-iconbtn vp-menu-trigger${menuOpen ? ' vp-active' : ''}`}
                onClick={() => {
                  setMenuOpen((o) => !o)
                  setMenuPanel('root')
                }}
                aria-label="Settings"
                title="Settings"
              >
                <Settings size={20} className={menuOpen ? 'vp-gear-spin' : ''} />
              </button>

              {menuOpen && (
                <div className="vp-menu glass">
                  {menuPanel === 'root' && (
                    <ul className="vp-menu-list">
                      <li className="vp-menu-item" onClick={() => setMenuPanel('speed')}>
                        <span className="vp-menu-ico"><Gauge size={16} /></span>
                        <span className="vp-menu-key">Playback speed</span>
                        <span className="vp-menu-val">{playbackRate === 1 ? 'Normal' : `${playbackRate}×`}</span>
                      </li>
                      <li
                        className="vp-menu-item"
                        onClick={() => {
                          setLooping((l) => !l)
                        }}
                      >
                        <span className="vp-menu-ico"><Repeat size={16} /></span>
                        <span className="vp-menu-key">Loop</span>
                        <span className="vp-menu-val">{looping ? <Check size={15} /> : 'Off'}</span>
                      </li>
                      <li
                        className="vp-menu-item"
                        onClick={() => {
                          setTranscoding((t) => {
                            const next = !t
                            if (next) setTranscodeStart(latest.current.currentTime)
                            return next
                          })
                        }}
                      >
                        <span className="vp-menu-ico"><AudioLines size={16} /></span>
                        <span className="vp-menu-key">Fix Audio (Transcode)</span>
                        <span className="vp-menu-val">{transcoding ? <Check size={15} /> : 'Off'}</span>
                      </li>
                      <li
                        className="vp-menu-item"
                        onClick={() => {
                          setVideoTonemap((t) => {
                            const next = !t
                            if (next) {
                              setTranscoding(true)
                              setTranscodeStart(latest.current.currentTime)
                            }
                            return next
                          })
                        }}
                      >
                        <span className="vp-menu-ico"><Palette size={16} /></span>
                        <span className="vp-menu-key">Fix Colors (Transcode)</span>
                        <span className="vp-menu-val">{videoTonemap ? <Check size={15} /> : 'Off'}</span>
                      </li>
                      {displayAudioTracks.length > 1 && (
                        <li className="vp-menu-item" onClick={() => setMenuPanel('audio')}>
                          <span className="vp-menu-ico"><AudioLines size={16} /></span>
                          <span className="vp-menu-key">Audio track</span>
                          <span className="vp-menu-val truncate">
                            {displayAudioTracks.find((t) => t.index === activeAudio)?.label ?? 'Default'}
                          </span>
                        </li>
                      )}
                      {textTracks.length > 0 && (
                        <li className="vp-menu-item" onClick={() => setMenuPanel('captions')}>
                          <span className="vp-menu-ico"><Subtitles size={16} /></span>
                          <span className="vp-menu-key">Subtitles</span>
                          <span className="vp-menu-val truncate">
                            {captionsOn
                              ? textTracks.find((t) => t.index === activeCaption)?.label ?? 'On'
                              : 'Off'}
                          </span>
                        </li>
                      )}
                      {!hasTrackMenus && (
                        <li className="vp-menu-note">No alternate audio or subtitle tracks</li>
                      )}
                    </ul>
                  )}

                  {menuPanel === 'speed' && (
                    <ul className="vp-menu-list">
                      <li className="vp-menu-back" onClick={() => setMenuPanel('root')}>
                        <ChevronLeft size={15} /> Playback speed
                      </li>
                      {PLAYBACK_RATES.map((r) => (
                        <li
                          key={r}
                          className="vp-menu-item vp-menu-choice"
                          onClick={() => {
                            changeRate(r)
                            setMenuPanel('root')
                          }}
                        >
                          <span className="vp-menu-check">{r === playbackRate && <Check size={15} />}</span>
                          <span className="vp-menu-key">{r === 1 ? 'Normal' : `${r}×`}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {menuPanel === 'audio' && (
                    <ul className="vp-menu-list">
                      <li className="vp-menu-back" onClick={() => setMenuPanel('root')}>
                        <ChevronLeft size={15} /> Audio track
                      </li>
                      {displayAudioTracks.map((t) => (
                        <li
                          key={t.index}
                          className="vp-menu-item vp-menu-choice"
                          onClick={() => {
                            setAudioTrack(t.index)
                            setMenuPanel('root')
                          }}
                        >
                          <span className="vp-menu-check">{t.index === activeAudio && <Check size={15} />}</span>
                          <span className="vp-menu-key truncate">{t.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {menuPanel === 'captions' && (
                    <ul className="vp-menu-list">
                      <li className="vp-menu-back" onClick={() => setMenuPanel('root')}>
                        <ChevronLeft size={15} /> Subtitles
                      </li>
                      <li
                        className="vp-menu-item vp-menu-choice"
                        onClick={() => {
                          setCaptionTrack(-1)
                          setMenuPanel('root')
                        }}
                      >
                        <span className="vp-menu-check">{!captionsOn && <Check size={15} />}</span>
                        <span className="vp-menu-key">Off</span>
                      </li>
                      {textTracks.map((t) => (
                        <li
                          key={t.index}
                          className="vp-menu-item vp-menu-choice"
                          onClick={() => {
                            setCaptionTrack(t.index)
                            setMenuPanel('root')
                          }}
                        >
                          <span className="vp-menu-check">
                            {captionsOn && t.index === activeCaption && <Check size={15} />}
                          </span>
                          <span className="vp-menu-key truncate">{t.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* fullscreen */}
            <button
              className="vp-iconbtn"
              onClick={toggleFullscreen}
              aria-label="Fullscreen"
              title="Fullscreen (f)"
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Small subcomponents / helpers
// =============================================================================

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="vp-stat-row">
      <span className="vp-stat-k">{k}</span>
      <span className="vp-stat-v tabular">{v}</span>
    </div>
  )
}

// No-op used to keep the surface a pointer target without interfering with the
// dedicated seek-bar hover logic. Inlined as a stable callback below.
function onSeekHoverNoop() {
  /* intentionally empty */
}

// =============================================================================
// Types
// =============================================================================

interface VideoPlayerProps {
  item: PlayableItem
  queue?: PlayableItem[]
  startTime?: number
  autoplayNext?: boolean
  onClose: () => void
  onPlayItem?: (item: PlayableItem) => void
  onProgress?: (path: string, time: number, duration: number) => void
}

// Chromium exposes a non-standard `audioTracks` list on media elements.
interface MediaAudioTrack {
  enabled: boolean
  label: string
  language: string
}
interface MediaAudioTrackList {
  length: number
  [index: number]: MediaAudioTrack
  addEventListener?: (type: string, listener: () => void) => void
  removeEventListener?: (type: string, listener: () => void) => void
}
interface HTMLVideoElementWithAudio extends HTMLVideoElement {
  audioTracks?: MediaAudioTrackList
}
