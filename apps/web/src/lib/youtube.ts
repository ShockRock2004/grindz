/**
 * YouTube demo links.
 *
 * Kept as a tiny module rather than inline regex because three surfaces need the same
 * answer: the form that validates what the user pastes, the web card that embeds it, and the
 * native app that hands a URL to the YouTube app.
 *
 * Accepts every shape a person actually pastes — watch links, share links, Shorts, embeds,
 * and links carrying a playlist or a `t=` timestamp — and normalises to the 11-character
 * video id, which is the only part worth storing.
 */

const PATTERNS: RegExp[] = [
  /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})/,
  /youtu\.be\/([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com|youtube-nocookie\.com)\/shorts\/([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com|youtube-nocookie\.com)\/live\/([A-Za-z0-9_-]{11})/,
]

/** The 11-char video id, or null if this is not a YouTube link. */
export function youTubeId(url: string): string | null {
  const s = url.trim()
  if (!s) return null
  // a bare id, which is what someone pastes out of a previous save
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  for (const re of PATTERNS) {
    const m = s.match(re)
    if (m) return m[1]
  }
  return null
}

/** Seconds into the video, from `t=90`, `t=1m30s` or `start=90`. */
export function youTubeStart(url: string): number {
  const m = url.match(/[?&](?:t|start)=([0-9hms]+)/i)
  if (!m) return 0
  const raw = m[1]
  if (/^\d+$/.test(raw)) return Number(raw)
  const h = Number(raw.match(/(\d+)h/i)?.[1] ?? 0)
  const min = Number(raw.match(/(\d+)m/i)?.[1] ?? 0)
  const sec = Number(raw.match(/(\d+)s/i)?.[1] ?? 0)
  return h * 3600 + min * 60 + sec
}

/**
 * Privacy-enhanced embed URL. `youtube-nocookie.com` does not set tracking cookies until the
 * user actually presses play, which matters because this iframe sits on a page people open
 * every day.
 */
export function youTubeEmbed(url: string): string | null {
  const id = youTubeId(url)
  if (!id) return null
  const start = youTubeStart(url)
  const q = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' })
  if (start > 0) q.set('start', String(start))
  return `https://www.youtube-nocookie.com/embed/${id}?${q}`
}

/** Canonical watch URL — what the native app hands to the YouTube app. */
export function youTubeWatch(url: string): string | null {
  const id = youTubeId(url)
  if (!id) return null
  const start = youTubeStart(url)
  return `https://www.youtube.com/watch?v=${id}${start > 0 ? `&t=${start}` : ''}`
}

export function youTubeThumb(url: string): string | null {
  const id = youTubeId(url)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}
