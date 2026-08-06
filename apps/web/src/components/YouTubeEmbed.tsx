/**
 * Click-to-play YouTube demo.
 *
 * The iframe is not mounted until the user asks for it. That is deliberate on three counts:
 * a YouTube embed pulls roughly a megabyte of player before anyone presses play; it sets
 * third-party cookies on load; and this sits inside a dialog people open just to read a form
 * cue. Until clicked it is only a thumbnail — one image request.
 *
 * `youtube-nocookie.com` is used for the same reason, and `autoplay=1` is safe here precisely
 * because mounting is already a user gesture.
 */
import { useState } from 'react'
import { youTubeEmbed, youTubeThumb, youTubeWatch } from '../lib/youtube'
import { IconPlay } from './Icons'

export function YouTubeEmbed({ url, title }: { url: string; title: string }) {
  const [playing, setPlaying] = useState(false)
  const embed = youTubeEmbed(url)
  const thumb = youTubeThumb(url)
  const watch = youTubeWatch(url)
  if (!embed) return null

  if (playing) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <iframe
          src={`${embed}&autoplay=1`}
          title={`${title} — demo video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      aria-label={`Play the ${title} demo video`}
      className="group relative block aspect-video w-full overflow-hidden rounded-2xl bg-black"
    >
      {thumb && (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
        />
      )}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-cyan text-cyan-ink shadow-glow transition group-hover:scale-105">
          <IconPlay size={24} />
        </span>
      </span>
      <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white/80 backdrop-blur">
        YouTube
      </span>
      {/*
        A plain link alongside the player, because an embed can be blocked by the uploader,
        by an extension, or by a corporate network — and then the only demo is unreachable.
      */}
      <span className="sr-only">{watch}</span>
    </button>
  )
}
