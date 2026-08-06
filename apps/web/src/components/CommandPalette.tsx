/**
 * ⌘K palette — the browser's answer to a bottom tab bar.
 *
 * A phone app can afford four destinations because a thumb can only reach four. A desktop
 * user has a keyboard, so everything the app can do is reachable by typing: sections,
 * every muscle group, every exercise in the catalogue (including custom ones), and settings.
 *
 * Results are ranked so a prefix match beats a mid-string one — typing "ch" should put Chest
 * above "Rope Hammer Curl", which merely contains the letters.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../lib/app-context'
import { mergeCustom } from '../data/catalog'
import { cx } from '../lib/util'
import { IconSearch, IconDumbbell, IconCalendar, IconChart, IconHistory, IconGrid } from './Icons'
import { Kbd } from './Kbd'

interface Item {
  id: string
  label: string
  hint: string
  Icon: typeof IconSearch
  run: () => void
}

export function CommandPalette({
  open,
  onClose,
  onSettings,
}: {
  open: boolean
  onClose: () => void
  onSettings: () => void
}) {
  const nav = useNavigate()
  const { custom } = useData()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      nav(to)
      onClose()
    }
    const out: Item[] = [
      { id: 'nav:train', label: 'Train', hint: 'Pick a muscle group', Icon: IconDumbbell, run: go('/') },
      { id: 'nav:plan', label: 'Plan', hint: 'Your training week', Icon: IconCalendar, run: go('/planner') },
      { id: 'nav:progress', label: 'Progress', hint: 'Charts, PRs, muscle map', Icon: IconChart, run: go('/progress') },
      { id: 'nav:history', label: 'History', hint: 'Every session you have logged', Icon: IconHistory, run: go('/history') },
      {
        id: 'act:settings',
        label: 'Settings',
        hint: 'Units, AI key, custom exercises, export',
        Icon: IconGrid,
        run: () => {
          onClose()
          onSettings()
        },
      },
    ]
    const cats = mergeCustom(custom)
    for (const c of cats) {
      out.push({
        id: `cat:${c.key}`,
        label: c.title,
        hint: `${c.exercises.length} exercises · ${c.subtitle}`,
        Icon: IconDumbbell,
        run: go(`/category/${c.key}`),
      })
      for (const ex of c.exercises) {
        out.push({
          id: `ex:${c.key}:${ex.name}`,
          label: ex.name,
          hint: c.title,
          Icon: IconGrid,
          run: go(`/category/${c.key}`),
        })
      }
    }
    return out
  }, [custom, nav, onClose, onSettings])

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return items.slice(0, 8)
    const scored: { item: Item; score: number }[] = []
    for (const item of items) {
      const hay = item.label.toLowerCase()
      const at = hay.indexOf(term)
      if (at === -1) continue
      // prefix beats word-start beats anywhere; shorter labels win ties
      const score = (at === 0 ? 0 : hay[at - 1] === ' ' ? 1 : 2) * 1000 + hay.length
      scored.push({ item, score })
    }
    return scored.sort((a, b) => a.score - b.score).slice(0, 12).map((s) => s.item)
  }, [q, items])

  useEffect(() => {
    if (open) {
      setQ('')
      setI(0)
      // focus after paint, or the dialog steals it back
      const id = window.requestAnimationFrame(() => inputRef.current?.focus())
      return () => window.cancelAnimationFrame(id)
    }
  }, [open])

  useEffect(() => setI(0), [q])

  // keep the highlighted row in view when arrowing past the fold
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${i}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [i])

  if (!open) return null

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setI((n) => (results.length ? (n + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setI((n) => (results.length ? (n - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      results[i]?.run()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-[12vh] animate-fadeIn" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl glass-strong shadow-card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <IconSearch size={18} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sections, muscle groups, exercises…"
            aria-label="Search"
            className="min-h-[52px] flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <Kbd className="shrink-0">Esc</Kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{q}”.</p>
          ) : (
            results.map((r, idx) => (
              <button
                key={r.id}
                data-idx={idx}
                onMouseEnter={() => setI(idx)}
                onClick={r.run}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                  idx === i ? 'bg-cyan/[0.12]' : 'hover:bg-white/[0.04]',
                )}
              >
                <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', idx === i ? 'text-cyan' : 'text-muted')}>
                  <r.Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{r.label}</span>
                  <span className="block truncate text-[12px] text-muted">{r.hint}</span>
                </span>
                {idx === i && <Kbd className="shrink-0">↵</Kbd>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
