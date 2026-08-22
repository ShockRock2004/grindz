import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg'
import { View } from 'react-native'
import {
  Dumbbell, CalendarDays, TrendingUp, History, Timer, Trophy, Flame, Star, Trash2,
  Plus, Minus, Check, X, ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, Play,
  Scale, LogOut, Link2, LayoutGrid, Search, AlertTriangle, Sparkles,
} from 'lucide-react-native'
import { C } from '../theme'

/**
 * The app mark — lucide's `dumbbell` geometry in the brand gradient, identical to the
 * launcher icon, the splash logo and the web app's mark.
 *
 * This used to be a cyan progress ring, which is why the in-app header kept showing the old
 * arc long after the launcher icon had changed: the header does not read the icon asset, it
 * draws its own SVG. Anything that renders the brand has to be updated too.
 *
 * The gradient paints the STROKE — the mark is an outlined glyph, and flattening it to solid
 * shapes would produce a different mark that merely resembles this one.
 */
export function GrindzMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="grindzMark" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#00c6ff" />
          <Stop offset="1" stopColor="#0072ff" />
        </LinearGradient>
      </Defs>
      <G fill="none" stroke="url(#grindzMark)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
        <Path d="m2.5 21.5 1.4-1.4" />
        <Path d="m20.1 3.9 1.4-1.4" />
        <Path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
        <Path d="m9.6 14.4 4.8-4.8" />
      </G>
    </Svg>
  )
}

/* Chrome icons — same lucide set the web app uses, via lucide-react-native. */
export const IconDumbbell = Dumbbell
export const IconCalendar = CalendarDays
export const IconChart = TrendingUp
export const IconHistory = History
export const IconClock = Timer
export const IconTrophy = Trophy
export const IconFlame = Flame
export const IconStar = Star
export const IconTrash = Trash2
export const IconPlus = Plus
export const IconMinus = Minus
export const IconCheck = Check
export const IconClose = X
export const IconArrowLeft = ArrowLeft
export const IconChevronLeft = ChevronLeft
export const IconChevronRight = ChevronRight
export const IconChevronDown = ChevronDown
export const IconPlay = Play
export const IconScale = Scale
export const IconLogout = LogOut
export const IconLink = Link2
export const IconGrid = LayoutGrid
export const IconSearch = Search
export const IconAlert = AlertTriangle
export const IconSparkles = Sparkles

/**
 * The muscle-group glyphs, carried over verbatim from the web app's CUSTOM_ICONS.
 * Each was traced from reference art and tuned so every icon renders at ~3.0-3.3px
 * stroke in a 44px box — keep the stroke/viewBox ratios if you edit these.
 */
const MUSCLE: Record<string, { viewBox: string; stroke: number; d: string[] }> = {
  chest: {
    viewBox: '0 0 614 578',
    stroke: 42,
    d: [
      'M91 294 C77 236 84 195 125 174 C143 164 166 157 194 157 C222 158 258 169 289 186',
      'M529 292 C543 232 534 196 493 174 C475 165 452 157 425 157 C398 158 362 169 331 186',
      'M254 89 C253 105 251 116 247 122 C237 129 214 141 194 157',
      'M366 88 C367 105 369 117 373 122 C384 130 406 142 425 157',
      'M310 225 C310 244 310 274 309 293',
      'M145 255 C152 297 180 322 213 331 C248 341 286 324 309 293',
      'M473 252 C466 294 438 320 405 331 C369 340 333 318 309 293',
      'M175 342 C190 371 198 411 198 464',
      'M444 340 C429 371 420 414 420 466',
      'M309 364 L310 456',
    ],
  },
  biceps: {
    viewBox: '0 0 512 512',
    stroke: 38,
    d: [
      'M267 91 C304 96 334 109 349 127 C363 204 368 318 353 409',
      'M267 91 L253 149 L281 157 L253 173 C247 177 247 187 254 191 C273 199 295 193 310 179',
      'M310 179 C313 220 294 260 264 293',
      'M124 311 C152 283 198 286 231 318 C247 333 260 354 269 376',
      'M135 359 C165 371 199 373 231 365',
      'M116 407 C186 429 278 427 353 409',
    ],
  },
  back: {
    viewBox: '0 0 614 578',
    stroke: 42,
    d: [
      'M307 104 L307 500',
      'M292 104 L263 104 C254 104 252 119 245 133 C232 158 202 174 164 185',
      'M322 104 L351 104 C360 104 362 119 369 133 C382 158 412 174 450 185',
      'M164 185 C126 188 94 216 82 258 C72 292 75 326 91 354',
      'M450 185 C488 188 520 216 532 258 C542 292 539 326 523 354',
      'M91 354 C111 350 130 340 147 323 C151 375 165 421 184 467 C178 491 174 515 180 537',
      'M523 354 C503 350 484 340 467 323 C463 375 449 421 430 467 C436 491 440 515 434 537',
      'M164 185 C171 214 200 219 226 241 C255 266 252 319 294 348',
      'M450 185 C443 214 414 219 388 241 C359 266 362 319 320 348',
      'M147 323 C177 352 221 360 258 341',
      'M467 323 C437 352 393 360 356 341',
      'M258 341 C252 393 236 438 222 486 C215 509 214 528 222 537',
      'M356 341 C362 393 378 438 392 486 C399 509 400 528 392 537',
      'M222 537 L292 537',
      'M322 537 L392 537',
    ],
  },
  // torso with pecs and two rows of ab bricks (icons8 64px reference)
  abs: {
    viewBox: '0 0 64 64',
    stroke: 3.8,
    d: [
      'M8 2.5 L56 2.5 C58 4 59 7 59 11 C59 15 57 19 55.5 23 C54 28 53.5 34 53.5 40 L53.5 53 C53 56 50 57.5 44 58.5 C40 59.3 36 60.5 32 61.5 C28 60.5 24 59.3 20 58.5 C14 57.5 11 56 10.5 53 L10.5 40 C10.5 34 10 28 8.5 23 C7 19 5 15 5 11 C5 7 6 4 8 2.5 Z',
      'M10 18 C12 20.5 15 22 18.5 22 C22.5 22 26.5 20 29 16.5',
      'M54 18 C52 20.5 49 22 45.5 22 C41.5 22 37.5 20 35 16.5',
      'M15 14 L18 14',
      'M46 14 L49 14',
      'M15.5 28 C15.5 26.2 17.2 25.4 22.2 25.4 C27.2 25.4 29 26.2 29 28 L29 32.5 C29 34.8 26 36.3 22.2 36.3 C18.4 36.3 15.5 34.8 15.5 32.5 Z',
      'M48.5 28 C48.5 26.2 46.8 25.4 41.8 25.4 C36.8 25.4 35 26.2 35 28 L35 32.5 C35 34.8 38 36.3 41.8 36.3 C45.6 36.3 48.5 34.8 48.5 32.5 Z',
      'M16.5 43 C16.5 41.4 18 40.6 22.5 40.6 C27 40.6 29 41.4 29 43 L29 47 C29 49.2 26.2 50.6 22.7 50.6 C19.2 50.6 16.5 49.2 16.5 47 Z',
      'M47.5 43 C47.5 41.4 46 40.6 41.5 40.6 C37 40.6 35 41.4 35 43 L35 47 C35 49.2 37.8 50.6 41.3 50.6 C44.8 50.6 47.5 49.2 47.5 47 Z',
    ],
  },
  // deltoid cap + clavicle V with its hook
  shoulders: {
    viewBox: '-70 -20 646 646',
    stroke: 48,
    d: [
      'M240 136 C218 120 196 104 172 99 C148 95 122 108 100 126 C74 148 52 176 34 210 C16 244 8 272 9 292 C10 318 18 344 32 364 C46 384 64 396 85 404',
      'M246 140 C300 128 360 112 420 92 C452 82 476 70 486 52 C493 38 496 20 497 4',
      'M250 146 C290 158 330 170 366 177 C382 180 392 182 398 183',
      'M26 370 C18 400 12 425 11 452 C10 480 10 508 14 532 C19 560 25 584 30 602',
      'M242 253 C238 280 226 306 212 330 C200 350 174 370 149 382',
      'M206 360 C220 380 232 402 233 428 C234 460 224 492 219 522 C214 552 205 580 196 602',
      'M234 440 C254 450 272 460 288 472 C302 483 312 495 319 505',
    ],
  },
  // flexed arm (icons8 48px reference)
  triceps: {
    viewBox: '1 1 46 46',
    stroke: 3.35,
    d: [
      'M13.5 24.5 C12 23 10.5 21 10.5 19 C10.5 17 11.5 15.5 13 15 C15 14.5 16.5 13.5 16.5 11.5 C16.5 9 15 6.5 12.5 6.5 C10.5 6.5 8.5 8 7 10.5 C5 13.5 4.5 17 4.5 21 C4.5 25 5 29 6.5 32 C8 35 10 38 11.5 39.5',
      'M27.5 23 C28 19 28.5 16 30.5 13.5 C32.5 11.5 36 11 39 13 C42 15 43.5 18 44 22 C44.3 24 44 25.5 43 26.5',
      'M28 20.5 C25 21 21.5 21.5 19 23 C17.5 24 17 26 17 27.5 L17 29.5',
      'M31 29 C29.5 31.5 26.5 34 22.5 36 C18.5 38 14 39.5 11 40',
      'M36.5 29 C36.5 32 35.5 35 33.5 37.5 C32 39.5 30 40.5 28 41',
      'M11 40 C15 42 21 42.5 26 42 C28 41.8 29.5 41.5 30.5 41',
    ],
  },
  legs: {
    viewBox: '0 0 1024 1024',
    stroke: 74,
    d: [
      'M190 79 C344 83 503 143 628 260 C668 298 684 329 720 349 C743 362 770 371 783 397 C799 430 814 485 811 526 C809 551 793 575 779 599 L616 919',
      'M253 283 C288 301 324 321 362 341',
      'M406 379 C474 443 567 493 675 491',
      'M191 491 C291 544 414 570 543 578 C509 604 466 633 425 672 C376 718 372 752 371 804 C370 850 362 886 341 910',
      'M628 617 C590 704 535 773 467 824',
    ],
  },
  cardio: {
    viewBox: '0 0 24 24',
    stroke: 1.75,
    d: [
      'M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 8.8 1.6z',
      'M5 13 L8.5 13 L10 10 L13 16 L15 13 L19 13',
    ],
  },
}

/** A single muscle-group line icon. */
export function MuscleIcon({ icon, size = 24, color = C.cyan }: { icon: string; size?: number; color?: string }) {
  const m = MUSCLE[icon] ?? MUSCLE.chest
  return (
    <Svg width={size} height={size} viewBox={m.viewBox} fill="none">
      {m.d.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={m.stroke} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  )
}

/** Muscle-group icon at a given box size — no chip, just the icon. */
export function CategoryThumb({ icon, size = 40, color = C.cyan }: { icon: string; size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <MuscleIcon icon={icon} size={Math.round(size * 0.96)} color={color} />
    </View>
  )
}
