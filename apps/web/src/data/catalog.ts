import type { Category, CustomExerciseRow, Exercise } from '../lib/types'
import { cdnExercise, type Gender } from './assetCdn'

/** Built-in exercise catalog (ported from the original C.FIT). Custom exercises are merged in from the DB at runtime. */
export const CATALOG: Category[] = [
  {
    key: 'chest',
    title: 'Chest',
    subtitle: 'Press Power / Hypertrophy',
    icon: 'chest',
    exercises: [
      { name: 'Incline Bench Press', img: 'incline-bench-press.png', form: 'Keep elbows at 45 degrees. Drive up efficiently.', target: 'Upper Pectorals' },
      { name: 'Decline Bench Press', img: 'decline-bench-press.png', form: 'Focus on the lower chest sweep.', target: 'Lower Pectorals' },
      { name: 'Pec Fly', img: 'pec-fly.png', form: 'Stretch wide, squeeze at the top without touching weights.', target: 'Inner Chest' },
      { name: 'Flat Bench Press', img: 'flat-bench-press.png', form: 'Arch back slightly, retract scapula.', target: 'Overall Chest' },
    ],
  },
  {
    key: 'triceps',
    title: 'Triceps',
    subtitle: 'Lockout / Arm Push',
    icon: 'triceps',
    exercises: [
      { name: 'Seated Overhead Dumbbell Triceps Extension', img: 'seated-overhead-dumbbell-triceps-extension.png', form: 'Keep elbows tucked in close to ears.', target: 'Long Head Triceps' },
      { name: 'Cable Pushdowns', img: 'cable-pushdowns.png', form: 'Lock elbows by your side. Only forearms move.', target: 'Lateral Head' },
      { name: 'Overhead Cable Triceps Extension', img: 'overhead-cable-triceps-extension.png', form: 'Lean forward slightly, full extension.', target: 'Triceps Stretch' },
    ],
  },
  {
    key: 'back',
    title: 'Back',
    subtitle: 'Pull Power / Width',
    icon: 'back',
    exercises: [
      { name: 'Lat Pulldown', img: 'lat-pulldown.png', form: 'Pull elbows down to hips, not just back.', target: 'Lats Width' },
      { name: 'Seated Cable Row', img: 'seated-cable-row.png', form: 'Keep chest up, squeeze shoulder blades.', target: 'Mid-Back Thickness' },
      { name: 'Dumbbell Row', img: 'dumbbell-row.png', form: 'Support on bench, pull to hip pocket.', target: 'Unilateral Lats' },
      { name: 'T-Bar Rows', img: 't-bar-rows.png', form: 'Maintain neutral spine, heavy compound pull.', target: 'Overall Back' },
    ],
  },
  {
    key: 'biceps',
    title: 'Biceps',
    subtitle: 'Peak / Curl Strength',
    icon: 'biceps',
    exercises: [
      { name: 'Preacher Curl', img: 'preacher-curl.png', form: 'Armpits over the pad, full stretch.', target: 'Bicep Peak' },
      { name: 'Concentration Curl', img: 'concentration-curl.png', form: 'Elbow against inner thigh, isolation.', target: 'Short Head' },
      { name: 'Rope Hammer Curl', img: 'rope-hammer-curl.png', form: 'Neutral grip, pull towards shoulders.', target: 'Brachialis' },
      { name: 'Wrist Curls', img: 'wrist-curls.png', form: 'Rest forearms on your thighs, curl the bar up using only your wrists.', target: 'Forearms' },
    ],
  },
  {
    key: 'shoulders',
    title: 'Shoulders',
    subtitle: '3D Delts / Stability',
    icon: 'shoulders',
    exercises: [
      { name: 'Overhead Shoulder Press', img: 'overhead-shoulder-press.png', form: 'Core tight, press vertically without arching.', target: 'Front Delts' },
      { name: 'Dumbbell Front Raise', img: 'dumbbell-front-raise.png', form: 'Lift to eye level, control descent.', target: 'Anterior Delts' },
      { name: 'Dumbbell Lateral Raise', img: 'dumbbell-lateral-raise.png', form: 'Lead with elbows, pour the pitcher.', target: 'Side Delts' },
      { name: 'Shrugs', img: 'shrugs.png', form: 'Lift shoulders to ears, pause at top.', target: 'Traps' },
      { name: 'Reverse Pec Deck', img: 'reverse-pec-deck.png', form: 'Drive arms back using rear delts only.', target: 'Rear Delts' },
      { name: 'Upright Row', img: 'upright-row.png', form: 'Wide grip to protect rotator cuff.', target: 'Side Delts/Traps' },
      { name: 'Rope Face Pull', img: 'rope-face-pull.png', form: 'Pull to forehead, external rotation.', target: 'Rear Delts/Rotators' },
    ],
  },
  {
    key: 'legs',
    title: 'Legs',
    subtitle: 'Foundation / Power',
    icon: 'legs',
    exercises: [
      { name: 'Seated Leg Curl', img: 'seated-leg-curl.png', form: 'Lock hips into seat, curl fully.', target: 'Hamstrings' },
      { name: 'Adductor and Abductor', img: 'adductor-and-abductor.png', form: 'Control the negative, do not swing.', target: 'Hips/Inner Thigh' },
      { name: 'Barbell Squats', img: 'barbell-squats.png', form: 'Knees out, chest up, break parallel.', target: 'Quads/Glutes' },
      { name: 'Seated Leg Extension', img: 'seated-leg-extension.png', form: 'Squeeze quads hard at the top.', target: 'Quads Isolation' },
      { name: 'Dumbbell Romanian Deadlift', img: 'dumbbell-romanian-deadlift.png', form: 'Hinge at hips, slight knee bend.', target: 'Hamstrings/Glutes' },
      { name: 'Seated Calf Raise Machine', img: 'seated-calf-raise-machine.png', form: 'Full range of motion, pause at bottom.', target: 'Calves' },
    ],
  },
  {
    key: 'abs',
    title: 'Abs & Core',
    subtitle: 'Stability / Definition',
    icon: 'abs',
    exercises: [
      { name: 'Plank Shoulder Tap', img: 'plank-shoulder-tap.png', form: 'Anti-rotation, keep hips still.', target: 'Core Stability', mode: 'timed' },
      { name: 'Leg Raises', img: 'leg-raises.png', form: 'Lower back glued to floor/bench.', target: 'Lower Abs' },
      { name: 'Crunches', img: 'crunches.png', form: 'Exhale sharply on contraction.', target: 'Upper Abs' },
      { name: 'Bicycle Crunches', img: 'bicycle-crunches.png', form: 'Elbow to opposite knee, slow tempo.', target: 'Obliques' },
      { name: 'Mountain Climbers', img: 'mountain-climbers.png', form: 'Drive knees to chest, keep rhythm.', target: 'Core/Cardio' },
      { name: 'Seated Knee Tucks', img: 'seated-knee-tucks.png', form: 'Balance on glutes, bring knees in.', target: 'Rectus Abdominis' },
    ],
  },
  {
    key: 'cardio',
    title: 'Cardio',
    subtitle: 'Endurance / Heart Health',
    icon: 'cardio',
    exercises: [
      { name: 'Elliptical', img: 'elliptical.png', form: 'Maintain steady RPM, use handles for upper body.', target: 'Full Body Endurance', mode: 'distance' },
    ],
  },
]

export const CATALOG_BY_KEY: Record<string, Category> = Object.fromEntries(CATALOG.map((c) => [c.key, c]))

export function imgPath(categoryKey: string, img: string, gender: Gender = 'male'): string {
  // Served from the CDN, not from /public — see ./assetCdn. The transparent PNGs are used
  // as-is (they composite cleanly on a black surface); the service worker keeps each one in
  // Cache Storage after the first fetch, so this costs the network once per device.
  return cdnExercise(categoryKey, img, gender)
}

/** Built-in catalog with the user's custom exercises appended to each category. */
export function mergeCustom(custom: CustomExerciseRow[]): Category[] {
  return CATALOG.map((c) => {
    const extra: Exercise[] = custom
      .filter((x) => x.category_key === c.key)
      .map((x) => ({
        name: x.name,
        img: '',
        form: x.form ?? '',
        target: x.target ?? 'Custom',
        customId: x.id,
        // absolute URL, not a CDN filename — see the note on Exercise.imageUrl
        imageUrl: x.image_url ?? undefined,
        videoUrl: x.video_url ?? undefined,
        tips: x.tips ?? undefined,
        mode: x.mode ?? undefined,
      }))
    return extra.length ? { ...c, exercises: [...c.exercises, ...extra] } : c
  })
}

/**
 * Image URL for an exercise, built-in or custom.
 *
 * Built-ins resolve a filename against the CDN category folder; a custom exercise carries an
 * absolute Supabase Storage URL instead. Pass `custom` so user-added exercises resolve too —
 * without it this only ever searched CATALOG and always returned null for them, which is why
 * an uploaded photo never showed up.
 */
export function exerciseImage(name: string, custom: CustomExerciseRow[] = [], gender: Gender = 'male'): string | null {
  for (const c of CATALOG) {
    const e = c.exercises.find((x) => x.name === name)
    if (e && e.img) return imgPath(c.key, e.img, gender)
  }
  const own = custom.find((x) => x.name === name)
  return own?.image_url || null
}

/** Resolved image for an already-merged Exercise, preferring an uploaded photo. */
export function exerciseSrc(categoryKey: string, e: Exercise, gender: Gender = 'male'): string | null {
  if (e.imageUrl) return e.imageUrl
  return e.img ? imgPath(categoryKey, e.img, gender) : null
}

/** YouTube demo attached to an exercise, built-in or custom. */
export function exerciseVideoUrl(name: string, custom: CustomExerciseRow[] = []): string | null {
  const own = custom.find((x) => x.name === name)
  if (own?.video_url) return own.video_url
  return EXERCISE_VIDEO[name] || null
}

/** Logging mode for a built-in exercise (custom exercises are always rep-based). */
export function exerciseMode(name: string): 'reps' | 'timed' | 'distance' {
  for (const c of CATALOG) {
    const e = c.exercises.find((x) => x.name === name)
    if (e) return e.mode ?? 'reps'
  }
  return 'reps'
}

/** Coaching tips per exercise (shown in the exercise detail sheet). */
export const EXERCISE_TIPS: Record<string, string[]> = {
  'Incline Bench Press': ['Set the bench near 30° — steeper shifts the load to the front delts.', 'Lower the bar to just below your collarbone under control.', 'Keep your shoulder blades pinned back and feet planted.'],
  'Decline Bench Press': ['Lock your legs in and keep a slight arch to protect the shoulders.', 'Lower the bar to the lower-chest line, not the sternum.', 'Press up and slightly back over the shoulders.'],
  'Pec Fly': ['Keep a soft, fixed bend in the elbows — don’t press.', 'Feel a deep chest stretch at the bottom, then squeeze.', 'Stop just short of the weights touching to keep tension on the pecs.'],
  'Flat Bench Press': ['Retract and depress your scapula before you unrack.', 'Keep wrists stacked over elbows and the bar over mid-chest.', 'Drive your feet into the floor and keep your glutes down.'],
  'Seated Overhead Dumbbell Triceps Extension': ['Keep your elbows tucked and pointing forward, not flaring.', 'Lower until you feel a full stretch in the long head.', 'Keep your ribs down — don’t arch to heave the weight up.'],
  'Cable Pushdowns': ['Pin your elbows to your sides and move only the forearms.', 'Lean in slightly and keep your torso still.', 'Squeeze hard at full extension, then control the negative.'],
  'Overhead Cable Triceps Extension': ['Step out so there’s constant tension at the stretch.', 'Keep your upper arms fixed beside your head.', 'Fully extend without shrugging your shoulders up.'],
  'Lat Pulldown': ['Pull your elbows down toward your hips, not just back.', 'Lead with your chest up; avoid leaning back too far.', 'Control the bar all the way up for a full lat stretch.'],
  'Seated Cable Row': ['Keep your chest tall and pull to your lower ribs.', 'Squeeze your shoulder blades together at the end.', 'Don’t round your lower back on the return.'],
  'Dumbbell Row': ['Keep your torso near parallel and supported.', 'Pull the dumbbell to your hip pocket, not your armpit.', 'Keep your hips square — don’t twist for extra range.'],
  'T-Bar Rows': ['Hinge at the hips with a flat, braced spine.', 'Drive your elbows back and squeeze the mid-back.', 'Let the weight stretch the lats fully at the bottom.'],
  'Preacher Curl': ['Keep your armpits pressed into the pad the whole set.', 'Don’t fully lock out at the bottom — keep tension on the biceps.', 'Resist the stretch and control the negative.'],
  'Concentration Curl': ['Brace your elbow against your inner thigh.', 'Turn the pinky slightly up to peak the biceps.', 'Pause and squeeze hard at the top.'],
  'Rope Hammer Curl': ['Keep a neutral grip and elbows fixed at your sides.', 'Curl toward your shoulders and squeeze the forearms.', 'Lower slowly — no swinging from the shoulders.'],
  'Wrist Curls': ['Rest your forearms flat on your thighs, wrists just past your knees.', 'Curl the bar up using only your wrists — forearms stay still.', 'Lower under control for a full stretch before curling again.'],
  'Overhead Shoulder Press': ['Brace your core and glutes to avoid arching your back.', 'Press in a straight line, stacking the weight over your shoulders.', 'Keep your forearms vertical throughout.'],
  'Dumbbell Front Raise': ['Raise to about eye level, no higher.', 'Keep a slight elbow bend and control the descent.', 'Avoid using momentum from the hips.'],
  'Dumbbell Lateral Raise': ['Lead with your elbows, like pouring a pitcher.', 'Raise to shoulder height with pinkies slightly higher.', 'Keep the traps relaxed — think wide, not up.'],
  'Shrugs': ['Lift straight up toward your ears and pause at the top.', 'Go straight up and down — don’t roll the shoulders.', 'Control the lowering through a full range.'],
  'Reverse Pec Deck': ['Drive the arms back with the rear delts, not the traps.', 'Keep a slight elbow bend and squeeze at the back.', 'Move smoothly — no jerking.'],
  'Upright Row': ['Use a wider grip to protect the shoulders.', 'Pull to about chest height with your elbows leading.', 'Stop if you feel any shoulder pinch.'],
  'Rope Face Pull': ['Pull toward your forehead, splitting the rope ends apart.', 'Externally rotate so your knuckles face back at the end.', 'Keep your elbows high throughout.'],
  'Seated Leg Curl': ['Lock your hips into the seat with the pad tight.', 'Curl fully and squeeze the hamstrings at the bottom.', 'Control the negative — don’t let it snap back.'],
  'Adductor and Abductor': ['Control both the squeeze and the stretch — no swinging.', 'Keep your torso upright and back against the pad.', 'Pause briefly at the end range for extra tension.'],
  'Barbell Squats': ['Brace your core hard and keep your chest up.', 'Push your knees out in line with your toes.', 'Break parallel while keeping a neutral spine.'],
  'Seated Leg Extension': ['Squeeze the quads with a one-second hold at the top.', 'Control the lowering; don’t let it drop.', 'Keep your back flat against the pad.'],
  'Dumbbell Romanian Deadlift': ['Hinge at the hips with a soft knee bend.', 'Keep the dumbbells close and your back flat.', 'Feel the hamstring stretch, then drive the hips forward.'],
  'Seated Calf Raise Machine': ['Use a full range with a deep stretch at the bottom.', 'Pause at the top and bottom for a beat.', 'Don’t bounce — keep the tempo controlled.'],
  'Plank Shoulder Tap': ['Keep your hips still and resist the rotation.', 'Set hands under shoulders and feet wide for balance.', 'Brace your core and breathe steadily.'],
  'Leg Raises': ['Keep your lower back pressed to the floor.', 'Lower your legs slowly and stop before your back arches.', 'Exhale as you lift for a stronger contraction.'],
  'Crunches': ['Curl your ribs toward your hips — don’t pull your neck.', 'Exhale sharply at the top and squeeze the abs.', 'Move slowly; quality over quantity.'],
  'Bicycle Crunches': ['Bring your elbow to the opposite knee with a slow tempo.', 'Fully extend the straight leg without dropping it.', 'Rotate from the torso, not just the arms.'],
  'Mountain Climbers': ['Keep your hips low and level — no piking up.', 'Drive the knees toward your chest with rhythm.', 'Keep your shoulders stacked over your hands.'],
  'Seated Knee Tucks': ['Balance on your glutes and lean back slightly.', 'Draw the knees in and crunch, then extend fully.', 'Keep the movement controlled — don’t rush.'],
  'Elliptical': ['Hold a steady RPM and use the handles to involve the upper body.', 'Keep your posture tall — don’t hunch on the console.', 'Vary resistance or incline for intervals to boost conditioning.'],
}

export function exerciseTips(name: string): string[] {
  return EXERCISE_TIPS[name] ?? []
}

/**
 * Per-exercise tutorial video links. Placeholder for now — replace a value with a real
 * YouTube URL, e.g. 'Incline Bench Press': 'https://youtu.be/...'. Unmapped names fall back
 * to youtube.com.
 */
export const EXERCISE_VIDEO: Record<string, string> = {}

export function exerciseVideo(name: string): string {
  return EXERCISE_VIDEO[name] ?? 'https://www.youtube.com'
}

/** Find which category an exercise (by name) belongs to. */
export function categoryOf(exerciseName: string, custom: CustomExerciseRow[] = []): Category | undefined {
  const hit = CATALOG.find((c) => c.exercises.some((e) => e.name === exerciseName))
  if (hit) return hit
  const cx = custom.find((x) => x.name === exerciseName)
  return cx ? CATALOG_BY_KEY[cx.category_key] : undefined
}
