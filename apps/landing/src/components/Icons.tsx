/**
 * The icons the landing page uses, and only those.
 *
 * apps/web has a much larger Icons.tsx covering the whole product surface. Copying it wholesale
 * would drag the entire chrome icon set into a bundle that renders seven glyphs — so this is the
 * subset, under the same names, so the shared Landing markup reads identically in both trees.
 *
 * These are direct lucide re-exports rather than hand-drawn paths, exactly as in apps/web: same
 * stroke weight, same grid, so the two surfaces cannot drift visually.
 */
export {
  Dumbbell as IconDumbbell,
  CalendarDays as IconCalendar,
  TrendingUp as IconChart,
  History as IconHistory,
  Timer as IconClock,
  Trophy as IconTrophy,
  Scale as IconScale,
} from 'lucide-react'
