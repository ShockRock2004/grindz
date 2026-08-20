/**
 * Which muscles each exercise actually works.
 *
 * The body map used to light by *category*: a bench press lit the pecs and nothing
 * else, even though it works the triceps and front delts hard, and a lat pulldown lit
 * only "back" — despite the reference artwork the map was traced from being a lat
 * pulldown diagram showing lats primary with biceps, forearms and traps secondary.
 *
 * This table drives `intensityOf` (see bodyMuscles.ts), which resolves most-specific
 * first: muscle id → group → category. Keys here are muscle *group* ids, so both
 * sides light together.
 *
 * Anything not listed falls back to its category, which is what keeps custom
 * exercises working.
 */
import type { MuscleIntensity } from './bodyMuscles'
import { categoryOf } from './catalog'
import type { CustomExerciseRow } from '../lib/types'

/*
 * Cross-view aliases.
 *
 * The front and back sheets were traced independently, so the same anatomical muscle
 * can carry a different group id on each: the triceps is `triceps_lateral_head` at the
 * front and `triceps_brachii` at the back. Naming one id would light half the body and
 * look like a bug, so every muscle that appears on both sheets is aliased here.
 *
 * The female sheet (bodyMusclesFemale.ts) adds a second reason for an alias to exist:
 * its source art doesn't sub-divide a few regions the male sheet does (one traced
 * forearm shape per view rather than three separate muscles, one merged back-of-thigh
 * area rather than two). Where the female geometry stayed genuinely distinct — deltoid,
 * quads, hamstrings — it got renamed to match the male id directly (see
 * scripts/trace/labels-female.py) rather than aliased here, because those really are
 * separate shapes and deserve separate ids. `forearm` and the extra `trapezius_upper`
 * below are the two cases where female traces ONE shape for what the male sheet
 * separates, so the alias has to point multiple male-side names at that one female id.
 */
const TRICEPS = ['triceps_lateral_head', 'triceps_brachii']
const FOREARMS = ['brachioradialis', 'wrist_flexors', 'extensor_carpi_ulnaris', 'forearm']
const CALVES = ['gastrocnemius', 'gastrocnemius_lateral', 'gastrocnemius_medial', 'soleus']
const QUADS = ['rectus_femoris', 'vastus_lateralis', 'vastus_medialis']
const HAMSTRINGS = ['biceps_femoris', 'semitendinosus']
const ABS = ['rectus_abdominis_upper', 'rectus_abdominis_middle', 'rectus_abdominis_lower']
const LATS = ['latissimus_dorsi']
// female's back sheet traces one combined trap shape (see labels-female.py) rather than
// splitting upper from middle/lower the way the male sheet does, so 'trapezius_upper' is
// added here too — on the male map it is a no-op (that shape already lights via its own
// direct references elsewhere), on the female map it is what makes a row or a face pull
// light the only back/shoulder shape that exists there.
const UPPER_BACK = ['trapezius_middle_lower', 'infraspinatus_teres_major', 'trapezius_upper']
// There is deliberately no deltoid fallback here any more. The female front sheet used to
// have no deltoid shape at all — the shoulder caps were folded into trapezius_upper by the
// tracer — so a press or a raise had nothing to light, and 'trapezius_upper' was promoted
// to PRIMARY on four exercises to cover for it. That made a lateral raise claim the upper
// trap as a prime mover on both sheets to paper over a gap on one of them. The female
// sheet now traces anterior_deltoid and lateral_deltoid as their own shapes
// (see scripts/trace/labels-female.py), so the exercises below name the muscle they
// actually work and nothing else.

export interface MuscleWork {
  primary: string[]
  secondary: string[]
}

/**
 * Keyed by the exercise name exactly as it appears in the catalogue.
 *
 * A mutable binding, not a `const` — on mobile, `catalogSync.ts` replaces it at runtime with
 * whatever `gen-catalog-json.mts` most recently generated, via `applyLiveMuscles` below, so a
 * new exercise's muscle work shows up without a new APK. The web app never calls that setter
 * and always reads this literal; `let` costs it nothing; see check-parity.mjs, which keeps
 * this file byte-identical between the two apps specifically so "what muscles does X train"
 * can never mean something different on one surface than the other.
 */
export let EXERCISE_MUSCLES: Record<string, MuscleWork> = {
  /* ---------------------------------------------------------------- chest */
  'Incline Bench Press': { primary: ['pectoralis_major', 'anterior_deltoid'], secondary: TRICEPS },
  'Decline Bench Press': { primary: ['pectoralis_major'], secondary: [...TRICEPS, 'anterior_deltoid'] },
  'Pec Fly': { primary: ['pectoralis_major'], secondary: ['anterior_deltoid'] },
  'Flat Bench Press': { primary: ['pectoralis_major'], secondary: [...TRICEPS, 'anterior_deltoid'] },

  /* -------------------------------------------------------------- triceps */
  'Seated Overhead Dumbbell Triceps Extension': { primary: TRICEPS, secondary: ['posterior_deltoid'] },
  'Cable Pushdowns': { primary: TRICEPS, secondary: ['extensor_carpi_ulnaris', 'forearm'] },
  'Overhead Cable Triceps Extension': { primary: TRICEPS, secondary: ['posterior_deltoid'] },

  /* ----------------------------------------------------------------- back */
  // this is the reference artwork's own exercise — lats primary, arms and traps secondary
  'Lat Pulldown': {
    primary: LATS,
    secondary: [...UPPER_BACK, 'trapezius_upper', 'biceps_brachii', ...FOREARMS, 'posterior_deltoid'],
  },
  'Seated Cable Row': {
    primary: [...LATS, ...UPPER_BACK],
    secondary: ['biceps_brachii', ...FOREARMS, 'posterior_deltoid', 'erector_spinae'],
  },
  'Dumbbell Row': {
    primary: [...LATS, 'trapezius_middle_lower'],
    secondary: ['biceps_brachii', ...FOREARMS, 'posterior_deltoid', 'infraspinatus_teres_major'],
  },
  'T-Bar Rows': {
    primary: [...LATS, ...UPPER_BACK],
    secondary: ['biceps_brachii', ...FOREARMS, 'erector_spinae', 'posterior_deltoid'],
  },

  /* --------------------------------------------------------------- biceps */
  'Preacher Curl': { primary: ['biceps_brachii'], secondary: FOREARMS },
  'Concentration Curl': { primary: ['biceps_brachii'], secondary: ['brachioradialis', 'forearm'] },
  // brachioradialis is the point of a hammer curl, so it (and its female id, 'forearm')
  // are primary here and must not also appear in the FOREARMS spread below
  'Rope Hammer Curl': { primary: ['biceps_brachii', 'brachioradialis', 'forearm'], secondary: ['wrist_flexors', 'extensor_carpi_ulnaris'] },
  'Wrist Curls': { primary: FOREARMS, secondary: [] },

  /* ------------------------------------------------------------ shoulders */
  'Overhead Shoulder Press': {
    primary: ['anterior_deltoid', 'lateral_deltoid'],
    secondary: TRICEPS,
  },
  'Dumbbell Front Raise': {
    primary: ['anterior_deltoid'],
    secondary: ['lateral_deltoid'],
  },
  'Dumbbell Lateral Raise': {
    primary: ['lateral_deltoid'],
    secondary: ['anterior_deltoid'],
  },
  'Shrugs': { primary: ['trapezius_upper'], secondary: ['trapezius_middle_lower', ...FOREARMS] },
  'Reverse Pec Deck': { primary: ['posterior_deltoid'], secondary: UPPER_BACK },
  'Upright Row': { primary: ['lateral_deltoid', 'trapezius_upper'], secondary: ['biceps_brachii', ...FOREARMS] },
  'Rope Face Pull': {
    primary: ['posterior_deltoid', 'infraspinatus_teres_major'],
    secondary: ['trapezius_middle_lower', 'trapezius_upper'],
  },

  /* ----------------------------------------------------------------- legs */
  'Seated Leg Curl': { primary: HAMSTRINGS, secondary: CALVES },
  'Adductor and Abductor': {
    // 'adductors' is the female sheet's one traced inner-thigh shape (see
    // labels-female.py) — no equivalent to pectineus/tensor_fasciae_latae/sartorius
    // individually, so it's the female target for this whole exercise, not just an alias
    primary: ['pectineus', 'tensor_fasciae_latae', 'adductors'],
    secondary: ['gluteus_maximus', 'sartorius'],
  },
  'Barbell Squats': {
    // gluteus_medius has no male-sheet equivalent (that map doesn't trace it separately)
    // so it is only ever reached through an exercise that names it directly, not an
    // alias — real anatomy either way, a squat's hip stabiliser
    primary: [...QUADS, 'gluteus_maximus'],
    secondary: [...HAMSTRINGS, 'erector_spinae', ...CALVES, 'gluteus_medius'],
  },
  // 'adductors' is the female id for tensor_fasciae_latae too — see the note on
  // 'Adductor and Abductor' above
  'Seated Leg Extension': { primary: QUADS, secondary: ['tensor_fasciae_latae', 'adductors'] },
  'Dumbbell Romanian Deadlift': {
    primary: [...HAMSTRINGS, 'gluteus_maximus'],
    secondary: ['erector_spinae', 'trapezius_upper', ...FOREARMS, 'gluteus_medius'],
  },
  'Seated Calf Raise Machine': { primary: CALVES, secondary: [] },
  // a knee-flexion hamstring lift done with the hips locked out, so the glutes and the
  // spinal erectors hold that line rather than move the load — secondary, not primary
  'Nordic Hamstring Curl': {
    primary: HAMSTRINGS,
    secondary: ['gluteus_maximus', 'erector_spinae', ...CALVES],
  },
  'Pistol Squat': {
    primary: [...QUADS, 'gluteus_maximus'],
    secondary: [...HAMSTRINGS, ...CALVES, 'gluteus_medius', 'tibialis_anterior', 'erector_spinae'],
  },

  /* ------------------------------------------------------------------ abs */
  'Plank Shoulder Tap': {
    primary: [...ABS, 'external_oblique'],
    secondary: ['anterior_deltoid', 'serratus_anterior'],
  },
  'Leg Raises': {
    primary: ['rectus_abdominis_lower'],
    secondary: ['rectus_abdominis_middle', 'tensor_fasciae_latae'],
  },
  'Crunches': { primary: ['rectus_abdominis_upper'], secondary: ['rectus_abdominis_middle'] },
  'Bicycle Crunches': {
    primary: ['external_oblique', 'rectus_abdominis_middle'],
    secondary: ['rectus_abdominis_lower', 'rectus_abdominis_upper'],
  },
  'Mountain Climbers': {
    primary: ['rectus_abdominis_middle', 'rectus_abdominis_lower', 'external_oblique'],
    secondary: ['anterior_deltoid', 'serratus_anterior', 'rectus_femoris'],
  },
  'Seated Knee Tucks': {
    primary: ['rectus_abdominis_lower', 'rectus_abdominis_middle'],
    secondary: ['external_oblique'],
  },

  /* --------------------------------------------------------------- cardio */
  'Elliptical': {
    primary: ['rectus_femoris', 'gluteus_maximus', ...HAMSTRINGS],
    secondary: [...CALVES, 'tibialis_anterior'],
  },
}

/**
 * Swap in a freshly-fetched muscle map (mobile only — see the comment on EXERCISE_MUSCLES).
 * The caller is expected to have already shape-checked `data`.
 */
export function applyLiveMuscles(data: Record<string, MuscleWork>): void {
  EXERCISE_MUSCLES = data
}

/**
 * Fold a list of logged sets into a highlight map for the body view.
 *
 * Primary beats secondary: doing a bench press and a triceps pushdown in the same
 * session should show the triceps as primary, not as bench's supporting muscle.
 * Exercises with no entry — custom ones — fall back to their category, so they light
 * the same region they always did.
 */
export function musclesFromSets(
  sets: { exercise: string }[],
  custom: CustomExerciseRow[] = [],
): Map<string, MuscleIntensity> {
  const out = new Map<string, MuscleIntensity>()
  const seen = new Set<string>()

  for (const s of sets) {
    if (seen.has(s.exercise)) continue
    seen.add(s.exercise)

    const work = EXERCISE_MUSCLES[s.exercise]
    if (work) {
      for (const g of work.secondary) if (!out.has(g)) out.set(g, 'secondary')
      for (const g of work.primary) out.set(g, 'primary')
      continue
    }
    // unknown exercise (custom, or renamed) — fall back to the whole category
    const cat = categoryOf(s.exercise, custom)?.key
    if (cat) out.set(cat, 'primary')
  }
  return out
}

/** Same thing for a plain list of exercise names — used by previews and tests. */
export function musclesForExercises(names: string[]): Map<string, MuscleIntensity> {
  return musclesFromSets(names.map((exercise) => ({ exercise })))
}

export type { MuscleIntensity }
