import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight, Check, ChevronRight, CircleHelp, Clipboard, Clock3, Download,
  Droplets, Dumbbell, Flame, MoreHorizontal, Pencil, Plane, Plus, RotateCcw,
  Sparkles, Sun, Target, Upload, X, Zap,
} from 'lucide-react'
import './App.css'

type Status = 'planned' | 'done' | 'partial' | 'rest' | 'missed'
type Exercise = { name: string; sets: number; reps: string; weight?: string }
type Session = {
  id: string; title: string; focus: string; duration: number
  intensity: 'Low' | 'Moderate' | 'High'; exercises: Exercise[]
}
type Workout = {
  id: string; day: string; shortDay: string; date: string; title: string; focus: string
  duration: number; intensity: 'Low' | 'Moderate' | 'High'; status: Status
  exercises: Exercise[]; additional?: Session[]; note?: string
}

const STORAGE_KEY = 'kinetic-training-v1'
const seedWorkouts: Workout[] = [
  { id: 'mon', day: 'Monday', shortDay: 'MON', date: '28', title: 'Push Power', focus: 'Chest · Shoulders · Triceps', duration: 65, intensity: 'High', status: 'done', exercises: [
    { name: 'Barbell Bench Press', sets: 4, reps: '6–8', weight: '80 kg' }, { name: 'Incline Dumbbell Press', sets: 3, reps: '8–10', weight: '28 kg' }, { name: 'Cable Lateral Raise', sets: 4, reps: '12–15' }, { name: 'Triceps Pushdown', sets: 3, reps: '10–12' },
  ], additional: [{ id: 'mon-run', title: 'Easy Run', focus: 'Zone 2 · Outdoors', duration: 25, intensity: 'Low', exercises: [{ name: 'Easy Run', sets: 1, reps: '25 min' }] }] },
  { id: 'tue', day: 'Tuesday', shortDay: 'TUE', date: '29', title: 'Pull Strength', focus: 'Back · Biceps', duration: 70, intensity: 'High', status: 'partial', exercises: [
    { name: 'Weighted Pull-ups', sets: 4, reps: '5–7', weight: '+10 kg' }, { name: 'Barbell Row', sets: 4, reps: '6–8', weight: '70 kg' }, { name: 'Face Pull', sets: 3, reps: '15–20' }, { name: 'Hammer Curl', sets: 3, reps: '10–12' },
  ], note: 'Short on time — skipped final curls.' },
  { id: 'wed', day: 'Wednesday', shortDay: 'WED', date: '30', title: 'Active Recovery', focus: 'Mobility · Core · Walk', duration: 35, intensity: 'Low', status: 'rest', exercises: [
    { name: 'Hip Mobility Flow', sets: 2, reps: '8 min' }, { name: 'Dead Bug', sets: 3, reps: '10 / side' }, { name: 'Easy Walk', sets: 1, reps: '20 min' },
  ] },
  { id: 'thu', day: 'Thursday', shortDay: 'THU', date: '31', title: 'Leg Day', focus: 'Quads · Hamstrings · Calves', duration: 75, intensity: 'High', status: 'planned', exercises: [
    { name: 'Back Squat', sets: 4, reps: '5–7', weight: '100 kg' }, { name: 'Romanian Deadlift', sets: 4, reps: '8–10', weight: '80 kg' }, { name: 'Bulgarian Split Squat', sets: 3, reps: '10 / side' }, { name: 'Standing Calf Raise', sets: 4, reps: '12–15' },
  ] },
  { id: 'fri', day: 'Friday', shortDay: 'FRI', date: '01', title: 'Upper Volume', focus: 'Upper body · Hypertrophy', duration: 60, intensity: 'Moderate', status: 'planned', exercises: [
    { name: 'Dumbbell Bench Press', sets: 3, reps: '10–12' }, { name: 'Lat Pulldown', sets: 3, reps: '10–12' }, { name: 'Seated Shoulder Press', sets: 3, reps: '8–10' }, { name: 'EZ Bar Curl', sets: 3, reps: '12–15' },
  ] },
  { id: 'sat', day: 'Saturday', shortDay: 'SAT', date: '02', title: 'Conditioning', focus: 'Zone 2 · Intervals', duration: 45, intensity: 'Moderate', status: 'planned', exercises: [
    { name: 'Easy Run', sets: 1, reps: '30 min' }, { name: 'Bike Sprints', sets: 6, reps: '30 sec' }, { name: 'Cooldown Walk', sets: 1, reps: '8 min' },
  ] },
  { id: 'sun', day: 'Sunday', shortDay: 'SUN', date: '03', title: 'Full Rest', focus: 'Recover · Reset', duration: 0, intensity: 'Low', status: 'planned', exercises: [] },
]

const statusInfo: Record<Status, { label: string; hint: string }> = {
  planned: { label: 'Planned', hint: 'Still ahead' }, done: { label: 'Completed', hint: 'Full session' },
  partial: { label: 'Modified', hint: 'Lower volume' }, rest: { label: 'Rest day', hint: 'Recovery first' },
  missed: { label: 'Missed', hint: 'Did not train' },
}

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored) as { workouts: Workout[]; water: number; reminderMinutes?: number; reminderOn?: boolean }
  } catch { /* fall back to starter data */ }
  return { workouts: seedWorkouts, water: 5, reminderMinutes: 60, reminderOn: false }
}

function App() {
  const initial = useMemo(loadData, [])
  const [workouts, setWorkouts] = useState<Workout[]>(initial.workouts)
  const [water, setWater] = useState(initial.water)
  const [reminderMinutes, setReminderMinutes] = useState(initial.reminderMinutes ?? 60)
  const [reminderOn, setReminderOn] = useState(initial.reminderOn ?? false)
  const [selected, setSelected] = useState<Workout | null>(null)
  const [editing, setEditing] = useState<Workout | null>(null)
  const [swapFrom, setSwapFrom] = useState<string | null>(null)
  const [showData, setShowData] = useState(false)
  const [toast, setToast] = useState('')
  const [importText, setImportText] = useState('')
  const [now, setNow] = useState(() => new Date())
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ workouts, water, reminderMinutes, reminderOn }))
  }, [workouts, water, reminderMinutes, reminderOn])
  useEffect(() => {
    if (!reminderOn) return
    const timer = window.setInterval(() => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Time to hydrate', { body: 'Take a moment and drink a glass of water.' })
      } else {
        setToast('Time to drink some water')
      }
    }, reminderMinutes * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [reminderOn, reminderMinutes])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const completed = workouts.filter((w) => w.status === 'done').length
  const partial = workouts.filter((w) => w.status === 'partial').length
  const adherence = Math.round(((completed + partial * .6) / Math.max(1, workouts.filter((w) => w.title !== 'Full Rest').length)) * 100)
  const vacationCountdown = useMemo(() => {
    const target = new Date(2026, 8, 9, 0, 0, 0)
    const diff = Math.max(0, target.getTime() - now.getTime())
    const totalHours = Math.floor(diff / 3_600_000)
    return {
      weeks: Math.floor(totalHours / 168),
      days: Math.floor((totalHours % 168) / 24),
      hours: totalHours % 24,
      totalDays: Math.ceil(diff / 86_400_000),
      progress: Math.min(100, Math.max(0, ((now.getTime() - new Date(2026, 6, 28).getTime()) / (target.getTime() - new Date(2026, 6, 28).getTime())) * 100)),
    }
  }, [now])

  const updateStatus = (id: string, status: Status) => {
    setWorkouts((current) => current.map((w) => w.id === id ? { ...w, status } : w))
    setSelected((current) => current?.id === id ? { ...current, status } : current)
    setToast(`Day marked as ${statusInfo[status].label.toLowerCase()}`)
  }

  const handleCardClick = (workout: Workout) => {
    if (swapFrom) {
      if (swapFrom === workout.id) { setSwapFrom(null); return }
      setWorkouts((current) => {
        const source = current.find((w) => w.id === swapFrom)!
        return current.map((w) => {
          const fields = (from: Workout) => ({ title: from.title, focus: from.focus, duration: from.duration, intensity: from.intensity, exercises: from.exercises, additional: from.additional })
          if (w.id === swapFrom) return { ...w, ...fields(workout) }
          if (w.id === workout.id) return { ...w, ...fields(source) }
          return w
        })
      })
      setSwapFrom(null); setToast('Training days swapped'); return
    }
    setSelected(workout)
  }

  const saveEdit = (workout: Workout) => {
    setWorkouts((current) => current.map((w) => w.id === workout.id ? workout : w))
    setSelected(workout); setEditing(null); setToast('Workout updated')
  }

  const exportPlan = () => {
    const blob = new Blob([JSON.stringify({ app: 'Kinetic', version: 1, workouts }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'kinetic-training-plan.json'; anchor.click(); URL.revokeObjectURL(url)
    setToast('Plan exported')
  }

  const importPlan = (raw: string) => {
    try {
      const parsed = JSON.parse(raw); const list = Array.isArray(parsed) ? parsed : parsed.workouts
      if (!Array.isArray(list) || list.length !== 7) throw new Error('Plan must contain 7 days')
      setWorkouts(list); setImportText(''); setShowData(false); setToast('New training plan imported')
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not import that plan') }
  }

  const copyGeminiPrompt = async () => {
    const prompt = `Create a 7-day training plan for me. Return ONLY valid JSON matching this exact schema and keep id, day, shortDay, and date values unchanged. Status must be "planned". Exercises need name, sets (number), reps (string), and optional weight (string). A day can contain multiple trainings: use the optional "additional" array for second sessions such as running plus gym.\n\nUse this current plan as the formatting example:\n${JSON.stringify({ workouts }, null, 2)}`
    await navigator.clipboard.writeText(prompt); setToast('Gemini prompt copied')
  }

  const toggleReminder = async () => {
    if (reminderOn) {
      setReminderOn(false); setToast('Hydration reminders paused'); return
    }
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      if (permission === 'denied') setToast('Browser notifications are blocked; reminders will show in the app')
    }
    setReminderOn(true); setToast(`Hydration reminder set for every ${reminderMinutes} minutes`)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Zap size={18} fill="currentColor" /></span><span>KINETIC</span></div>
      </header>

      <main>
        <section className="vacation-hero">
          <div className="sun-orbit"><Sun size={27} /></div>
          <div className="vacation-copy">
            <div className="vacation-kicker"><Plane size={15} /> ROAD TO VACATION · 09.09.2026</div>
            <h1>Your strongest<br />summer starts now.</h1>
            <p>Every session is a vote for the version of you stepping onto that beach.</p>
            <div className="journey-progress">
              <div><span>FITNESS SPRINT</span><strong>{Math.round(vacationCountdown.progress)}% complete</strong></div>
              <div className="journey-track"><i style={{ width: `${vacationCountdown.progress}%` }} /></div>
            </div>
          </div>
          <div className="countdown-panel">
            <span className="countdown-label">TAKEOFF IN</span>
            <div className="countdown-grid">
              <div><strong>{String(vacationCountdown.weeks).padStart(2, '0')}</strong><span>WEEKS</span></div>
              <i>:</i>
              <div><strong>{String(vacationCountdown.days).padStart(2, '0')}</strong><span>DAYS</span></div>
              <i>:</i>
              <div><strong>{String(vacationCountdown.hours).padStart(2, '0')}</strong><span>HOURS</span></div>
            </div>
            <div className="countdown-note"><Sparkles size={14} /><span><strong>{vacationCountdown.totalDays} days to transform</strong>Stay consistent. The results will follow.</span></div>
            <button className="vacation-import" onClick={() => setShowData(true)}><Upload size={15} /> Import training plan</button>
          </div>
        </section>

        <div className="section-heading"><div><span>YOUR TRAINING</span><h2>Make this week count.</h2></div><p>Click any day to log, edit, or add another training.</p></div>

        <section className="planner">
          <div className="planner-head">
            <div className="week-nav"><div><span>THIS WEEK</span><strong>JUL 28 — AUG 03</strong></div></div>
            <div className="planner-tools">{swapFrom && <span className="swap-hint">Choose another day to swap</span>}<button className={`button compact ${swapFrom ? 'swap-active' : 'ghost'}`} onClick={() => setSwapFrom(swapFrom ? null : 'choose')}><ArrowLeftRight size={16} /> Swap days</button><button className="icon-button" onClick={exportPlan} title="Export plan"><Download size={18} /></button><button className="icon-button" onClick={() => setShowData(true)} title="Plan settings"><MoreHorizontal size={20} /></button></div>
          </div>
          <div className="status-legend">{(['done', 'partial', 'rest', 'missed', 'planned'] as Status[]).map((status) => <span key={status}><i className={status} />{statusInfo[status].label}</span>)}</div>
          <div className="week-grid">
            {workouts.map((workout) => (
              <article className={`day-card status-${workout.status} ${swapFrom === workout.id ? 'selected-swap' : ''}`} key={workout.id} onClick={() => swapFrom === 'choose' ? setSwapFrom(workout.id) : handleCardClick(workout)}>
                <div className="day-head"><div><span>{workout.shortDay}</span><strong>{workout.date}</strong></div><span className={`status-pill ${workout.status}`}>{workout.status === 'done' && <Check size={13} />}{workout.status === 'partial' && <Flame size={13} />}{workout.status === 'rest' && <RotateCcw size={13} />}{statusInfo[workout.status].label}</span></div>
                <div className="workout-body">
                  <span className="workout-index">PRIMARY</span><h3>{workout.title}</h3><p>{workout.focus}</p>
                  <div className="workout-meta"><span><Clock3 size={14} /> {workout.duration || '—'} min</span><span><Zap size={14} /> {workout.intensity}</span></div>
                  {workout.additional?.map((session) => <div className="extra-session" key={session.id}><Dumbbell size={13} /><span><strong>{session.title}</strong><small>{session.duration} min · {session.focus}</small></span></div>)}
                </div>
                <div className="card-footer"><span>{1 + (workout.additional?.length ?? 0)} training{workout.additional?.length ? 's' : ''}</span><button aria-label={`Open ${workout.day}`}><ChevronRight size={17} /></button></div>
              </article>
            ))}
          </div>
        </section>

        <section className="overview-grid simple">
          <div className="stat-card"><span className="stat-icon green"><Target size={20} /></span><div><span className="stat-label">WEEKLY ADHERENCE</span><strong>{adherence}%</strong></div><div className="mini-ring" style={{ '--value': `${adherence * 3.6}deg` } as React.CSSProperties}><span>{completed + partial}</span><small>/6</small></div></div>
          <div className="stat-card hydration">
            <span className="stat-icon blue"><Droplets size={20} /></span>
            <div><span className="stat-label">HYDRATION</span><strong>{(water * .35).toFixed(1)}<small> / 2.8 L</small></strong></div>
            <div className="reminder-controls">
              <label>REMIND EVERY<select value={reminderMinutes} onChange={(e) => setReminderMinutes(Number(e.target.value))}><option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 hour</option><option value={90}>90 min</option><option value={120}>2 hours</option></select></label>
              <button className={`reminder-toggle ${reminderOn ? 'on' : ''}`} onClick={toggleReminder}>{reminderOn ? 'On' : 'Off'}</button>
              <button className="water-add" onClick={() => setWater((v) => Math.min(8, v + 1))}><Plus size={16} /> Glass</button>
            </div>
            <div className="water-dots">{Array.from({ length: 8 }, (_, i) => <i key={i} className={i < water ? 'filled' : ''} />)}</div>
          </div>
        </section>
      </main>

      <footer><span><Zap size={14} fill="currentColor" /> KINETIC</span><p>Your data lives only in this browser.</p><button onClick={() => setShowData(true)}><CircleHelp size={14} /> Data & backup</button></footer>

      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <aside className="workout-drawer" onMouseDown={(e) => e.stopPropagation()}>
            <div className="drawer-top"><div><span className="eyebrow-text">{selected.day} · {selected.duration} MIN</span><h2>{selected.title}</h2><p>{selected.focus}</p></div><button className="icon-button" onClick={() => setSelected(null)}><X size={20} /></button></div>
            <div className="status-picker"><span>HOW DID IT GO?</span><div>{(['done', 'partial', 'rest', 'missed'] as Status[]).map((status) => (
              <button key={status} className={selected.status === status ? `active ${status}` : ''} onClick={() => updateStatus(selected.id, status)}>
                {status === 'done' && <Check size={17} />}{status === 'partial' && <Flame size={17} />}{status === 'rest' && <RotateCcw size={17} />}{status === 'missed' && <X size={17} />}<span>{statusInfo[status].label}<small>{statusInfo[status].hint}</small></span>
              </button>
            ))}</div></div>
            <div className="exercise-list"><div className="section-title"><span>EXERCISES</span><strong>{selected.exercises.length} movements</strong></div>
              {selected.exercises.length ? selected.exercises.map((exercise, i) => <div className="exercise-row" key={`${exercise.name}-${i}`}><span className="exercise-number">{String(i + 1).padStart(2, '0')}</span><div><strong>{exercise.name}</strong><small>{exercise.sets} sets × {exercise.reps}</small></div>{exercise.weight && <span className="weight">{exercise.weight}</span>}</div>) : <div className="rest-message"><RotateCcw size={24} /><strong>Recovery is training, too.</strong><span>Rest, refuel, and come back stronger.</span></div>}
            </div>
            {!!selected.additional?.length && <div className="additional-list">
              <div className="section-title"><span>ADDITIONAL TRAINING</span><strong>{selected.additional.length} session{selected.additional.length > 1 ? 's' : ''}</strong></div>
              {selected.additional.map((session) => <div className="additional-row" key={session.id}><span className="stat-icon purple"><Dumbbell size={17} /></span><div><strong>{session.title}</strong><small>{session.focus} · {session.duration} min · {session.intensity}</small></div></div>)}
            </div>}
            {selected.note && <div className="note"><Sparkles size={17} /><span><strong>Session note</strong>{selected.note}</span></div>}
            <button className="button primary full" onClick={() => setEditing({ ...selected })}><Pencil size={17} /> Adjust day & trainings</button>
          </aside>
        </div>
      )}

      {editing && <EditModal workout={editing} onSave={saveEdit} onClose={() => setEditing(null)} />}
      {showData && (
        <div className="modal-backdrop centered" onMouseDown={() => setShowData(false)}>
          <div className="data-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-title"><div><span className="stat-icon purple"><Sparkles size={19} /></span><div><h2>Import your plan</h2><p>Paste JSON from Gemini or upload a backup.</p></div></div><button className="icon-button" onClick={() => setShowData(false)}><X size={20} /></button></div>
            <div className="ai-callout"><Sparkles size={20} /><div><strong>Generate with Gemini</strong><p>Copy a ready-made prompt that teaches Gemini the exact format Kinetic understands.</p></div><button className="button ghost compact" onClick={copyGeminiPrompt}><Clipboard size={15} /> Copy prompt</button></div>
            <label className="textarea-label">PASTE PLAN JSON<textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'{\n  "workouts": [ ... ]\n}'} /></label>
            <div className="data-actions"><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) file.text().then(importPlan) }} /><button className="button ghost" onClick={() => fileRef.current?.click()}><Upload size={17} /> Upload backup</button><button className="button ghost" onClick={exportPlan}><Download size={17} /> Export current</button><button className="button primary" disabled={!importText.trim()} onClick={() => importPlan(importText)}>Import plan</button></div>
            <p className="privacy-note">No account. No database. Everything is stored locally in your browser.</p>
          </div>
        </div>
      )}
      {toast && <div className="toast"><Check size={17} /> {toast}</div>}
    </div>
  )
}

function EditModal({ workout, onSave, onClose }: { workout: Workout; onSave: (w: Workout) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(workout)
  const updateExercise = (index: number, field: keyof Exercise, value: string | number) => setDraft((current) => ({ ...current, exercises: current.exercises.map((e, i) => i === index ? { ...e, [field]: value } : e) }))
  const updateSession = (id: string, field: keyof Session, value: string | number) => setDraft((current) => ({
    ...current, additional: (current.additional ?? []).map((session) => session.id === id ? { ...session, [field]: value } : session),
  }))
  return (
    <div className="modal-backdrop centered" onMouseDown={onClose}>
      <div className="edit-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-title"><div><span className="stat-icon green"><Dumbbell size={19} /></span><div><h2>Adjust training day</h2><p>Set a primary workout and any additional sessions.</p></div></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>
        <div className="form-grid"><label>WORKOUT NAME<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label>FOCUS<input value={draft.focus} onChange={(e) => setDraft({ ...draft, focus: e.target.value })} /></label><label>DURATION (MIN)<input type="number" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })} /></label><label>INTENSITY<select value={draft.intensity} onChange={(e) => setDraft({ ...draft, intensity: e.target.value as Workout['intensity'] })}><option>Low</option><option>Moderate</option><option>High</option></select></label></div>
        <div className="section-title"><span>EXERCISES</span><button onClick={() => setDraft({ ...draft, exercises: [...draft.exercises, { name: 'New exercise', sets: 3, reps: '8–10' }] })}><Plus size={14} /> Add exercise</button></div>
        <div className="edit-exercises">{draft.exercises.map((exercise, index) => <div key={index}><span>{String(index + 1).padStart(2, '0')}</span><input value={exercise.name} onChange={(e) => updateExercise(index, 'name', e.target.value)} /><input type="number" value={exercise.sets} onChange={(e) => updateExercise(index, 'sets', Number(e.target.value))} /><input value={exercise.reps} onChange={(e) => updateExercise(index, 'reps', e.target.value)} /><button onClick={() => setDraft({ ...draft, exercises: draft.exercises.filter((_, i) => i !== index) })}><X size={16} /></button></div>)}</div>
        <div className="section-title additional-title"><span>ADDITIONAL TRAININGS</span><button onClick={() => setDraft({ ...draft, additional: [...(draft.additional ?? []), { id: crypto.randomUUID(), title: 'Second training', focus: 'Running, gym, mobility…', duration: 30, intensity: 'Moderate', exercises: [] }] })}><Plus size={14} /> Add training</button></div>
        <div className="edit-sessions">
          {(draft.additional ?? []).map((session, index) => <div className="edit-session" key={session.id}>
            <div className="edit-session-head"><span>SESSION {index + 2}</span><button onClick={() => setDraft({ ...draft, additional: draft.additional?.filter((item) => item.id !== session.id) })}><X size={15} /> Remove</button></div>
            <div className="form-grid"><label>TRAINING NAME<input value={session.title} onChange={(e) => updateSession(session.id, 'title', e.target.value)} /></label><label>FOCUS<input value={session.focus} onChange={(e) => updateSession(session.id, 'focus', e.target.value)} /></label><label>DURATION (MIN)<input type="number" value={session.duration} onChange={(e) => updateSession(session.id, 'duration', Number(e.target.value))} /></label><label>INTENSITY<select value={session.intensity} onChange={(e) => updateSession(session.id, 'intensity', e.target.value)}><option>Low</option><option>Moderate</option><option>High</option></select></label></div>
          </div>)}
          {!draft.additional?.length && <button className="empty-session" onClick={() => setDraft({ ...draft, additional: [{ id: crypto.randomUUID(), title: 'Second training', focus: 'Running, gym, mobility…', duration: 30, intensity: 'Moderate', exercises: [] }] })}><Plus size={18} /><span><strong>Add another training</strong><small>Running + gym, cycling + mobility, and more</small></span></button>}
        </div>
        <div className="modal-footer"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" onClick={() => onSave(draft)}><Check size={17} /> Save changes</button></div>
      </div>
    </div>
  )
}

export default App
