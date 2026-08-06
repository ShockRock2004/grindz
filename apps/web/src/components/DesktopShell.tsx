/**
 * The web app's frame.
 *
 * This is the piece that makes the browser build its own product rather than a phone screen
 * stretched wide. The mobile app navigates with a bottom tab bar because a thumb is at the
 * bottom of the device; a browser has a cursor, a keyboard, and a viewport that is wider than
 * it is tall, so navigation lives in a persistent left rail that never costs a tap to reach and
 * never hides where you are.
 *
 * Below `lg` the rail collapses to the familiar bottom bar — a narrow browser window is a phone
 * for all practical purposes, and pretending otherwise just produces a broken rail.
 *
 * Keyboard is a first-class input here, not an afterthought: ⌘K / Ctrl-K opens the command
 * palette, 1–4 jump between sections, N starts a workout, and ? lists the lot. All of them are
 * suppressed while you are typing, so logging a set never triggers navigation.
 */
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, useSession } from '../lib/app-context'
import { cx, fmtDuration, greeting, firstName } from '../lib/util'
import { haptic } from '../lib/haptics'
import { SettingsModal } from './SettingsModal'
import { CommandPalette } from './CommandPalette'
import { Kbd, ModK, modKeyName } from './Kbd'
import {
  IconDumbbell,
  IconCalendar,
  IconChart,
  IconHistory,
  IconPlay,
  IconSearch,
} from './Icons'

export const NAV = [
  { to: '/', label: 'Train', Icon: IconDumbbell, end: true, key: '1' },
  { to: '/planner', label: 'Plan', Icon: IconCalendar, end: false, key: '2' },
  { to: '/progress', label: 'Progress', Icon: IconChart, end: false, key: '3' },
  { to: '/history', label: 'History', Icon: IconHistory, end: false, key: '4' },
]

/** True when focus is somewhere that should swallow single-key shortcuts. */
function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

/** Elapsed time on the active session, ticking once a second. */
function useElapsed(startedAt: number | undefined): string | null {
  const [, force] = useState(0)
  useEffect(() => {
    if (startedAt === undefined) return
    const id = window.setInterval(() => force((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [startedAt])
  if (startedAt === undefined) return null
  return fmtDuration(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
}

export function DesktopShell() {
  const { profile } = useAuth()
  const { active } = useSession()
  const loc = useLocation()
  const nav = useNavigate()
  const [settings, setSettings] = useState(false)
  const [palette, setPalette] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  const elapsed = useElapsed(active?.startedAt)

  const initial = (profile.name || profile.email || '?').trim()[0]?.toUpperCase() ?? '?'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
        return
      }
      if (mod || e.altKey || isTyping(e.target)) return
      const tab = NAV.find((t) => t.key === e.key)
      if (tab) {
        e.preventDefault()
        nav(tab.to)
        return
      }
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        nav(active ? '/session' : '/')
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setShortcuts((s) => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, active])

  return (
    <div data-testid="app-shell" className="min-h-full lg:grid lg:h-full lg:grid-cols-[264px_1fr]">
      {/* ------------------------------------------------------------------ desktop rail */}
      <aside data-testid="sidebar" className="hidden border-r border-line bg-[rgba(8,8,12,0.5)] lg:flex lg:h-full lg:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <img src="/grindz-mark.svg" alt="" className="h-9 w-9" />
          <div className="min-w-0">
            <div className="font-heading text-[19px] font-extrabold leading-none">Grindz</div>
            <p className="mt-1 truncate text-[11px] text-muted">
              {greeting()}
              {firstName(profile.name) ? `, ${firstName(profile.name)}` : ''}
            </p>
          </div>
        </div>

        <button
          onClick={() => setPalette(true)}
          // the chips are aria-hidden decoration; this is what actually conveys the binding,
          // and it takes ARIA's key names (Meta/Control), never the ⌘ glyph
          aria-keyshortcuts={`${modKeyName()}+K`}
          className="mx-3 flex items-center gap-2.5 rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-left text-[13px] text-muted transition hover:border-line2 hover:text-ink2"
        >
          <IconSearch size={16} />
          <span className="flex-1">Jump to…</span>
          <ModK />
        </button>

        <nav className="mt-4 flex flex-col gap-1 px-3">
          {NAV.map(({ to, label, Icon, end, key }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                  isActive
                    ? 'bg-cyan/[0.12] text-cyan'
                    : 'text-muted hover:bg-white/[0.04] hover:text-ink2',
                )
              }
            >
              <Icon size={19} />
              <span className="flex-1">{label}</span>
              <Kbd className="opacity-0 transition group-hover:opacity-100">{key}</Kbd>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto p-3">
          {active && loc.pathname !== '/session' && (
            <button
              onClick={() => nav('/session')}
              className="mb-3 flex w-full items-center gap-3 rounded-xl border border-cyan/35 bg-cyan/[0.10] px-3 py-2.5 text-left transition hover:bg-cyan/[0.16]"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan text-cyan-ink">
                <IconPlay size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-cyan">Resume {active.title}</span>
                <span className="block text-[11px] tnum text-muted">{elapsed}</span>
              </span>
            </button>
          )}
          <button
            onClick={() => {
              haptic.select()
              setSettings(true)
            }}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.04]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line2 bg-panel2 text-cyan">
              {profile.avatar ? (
                <img src={profile.avatar} alt="" className="h-9 w-9 object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="font-heading text-xs font-extrabold">{initial}</span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{profile.name || 'Athlete'}</span>
              <span className="block truncate text-[11px] text-muted">Settings</span>
            </span>
          </button>
        </div>
      </aside>

      {/* ---------------------------------------------------------------------- content */}
      <div className="flex min-w-0 flex-col lg:h-full lg:overflow-y-auto">
        {/* compact top bar, only below lg — the rail already carries this on desktop */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line bg-[rgba(5,5,9,0.82)] px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/grindz-mark.svg" alt="Grindz" className="h-8 w-8 shrink-0" />
            <span className="font-heading text-[17px] font-extrabold">Grindz</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPalette(true)} aria-label="Search" className="grid h-9 w-9 place-items-center rounded-full text-muted">
              <IconSearch size={18} />
            </button>
            <button
              onClick={() => setSettings(true)}
              aria-label="Settings"
              className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-line2 bg-panel2 text-cyan"
            >
              {profile.avatar ? (
                <img src={profile.avatar} alt="" className="h-9 w-9 object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="font-heading text-xs font-extrabold">{initial}</span>
              )}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-14">
          <Outlet />
        </main>
      </div>

      {/* ------------------------------------------------------------- mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[rgba(5,5,9,0.9)] px-2 py-1.5 backdrop-blur-xl lg:hidden">
        <div className="flex items-stretch justify-around">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => haptic.nav()}
              className={({ isActive }) =>
                cx('flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition', isActive ? 'text-cyan' : 'text-muted')
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* resume pill on mobile, where there is no rail to hold it */}
      {active && loc.pathname !== '/session' && (
        <button
          onClick={() => nav('/session')}
          className="fixed inset-x-4 bottom-[4.6rem] z-40 flex items-center justify-center gap-2 rounded-2xl btn-cyan px-5 py-3 text-sm lg:hidden"
        >
          <IconPlay size={17} /> Resume workout · <span className="tnum">{elapsed}</span>
        </button>
      )}

      <CommandPalette open={palette} onClose={() => setPalette(false)} onSettings={() => setSettings(true)} />
      <SettingsModal open={settings} onClose={() => setSettings(false)} />
      <ShortcutSheet open={shortcuts} onClose={() => setShortcuts(false)} />
    </div>
  )
}

function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const rows: [string, string][] = [
    ['⌘K / Ctrl K', 'Open the command palette'],
    ['1 – 4', 'Train · Plan · Progress · History'],
    ['N', 'Go to the active workout'],
    ['?', 'Show this list'],
    ['Esc', 'Close whatever is open'],
  ]
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 animate-fadeIn" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-md rounded-3xl glass-strong p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-lg font-extrabold">Keyboard shortcuts</h2>
        <dl className="mt-4 space-y-2.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <dt className="text-[13.5px] text-muted2">{v}</dt>
              <dd>
                <Kbd>{k}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
