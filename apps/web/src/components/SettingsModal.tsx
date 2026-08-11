/**
 * Settings — profile, units, AI key, custom exercises, export, sign out.
 *
 * Extracted verbatim from the old mobile AppShell when the web app was rebuilt around a
 * desktop sidebar. The shell changed; this dialog's behaviour deliberately did not, so both
 * surfaces still agree on what "settings" means.
 */
import { useEffect, useState } from 'react'
import { useAuth, useData, usePrefs } from '../lib/app-context'
import { signOut } from '../lib/auth'
import { deleteCustom } from '../lib/db'
import { CATALOG } from '../data/catalog'
import { cx, dateKey } from '../lib/util'
import { haptic } from '../lib/haptics'
import { Button, Modal } from './ui'
import { AddExercise } from './AddExercise'
import { syncGroqKey, setGroqKey, maskKey } from '../lib/groq'
import { testGroqKey } from '../lib/exercise-ai'
import { IconTrash, IconPlus, IconLogout } from './Icons'

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { custom, sessions, sets, templates, bodyweights, plan, refresh } = useData()
  const { unit, setUnit, gender, setGender } = usePrefs()
  const [adding, setAdding] = useState(false)

  // the AI key lives on the user's own profile row, so it follows them across devices
  const [groqKey, setGroqKeyState] = useState('')
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyErr, setKeyErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) void syncGroqKey().then(setGroqKeyState)
  }, [open])

  const saveKey = async () => {
    const k = keyDraft.trim()
    if (!k) return
    setKeyBusy(true)
    setKeyErr(null)
    if (!(await testGroqKey(k))) {
      setKeyErr("That key didn't work. Check it and try again.")
      setKeyBusy(false)
      return
    }
    await setGroqKey(k)
    setGroqKeyState(k)
    setKeyDraft('')
    setKeyOpen(false)
    setKeyBusy(false)
    haptic.success()
  }

  const pickUnit = (u: 'kg' | 'lbs') => {
    haptic.select()
    setUnit(u)
  }
  const pickGender = (g: 'male' | 'female') => {
    if (g === gender) return
    haptic.select()
    setGender(g)
  }
  const exportData = () => {
    haptic.success()
    const payload = { exportedAt: new Date().toISOString(), sessions, sets, templates, bodyweights, plan }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `grindz-export-${dateKey()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
        <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full border border-line2 bg-panel2 text-cyan">
          {profile.avatar ? <img src={profile.avatar} alt="" className="h-12 w-12 object-cover" referrerPolicy="no-referrer" /> : <span className="font-heading font-extrabold">{(profile.name || '?')[0]?.toUpperCase()}</span>}
        </div>
        <div className="min-w-0">
          <p className="truncate font-heading font-bold">{profile.name || 'Athlete'}</p>
          <p className="truncate text-xs text-muted">{profile.email}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-line px-4 py-3">
        <div>
          <p className="font-heading text-sm font-bold">Units</p>
          <p className="text-xs text-muted">Display weights in kg or lbs</p>
        </div>
        <div className="flex rounded-xl border border-line2 p-0.5 text-xs font-bold">
          <button onClick={() => pickUnit('kg')} className={cx('rounded-lg px-3 py-1.5', unit === 'kg' ? 'bg-cyan text-cyan-ink' : 'text-muted')}>
            kg
          </button>
          <button onClick={() => pickUnit('lbs')} className={cx('rounded-lg px-3 py-1.5', unit === 'lbs' ? 'bg-cyan text-cyan-ink' : 'text-muted')}>
            lbs
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-line px-4 py-3">
        <div>
          <p className="font-heading text-sm font-bold">Body type</p>
          <p className="text-xs text-muted">Muscle map and exercise photos</p>
        </div>
        <div className="flex rounded-xl border border-line2 p-0.5 text-xs font-bold">
          <button onClick={() => pickGender('male')} className={cx('rounded-lg px-3 py-1.5', gender === 'male' ? 'bg-cyan text-cyan-ink' : 'text-muted')}>
            Male
          </button>
          <button onClick={() => pickGender('female')} className={cx('rounded-lg px-3 py-1.5', gender === 'female' ? 'bg-cyan text-cyan-ink' : 'text-muted')}>
            Female
          </button>
        </div>
      </div>

      {/* AI key — optional; only AI-assisted exercise authoring needs it */}
      <div className="mt-4 rounded-2xl border border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm font-bold">AI key</p>
            <p className="truncate text-xs text-muted">
              {groqKey ? `Connected · ${maskKey(groqKey)}` : 'Not set — exercise checking is off'}
            </p>
          </div>
          <span
            className={cx(
              'rounded-full border px-2.5 py-1 text-[11px] font-bold',
              groqKey ? 'border-cyan/40 bg-cyan/[0.12] text-cyan' : 'border-line2 text-muted',
            )}
          >
            {groqKey ? 'Active' : 'Off'}
          </span>
        </div>

        {keyOpen ? (
          <div className="mt-3 flex flex-col gap-2">
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="gsk_…"
              autoComplete="off"
              aria-label="Groq API key"
              className={cx(
                'min-h-[44px] rounded-xl border bg-panel2 px-3 text-sm outline-none focus:ring-2 focus:ring-cyan/50 placeholder:text-muted',
                keyErr ? 'border-bad' : 'border-line2',
              )}
            />
            {keyErr ? (
              <p role="alert" className="text-xs font-semibold text-bad">{keyErr}</p>
            ) : (
              <p className="text-[11px] leading-snug text-muted">
                Stored on your account, so it works on every device you sign in on.
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => { setKeyOpen(false); setKeyErr(null); setKeyDraft('') }}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={!keyDraft.trim() || keyBusy} onClick={saveKey}>
                {keyBusy ? 'Checking…' : 'Save key'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="mt-3 w-full" onClick={() => setKeyOpen(true)}>
            {groqKey ? 'Replace key' : 'Add Groq API key'}
          </Button>
        )}
      </div>

      {/* Custom exercises — one button; everything else moved into the guided flow */}
      <div className="mt-4 rounded-2xl border border-line px-4 py-3">
        <div className="flex items-center">
          <p className="flex-1 font-heading text-sm font-bold">Custom exercises</p>
          <span className="text-xs text-muted">{custom.length}</span>
        </div>
        {custom.length === 0 ? (
          <p className="mt-2 text-xs leading-snug text-muted">
            Anything the catalogue is missing — add it once and it shows up in that muscle group from then on.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            {custom.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {CATALOG.find((x) => x.key === c.category_key)?.title}{c.target ? ` · ${c.target}` : ''}
                  </span>
                </span>
                <button
                  onClick={async () => { await deleteCustom(c.id); await refresh() }}
                  aria-label={`Delete ${c.name}`}
                  className="shrink-0 p-1 text-muted transition hover:text-bad"
                >
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <Button className="mt-3 w-full" onClick={() => setAdding(true)}>
          <span className="flex items-center justify-center gap-2"><IconPlus size={17} /> Add Exercise</span>
        </Button>
      </div>

      <AddExercise open={adding} onClose={() => setAdding(false)} onSaved={refresh} />

      <Button variant="outline" className="mt-4 w-full" onClick={exportData}>
        Export data
      </Button>

      <Button variant="danger" className="mt-4 w-full" onClick={() => signOut()}>
        <IconLogout size={18} /> Sign out
      </Button>
    </Modal>
  )
}
