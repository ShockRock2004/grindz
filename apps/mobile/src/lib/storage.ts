/**
 * Image uploads for custom exercises — React Native side.
 *
 * Mirrors apps/web/src/lib/storage.ts in behaviour and in bucket layout, but not in
 * implementation: there is no `File`, no `createImageBitmap` and no `<canvas>` here, so the
 * resize happens in expo-image-manipulator terms via the picker's own `quality` setting and
 * the base64 payload the picker returns.
 *
 * **This replaces storing a base64 data URI in the database column.** That is what the app
 * did before, and it was wrong in three ways: a 1–2 MB string in a Postgres text column
 * bloats every read of that row, it is re-sent in full to every user the exercise is shared
 * with, and it eventually trips row-size limits. The image belongs in object storage with a
 * URL in the column.
 *
 * Requires the `exercise-images` bucket — see docs/SUPABASE-MIGRATION.md. Fails soft: if the
 * upload cannot complete, the caller still saves the exercise without a picture.
 */
import { supabase } from './supabase'

export const BUCKET = 'exercise-images'
export const MAX_BYTES = 5 * 1024 * 1024

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
 * base64 -> bytes.
 *
 * Hermes has no `atob` and no Node `Buffer`, and pulling a dependency in for one function
 * would cost an ABI-multiplied native footprint for nothing (see docs/BUILD.md on weighing
 * modules by ABI count). This is the standard 4-chars-to-3-bytes decode.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '')
  const pad = input.endsWith('==') ? 2 : input.endsWith('=') ? 1 : 0
  const out = new Uint8Array((clean.length * 3) / 4 - pad)
  let p = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      (B64.indexOf(clean[i + 2]) << 6) |
      B64.indexOf(clean[i + 3])
    if (p < out.length) out[p++] = (n >> 16) & 255
    if (p < out.length) out[p++] = (n >> 8) & 255
    if (p < out.length) out[p++] = n & 255
  }
  return out
}

/**
 * Uploads a picked image and returns a public URL.
 *
 * `base64` is what expo-image-picker returns when `base64: true`; `mime` comes from the
 * asset. Both are already size-checked by the caller before we get here.
 */
export async function uploadExerciseImage(
  base64: string,
  exerciseName: string,
  mime = 'image/jpeg',
): Promise<UploadResult> {
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user?.id
  if (!user) return { url: null, error: 'Sign in again to upload an image.' }

  const bytes = decodeBase64(base64)
  if (bytes.byteLength > MAX_BYTES) {
    return { url: null, error: `That image is ${(bytes.byteLength / 1048576).toFixed(1)} MB — the limit is 5 MB.` }
  }

  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
  const path = `${user}/${Date.now()}-${slug(exerciseName)}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) {
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
