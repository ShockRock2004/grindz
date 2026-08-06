import {
  Dumbbell,
  CalendarDays,
  TrendingUp,
  History,
  Timer,
  Trophy,
  Flame,
  Star,
  Trash2,
  Plus,
  Minus,
  Check,
  X,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Play,
  Scale,
  LogOut,
  Link2,
  LayoutGrid,
  Pencil,
  Search,
} from 'lucide-react'
import { cx } from '../lib/util'

/* Chrome icons — lucide, clean + consistent. Same names the app already imports. */
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
export const IconPencil = Pencil
export const IconSearch = Search

/* Muscle-group identity is a bespoke SVG line-icon set (stroke = currentColor), consistent
   with the lucide chrome icons above. No photography on navigation surfaces. */
const MUSCLE_PATHS: Record<string, React.ReactNode> = {
  chest: (
    <>
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="7" x2="3" y2="11" />
      <line x1="21" y1="7" x2="21" y2="11" />
      <line x1="6" y1="7.5" x2="6" y2="10.5" />
      <line x1="18" y1="7.5" x2="18" y2="10.5" />
      <rect x="7" y="13" width="10" height="3" rx="1" />
      <line x1="9" y1="16" x2="9" y2="19" />
      <line x1="15" y1="16" x2="15" y2="19" />
    </>
  ),
  triceps: (
    <>
      <circle cx="4.5" cy="7.5" r="1.5" />
      <path d="M4.5 9v3" />
      <path d="M4.5 7.5h6.5" />
      <path d="M11 7.5l5.5 4.5" />
      <path d="M16.5 12l2.7 1.1" />
    </>
  ),
  back: (
    <>
      <path d="M12 4v15" />
      <path d="M6 6l6 2 6-2" />
      <path d="M6 6c-.2 5-1.6 8-3 10" />
      <path d="M18 6c.2 5 1.6 8 3 10" />
      <path d="M9 19h6" />
    </>
  ),
  biceps: (
    <>
      <circle cx="17" cy="6" r="2" />
      <path d="M15.5 8l-2.5 3" />
      <path d="M13 11c1.7-.3 3.4.3 4.5 1.8" />
      <path d="M17.5 12.8c-1.1 2.7-3.1 4.2-5.8 4.2H9" />
      <path d="M9 17c.2-2.3 1.3-4.4 3.4-6.2" />
      <path d="M5 20c1.1-2 2.4-3 4-3" />
    </>
  ),
  shoulders: (
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v7" />
      <path d="M12 9H5" />
      <path d="M12 9h7" />
      <path d="M4 7.5v3" />
      <path d="M20 7.5v3" />
      <path d="M9.5 14h5" />
    </>
  ),
  legs: (
    <>
      <circle cx="12" cy="4" r="1.7" />
      <path d="M12 5.7v4.3" />
      <path d="M12 10l-3.5 3 1 5" />
      <path d="M12 10l3.5 3-1 5" />
      <path d="M7.5 18h3" />
      <path d="M13.5 18h3" />
    </>
  ),
  abs: (
    <>
      <path d="M8 4c1.1 1.2 2.5 1.8 4 1.8S14.9 5.2 16 4" />
      <path d="M7 7c.6 4.5.6 8.3-1 13" />
      <path d="M17 7c-.6 4.5-.6 8.3 1 13" />
      <line x1="12" y1="7" x2="12" y2="20" />
      <path d="M8 10h8" />
      <path d="M8 14h8" />
      <path d="M8.5 18h7" />
    </>
  ),
  cardio: (
    <>
      <path d="M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 8.8 1.6z" />
      <polyline points="5 13 8.5 13 10 10 13 16 15 13 19 13" />
    </>
  ),
}

/** Detailed anatomy icons that use their own viewBox (not the shared 24x24). */
const CUSTOM_ICONS: Record<string, { viewBox: string; stroke: number; paths: React.ReactNode }> = {
  chest: {
    viewBox: '0 0 614 578',
    stroke: 42,
    paths: (
      <>
        <path d="M91 294 C77 236 84 195 125 174 C143 164 166 157 194 157 C222 158 258 169 289 186" />
        <path d="M529 292 C543 232 534 196 493 174 C475 165 452 157 425 157 C398 158 362 169 331 186" />
        <path d="M254 89 C253 105 251 116 247 122 C237 129 214 141 194 157" />
        <path d="M366 88 C367 105 369 117 373 122 C384 130 406 142 425 157" />
        <path d="M310 225 C310 244 310 274 309 293" />
        <path d="M145 255 C152 297 180 322 213 331 C248 341 286 324 309 293" />
        <path d="M473 252 C466 294 438 320 405 331 C369 340 333 318 309 293" />
        <path d="M175 342 C190 371 198 411 198 464" />
        <path d="M444 340 C429 371 420 414 420 466" />
        <path d="M309 364 L310 456" />
      </>
    ),
  },
  biceps: {
    viewBox: '0 0 512 512',
    stroke: 38,
    paths: (
      <>
        <path d="M267 91 C304 96 334 109 349 127 C363 204 368 318 353 409" />
        <path d="M267 91 L253 149 L281 157 L253 173 C247 177 247 187 254 191 C273 199 295 193 310 179" />
        <path d="M310 179 C313 220 294 260 264 293" />
        <path d="M124 311 C152 283 198 286 231 318 C247 333 260 354 269 376" />
        <path d="M135 359 C165 371 199 373 231 365" />
        <path d="M116 407 C186 429 278 427 353 409" />
      </>
    ),
  },
  back: {
    viewBox: '0 0 614 578',
    stroke: 42,
    paths: (
      <>
        <path d="M307 104 L307 500" />
        <path d="M292 104 L263 104 C254 104 252 119 245 133 C232 158 202 174 164 185" />
        <path d="M322 104 L351 104 C360 104 362 119 369 133 C382 158 412 174 450 185" />
        <path d="M164 185 C126 188 94 216 82 258 C72 292 75 326 91 354" />
        <path d="M450 185 C488 188 520 216 532 258 C542 292 539 326 523 354" />
        <path d="M91 354 C111 350 130 340 147 323 C151 375 165 421 184 467 C178 491 174 515 180 537" />
        <path d="M523 354 C503 350 484 340 467 323 C463 375 449 421 430 467 C436 491 440 515 434 537" />
        <path d="M164 185 C171 214 200 219 226 241 C255 266 252 319 294 348" />
        <path d="M450 185 C443 214 414 219 388 241 C359 266 362 319 320 348" />
        <path d="M147 323 C177 352 221 360 258 341" />
        <path d="M467 323 C437 352 393 360 356 341" />
        <path d="M258 341 C252 393 236 438 222 486 C215 509 214 528 222 537" />
        <path d="M356 341 C362 393 378 438 392 486 C399 509 400 528 392 537" />
        <path d="M222 537 L292 537" />
        <path d="M322 537 L392 537" />
      </>
    ),
  },
  /*
   * Obliques / serratus, three-quarter view.
   *
   * Shapes were traced from the reference by thresholding it to an ink mask and
   * reading stroke centrelines off the grid (verified with a pixel diff at trace
   * weight — IoU 66.6%, no missing or invented strokes). The reference draws at a
   * ~2.7% stroke weight, but every other icon here sits near 7%, so the trace is
   * rendered heavier and the finest details (navel, duplicate rib hooks, the
   * hairline forks at the crop edge) are dropped — at 44px they merged into mush
   * and read as noise next to chest/back/legs.
   */
  /*
   * Torso with pecs and two rows of ab bricks, traced pixel-by-pixel from the 64px
   * reference glyph.
   *
   * The reference packs the outline, pec line and four outlined bricks into 64
   * units with only ~2u between adjacent bricks. At the ~3.2px stroke the rest of
   * the set uses, those gaps close and the bricks merge into a solid block, so the
   * internal spacing is opened up a little and the stroke taken as far as the
   * geometry allows (2.6px rendered at 44 vs ~3.2 elsewhere).
   */
  abs: {
    viewBox: '0 0 64 64',
    stroke: 3.8,
    paths: (
      <>
        {/* torso outline */}
        <path d="M8 2.5 L56 2.5 C58 4 59 7 59 11 C59 15 57 19 55.5 23 C54 28 53.5 34 53.5 40 L53.5 53 C53 56 50 57.5 44 58.5 C40 59.3 36 60.5 32 61.5 C28 60.5 24 59.3 20 58.5 C14 57.5 11 56 10.5 53 L10.5 40 C10.5 34 10 28 8.5 23 C7 19 5 15 5 11 C5 7 6 4 8 2.5 Z" />

        {/* pec line and the two chest marks above it */}
        <path d="M10 18 C12 20.5 15 22 18.5 22 C22.5 22 26.5 20 29 16.5" />
        <path d="M54 18 C52 20.5 49 22 45.5 22 C41.5 22 37.5 20 35 16.5" />
        <path d="M15 14 L18 14" />
        <path d="M46 14 L49 14" />

        {/* four ab bricks */}
        <path d="M15.5 28 C15.5 26.2 17.2 25.4 22.2 25.4 C27.2 25.4 29 26.2 29 28 L29 32.5 C29 34.8 26 36.3 22.2 36.3 C18.4 36.3 15.5 34.8 15.5 32.5 Z" />
        <path d="M48.5 28 C48.5 26.2 46.8 25.4 41.8 25.4 C36.8 25.4 35 26.2 35 28 L35 32.5 C35 34.8 38 36.3 41.8 36.3 C45.6 36.3 48.5 34.8 48.5 32.5 Z" />
        <path d="M16.5 43 C16.5 41.4 18 40.6 22.5 40.6 C27 40.6 29 41.4 29 43 L29 47 C29 49.2 26.2 50.6 22.7 50.6 C19.2 50.6 16.5 49.2 16.5 47 Z" />
        <path d="M47.5 43 C47.5 41.4 46 40.6 41.5 40.6 C37 40.6 35 41.4 35 43 L35 47 C35 49.2 37.8 50.6 41.3 50.6 C44.8 50.6 47.5 49.2 47.5 47 Z" />
      </>
    ),
  },
  /*
   * Deltoid cap with the clavicle "V" hooking up to the right, the arm contour
   * dropping away on the left, and the fibre branch through the middle.
   *
   * Traced from the reference by thresholding its cyan ink to a mask and reading
   * stroke centrelines off a coordinate grid. The viewBox is padded to roughly
   * square so the drawing fills the icon box like chest/back/legs do rather than
   * letterboxing.
   */
  shoulders: {
    viewBox: '-70 -20 646 646',
    stroke: 48,
    paths: (
      <>
        {/* deltoid cap — open arc from the lower hook, round the top, to the clavicle junction */}
        <path d="M240 136 C218 120 196 104 172 99 C148 95 122 108 100 126 C74 148 52 176 34 210 C16 244 8 272 9 292 C10 318 18 344 32 364 C46 384 64 396 85 404" />

        {/* clavicle: the long sweep up-right with its hook, and the shorter lower arm of the V */}
        <path d="M246 140 C300 128 360 112 420 92 C452 82 476 70 486 52 C493 38 496 20 497 4" />
        <path d="M250 146 C290 158 330 170 366 177 C382 180 392 182 398 183" />

        {/* arm contour falling away behind the cap */}
        <path d="M26 370 C18 400 12 425 11 452 C10 480 10 508 14 532 C19 560 25 584 30 602" />

        {/* fibre lines through the belly of the muscle */}
        <path d="M242 253 C238 280 226 306 212 330 C200 350 174 370 149 382" />
        <path d="M206 360 C220 380 232 402 233 428 C234 460 224 492 219 522 C214 552 205 580 196 602" />
        <path d="M234 440 C254 450 272 460 288 472 C302 483 312 495 319 505" />
      </>
    ),
  },
  /*
   * Flexed arm, traced pixel-by-pixel from the 48px reference glyph: the fist and
   * outer forearm run as one continuous contour, the upper-arm arc sits top-right,
   * a short branch drops to the armpit, and the hand closes the bottom.
   *
   * NOTE: this shares a silhouette with the `biceps` icon above, which is also a
   * flexed arm — two categories now read alike in the nav.
   */
  triceps: {
    viewBox: '1 1 46 46',
    stroke: 3.35,
    paths: (
      <>
        {/* fist knuckle, round the top, then the whole outer forearm edge */}
        <path d="M13.5 24.5 C12 23 10.5 21 10.5 19 C10.5 17 11.5 15.5 13 15 C15 14.5 16.5 13.5 16.5 11.5 C16.5 9 15 6.5 12.5 6.5 C10.5 6.5 8.5 8 7 10.5 C5 13.5 4.5 17 4.5 21 C4.5 25 5 29 6.5 32 C8 35 10 38 11.5 39.5" />

        {/* upper-arm arc and the branch dropping to the armpit */}
        <path d="M27.5 23 C28 19 28.5 16 30.5 13.5 C32.5 11.5 36 11 39 13 C42 15 43.5 18 44 22 C44.3 24 44 25.5 43 26.5" />
        <path d="M28 20.5 C25 21 21.5 21.5 19 23 C17.5 24 17 26 17 27.5 L17 29.5" />

        {/* hand mass across the bottom */}
        <path d="M31 29 C29.5 31.5 26.5 34 22.5 36 C18.5 38 14 39.5 11 40" />
        <path d="M36.5 29 C36.5 32 35.5 35 33.5 37.5 C32 39.5 30 40.5 28 41" />
        <path d="M11 40 C15 42 21 42.5 26 42 C28 41.8 29.5 41.5 30.5 41" />
      </>
    ),
  },
  legs: {
    viewBox: '0 0 1024 1024',
    stroke: 74,
    paths: (
      <>
        <path d="M190 79 C344 83 503 143 628 260 C668 298 684 329 720 349 C743 362 770 371 783 397 C799 430 814 485 811 526 C809 551 793 575 779 599 L616 919" />
        <path d="M253 283 C288 301 324 321 362 341" />
        <path d="M406 379 C474 443 567 493 675 491" />
        <path d="M191 491 C291 544 414 570 543 578 C509 604 466 633 425 672 C376 718 372 752 371 804 C370 850 362 886 341 910" />
        <path d="M628 617 C590 704 535 773 467 824" />
      </>
    ),
  },
}

/** A single muscle-group line icon. */
export function MuscleIcon({ icon, size = 24, className }: { icon: string; size?: number; className?: string }) {
  const custom = CUSTOM_ICONS[icon]
  if (custom) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={custom.viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={custom.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {custom.paths}
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {MUSCLE_PATHS[icon] ?? MUSCLE_PATHS['chest']}
    </svg>
  )
}

/** Muscle-group icon at a given box size — no chip, just the (large) icon. */
export function CategoryThumb({ icon, size = 40, className }: { icon: string; size?: number; className?: string }) {
  return (
    <span className={cx('grid shrink-0 place-items-center text-cyan', className)} style={{ width: size, height: size }}>
      <MuscleIcon icon={icon} size={Math.round(size * 0.96)} />
    </span>
  )
}
