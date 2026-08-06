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
 */
const TRICEPS = ['triceps_lateral_head', 'triceps_brachii']
const FOREARMS = ['brachioradialis', 'wrist_flexors', 'extensor_carpi_ulnaris']
const CALVES = ['gastrocnemius', 'gastrocnemius_lateral', 'gastrocnemius_medial', 'soleus']
const QUADS = ['rectus_femoris', 'vastus_lateralis', 'vastus_medialis']
const HAMSTRINGS = ['biceps_femoris', 'semitendinosus']
const ABS = ['rectus_abdominis_upper', 'rectus_abdominis_middle', 'rectus_abdominis_lower']
const LATS = ['latissimus_dorsi']
const UPPER_BACK = ['trapezius_middle_lower', 'infraspinatus_teres_major']

export interface MuscleWork {
  primary: string[]
  secondary: string[]
}

/** Keyed by the exercise name exactly as it appears in the catalogue. */
export const EXERCISE_MUSCLES: Record<string, MuscleWork> = {
  /* ---------------------------------------------------------------- chest */
  'Incline Bench Press': { primary: ['pectoralis_major', 'anterior_deltoid'], secondary: TRICEPS },
  'Decline Bench Press': { primary: ['pectoralis_major'], secondary: [...TRICEPS, 'anterior_deltoid'] },
  'Pec Fly': { primary: ['pectoralis_major'], secondary: ['anterior_deltoid'] },
  'Flat Bench Press': { primary: ['pectoralis_major'], secondary: [...TRICEPS, 'anterior_deltoid'] },

  /* -------------------------------------------------------------- triceps */
  'Seated Overhead Dumbbell Triceps Extension': { primary: TRICEPS, secondary: ['posterior_deltoid'] },
  'Cable Pushdowns': { primary: TRICEPS, secondary: ['extensor_carpi_ulnaris'] },
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
  'Concentration Curl': { primary: ['biceps_brachii'], secondary: ['brachioradialis'] },
  // brachioradialis is the point of a hammer curl, so it is primary here and must not
  // also appear in the FOREARMS spread below it
  'Rope Hammer Curl': { primary: ['biceps_brachii', 'brachioradialis'], secondary: ['wrist_flexors', 'extensor_carpi_ulnaris'] },

  /* ------------------------------------------------------------ shoulders */
  'Overhead Shoulder Press': {
    primary: ['anterior_deltoid', 'lateral_deltoid'],
    secondary: [...TRICEPS, 'trapezius_upper'],
  },
  'Dumbbell Front Raise': { primary: ['anterior_deltoid'], secondary: ['lateral_deltoid'] },
  'Dumbbell Lateral Raise': { primary: ['lateral_deltoid'], secondary: ['anterior_deltoid', 'trapezius_upper'] },
  'Shrugs': { primary: ['trapezius_upper'], secondary: ['trapezius_middle_lower', ...FOREARMS] },
  'Reverse Pec Deck': { primary: ['posterior_deltoid'], secondary: UPPER_BACK },
  'Upright Row': { primary: ['lateral_deltoid', 'trapezius_upper'], secondary: ['biceps_brachii', ...FOREARMS] },
  'Rope Face Pull': {
    primary: ['posterior_deltoid', 'infraspinatus_teres_major'],
    secondary: ['trapezius_middle_lower', 'trapezius_upper'],
  },

  /* ----------------------------------------------------------------- legs */
  'Seated Leg Curl': { primary: HAMSTRINGS, secondary: ['gastrocnemius_lateral', 'gastrocnemius_medial'] },
  'Adductor and Abductor': {
    primary: ['pectineus', 'tensor_fasciae_latae'],
    secondary: ['gluteus_maximus', 'sartorius'],
  },
  'Barbell Squats': {
    primary: [...QUADS, 'gluteus_maximus'],
    secondary: [...HAMSTRINGS, 'erector_spinae', ...CALVES],
  },
  'Seated Leg Extension': { primary: QUADS, secondary: ['tensor_fasciae_latae'] },
  'Dumbbell Romanian Deadlift': {
    primary: [...HAMSTRINGS, 'gluteus_maximus'],
    secondary: ['erector_spinae', 'trapezius_upper', ...FOREARMS],
  },
  'Seated Calf Raise Machine': { primary: CALVES, secondary: [] },

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
