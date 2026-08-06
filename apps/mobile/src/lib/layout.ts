/**
 * Window size classes.
 *
 * Material 3's breakpoints, which is what Android tablets are designed against:
 *   compact   < 600dp   phones, and phones in landscape
 *   medium    600-839   small tablets, large phones in landscape, split screen
 *   expanded  >= 840    tablets in landscape — the Galaxy Tab S9 FE+ lands here
 *
 * A 12.4" tablet gives roughly 1700x1060dp in landscape. Letting a column of
 * cards stretch across all of that is the actual failure mode: a 1700dp-wide
 * line of body text is unreadable, and a bottom tab bar spanning it is absurd.
 * So `content` caps the reading column and `columns` opens the grids up instead.
 */
import { useWindowDimensions } from 'react-native'

export type SizeClass = 'compact' | 'medium' | 'expanded'

export interface Layout {
  width: number
  height: number
  size: SizeClass
  isLandscape: boolean
  /** true once a side rail beats a bottom bar */
  rail: boolean
  /** max width for a single reading column, so text never runs the full width */
  content: number
  /** sensible column count for card grids at this width */
  columns: number
  /** width actually available to a screen, after the rail and the content cap */
  stage: number
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions()
  const size: SizeClass = width >= 840 ? 'expanded' : width >= 600 ? 'medium' : 'compact'
  const isLandscape = width > height
  return {
    width,
    height,
    size,
    isLandscape,
    // a rail only earns its keep with real horizontal room AND the height to
    // stack it — a phone in landscape is wide but far too short
    rail: size === 'expanded',
    content: size === 'expanded' ? 1100 : size === 'medium' ? 720 : width,
    columns: size === 'expanded' ? 3 : size === 'medium' ? 2 : 1,
    stage: Math.min(size === 'expanded' ? 1100 : size === 'medium' ? 720 : width, width - (size === 'expanded' ? 88 : 0)),
  }
}
