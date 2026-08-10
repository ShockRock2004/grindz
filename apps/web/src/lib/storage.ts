/**
 * Image uploads for custom exercises.
 *
 * **Why not the Cloudflare CDN.** The exercise photo library is served from
 * the image CDN, which is a *static* Workers deploy built from a Git repository. It has no
 * upload endpoint, no write credentials, and nothing an app could POST to — adding a file
 * means committing it and redeploying. So it is the right home for the 43 curated photos that
 * ship with the app, and the wrong home for something a user picks on their phone.
 *
 * Supabase Storage is used instead: it is already in the stack, it authenticates with the
 * session the user already has, and a public bucket serves over a CDN of its own.
 *
 * Requires the `exercise-images` bucket — see docs/SUPABASE-MIGRATION.md. Everything here
 * fails soft: if the bucket is missing, the caller gets a message and can still save the
 * exercise without a picture.
 */
import { supabase } from './supabase'
import { DEV_BYPASS } from './dev-auth'

export const BUCKET = 'exercise-images'
export const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Downscale target, and why it is this number.
 *
 * The largest an exercise photo is ever drawn is the detail modal: `max-w-lg` (512 CSS px)
 * with the image at `w-4/5`, so ~410 CSS px. On a 3x phone that is ~1230 device px. 1600
 * clears that with headroom for the full-width grid on a large monitor, and leaves room for
 * a bigger presentation later without re-uploading anything.
 *
 * Measured on a synthetic 4000x3000 photo, then scaled by the 2.7x gap between that test
 * image and the real library average (93 KB at the old 1200/0.86 settings):
 *
 *   1200px q0.86   ~93 KB    the previous setting
 *   1600px q0.92  ~212 KB    this one
 *   2048px q0.92  ~476 KB    past anything the UI displays
 *
 * At ~212 KB the 1 GB free tier still holds roughly 4,900 photos, which is far more than
 * this app will produce. Going higher buys resolution nothing renders.
 */
const MAX_EDGE = 1600

/**
 * WebP quality. 0.92 is the point where re-encoding stops being visible on photographic
 * content; 0.86 was leaving detail on the table for a saving that does not matter here.
 * Above ~0.95 the file grows steeply for no perceptible gain.
 */
const WEBP_QUALITY = 0.92

/**
 * Below this, an already-small image is uploaded untouched rather than re-encoded.
 *
 * Re-encoding is lossy even when it does not resize, so a small photo that is already well
 * compressed should be left alone — a second pass would only throw away detail. Raised
 * alongside the quality bump: at the old 900 KB an image could be re-encoded purely because
 * it was slightly over, which was the one case where this function reliably lost quality
 * for nothing.
 */
const SKIP_REENCODE_BYTES = 1_500_000

export interface UploadResult {
  url: string | null
  error: string | null
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'exercise'
  )
}

/**
 * Downscale before upload.
 *
 * A modern phone photo is 3–8 MB and 4000px wide; it is displayed here in a card no wider
 * than ~400px. Uploading the original wastes the user's data, their storage quota, and every
 * later view's bandwidth. Canvas re-encode to a bounded long edge fixes all three, and drops
 * EXIF — including GPS — as a side effect, which is the right default for a photo taken in a
 * gym and shared with every other user.
 */
async function shrink(file: File, maxEdge = MAX_EDGE): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size < SKIP_REENCODE_BYTES) {
    // already small enough to display and small enough to store — a re-encode here would
    // only be a second lossy pass over an image nothing is wrong with
    bitmap.close()
    return file
  }
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', WEBP_QUALITY))
  // if the re-encode somehow grew the file, keep the original — that means the source was
  // already more efficiently encoded than we can manage, so ours would be strictly worse
  return blob && blob.size < file.size ? blob : file
}

export function validateImage(file: File): string | null {
  if (!TYPES.includes(file.type)) return 'That has to be a JPEG, PNG or WebP image.'
  if (file.size > MAX_BYTES) return `That image is ${(file.size / 1048576).toFixed(1)} MB — the limit is 5 MB.`
  return null
}

/** Uploads and returns a public URL, or an explanation of why it could not. */
export async function uploadExerciseImage(file: File, exerciseName: string): Promise<UploadResult> {
  const bad = validateImage(file)
  if (bad) return { url: null, error: bad }

  // the dev bypass has no Supabase session; a blob URL keeps the flow testable end to end
  if (DEV_BYPASS) return { url: URL.createObjectURL(file), error: null }

  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user?.id
  if (!user) return { url: null, error: 'Sign in again to upload an image.' }

  const body = await shrink(file)
  const ext = body.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${user}/${Date.now()}-${slug(exerciseName)}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: body.type || file.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) {
    // the single most likely cause is the bucket not existing yet, so say that plainly
    const missing = /bucket/i.test(error.message) && /not found|does not exist/i.test(error.message)
    return {
      url: null,
      error: missing
        ? 'Image storage is not set up on this project yet — the exercise will save without a photo.'
        : `Could not upload that image (${error.message}).`,
    }
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, error: null }
}
