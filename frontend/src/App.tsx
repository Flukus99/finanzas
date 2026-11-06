import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from 'react'
import { Accounts } from './components/Accounts'
import { Analysis } from './components/Analysis'
import { Debts } from './components/Debts'
import { Fixed } from './components/Fixed'
import { Home } from './components/Home'
import { CalendarIcon, CardIcon, ChartIcon, GearIcon, HomeIcon, ListIcon, PigIcon, PlusIcon, WalletIcon } from './components/Icons'
import { Login } from './components/Login'
import { Movements } from './components/Movements'
import { Onboarding } from './components/Onboarding'
import { MoveSheet, Savings } from './components/Savings'
import { Settings, SyncDot, SyncText } from './components/Settings'
import { TxSheet } from './components/Tx'
import { db, type Tx } from './lib/db'
import { useAllTx, useGoals, useSyncStatus, useUser } from './lib/hooks'
import { goalSaved } from './lib/recurring'
import { startSync } from './lib/sync'

export type Tab = 'inicio' | 'movimientos' | 'fijos' | 'deudas' | 'ahorros' | 'analisis' | 'cuentas' | 'ajustes'
type IconT = ComponentType<SVGProps<SVGSVGElement>>
const TABS: { id: Tab; label: string; Icon: IconT }[] = [
  { id: 'inicio', label: 'Inicio', Icon: HomeIcon },
  { id: 'movimientos', label: 'Movimientos', Icon: ListIcon },
  { id: 'fijos', label: 'Fijos', Icon: CalendarIcon },
  { id: 'deudas', label: 'Deudas', Icon: CardIcon },
  { id: 'ahorros', label: 'Ahorros', Icon: PigIcon },
  { id: 'analisis', label: 'Análisis', Icon: ChartIcon },
  { id: 'cuentas', label: 'Cuentas', Icon: WalletIcon },
  { id: 'ajustes', label: 'Ajustes', Icon: GearIcon },
]
// En el celular: 4 pestañas + el botón "+" al centro. Movimientos, Análisis, Cuentas y Ajustes van arriba.
const MOBILE: Tab[] = ['inicio', 'fijos', 'deudas', 'ahorros']
const HEADER: Tab[] = ['movimientos', 'analisis', 'cuentas', 'ajustes']
export type NewKind = 'gasto' | 'ingreso' | 'transferencia'
type NewTx = { new: NewKind }

export default function App() {
  const user = useUser()
  useEffect(() => { if (user) startSync() }, [user])
  if (!user) return <Login />
  return <Gate />
}

// Espera a tener los datos del servidor y obliga a configurar dinero e ingresos.
function Gate() {
  const ready = useLiveQuery(async () => (await db.meta.get('ready'))?.value === '1', [])
  const incomes = useLiveQuery(() => db.recurring.filter((r) => !r.deleted && r.kind === 'ingreso').count(), [])
  const sync = useSyncStatus()
  const [skip, setSkip] = useState(false)

  if (ready === undefined || incomes === undefined) return null
  if (!ready && !skip) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="space-y-3">
          <img src="/icon.svg" alt="" className="mx-auto h-14 w-14 animate-pulse" />
          <p className="text-[15px] text-muted">{sync.state === 'offline' || sync.state === 'error' ? 'No se pudo conectar con el servidor.' : 'Cargando tus datos…'}</p>
          {(sync.state === 'offline' || sync.state === 'error') && <button className="btn-ghost" onClick={() => setSkip(true)}>Continuar sin conexión</button>}
        </div>
      </div>
    )
  }
  if (incomes === 0) return <Onboarding />
  return <Main />
}

function Main() {
  const [tab, setTab] = useState<Tab>('inicio')
  const [editing, setEditing] = useState<Tx | NewTx | null>(null)
  const user = useUser()

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === 'n' && !editing && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !document.querySelector('[role=dialog]')) setEditing({ new: 'gasto' })
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [editing])

  const go = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }) }
  const current = TABS.find((t) => t.id === tab)!

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1480px] md:gap-6 md:p-4">
      {/* ── PC: barra lateral flotante ── */}
      <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] w-64 shrink-0 flex-col rounded-[28px] bg-surface p-4 ring-1 ring-line md:flex" style={{ boxShadow: 'var(--shadow)' }}>
        <div className="mb-6 flex items-center gap-3 px-2 pt-1">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <div>
            <div className="text-[17px] leading-tight font-extrabold tracking-tight">Finanzas</div>
            <div className="text-[12px] text-muted">Tu dinero, en tus manos</div>
          </div>
        </div>
        <button className="btn-primary mb-5 w-full" onClick={() => setEditing({ new: 'gasto' })}>
          <PlusIcon width={18} height={18} />Nuevo movimiento
          <kbd className="ml-auto rounded-md bg-white/20 px-1.5 text-[11px] font-bold">N</kbd>
        </button>
        <nav className="flex flex-col gap-0.5" aria-label="Secciones">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14.5px] transition ${tab === id ? 'bg-accent/10 font-bold text-accent' : 'font-medium text-muted hover:bg-hover hover:text-ink'}`}>
              <Icon width={20} height={20} />{label}
              {tab === id && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <div className="rounded-2xl bg-fill-soft p-3 text-[12px] leading-snug text-muted">
            <div className="flex items-start gap-2"><span className="mt-1"><SyncDot /></span><span><SyncText /></span></div>
          </div>
          <div className="flex items-center gap-2.5 px-1">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-[14px] font-bold text-accent uppercase">{user?.email?.[0] ?? '?'}</div>
            <div className="min-w-0 truncate text-[13px] font-medium">{user?.email}</div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pt-[calc(.5rem+env(safe-area-inset-top))] pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:px-4 md:pt-4 md:pb-10 lg:px-6">
        {/* ── Celular: cabecera compacta ── */}
        <header className="sticky top-0 z-30 -mx-4 mb-2 flex items-center justify-between gap-2 bg-bg/80 px-4 pt-[env(safe-area-inset-top)] pb-1 backdrop-blur-xl md:hidden">
          <div className="flex min-w-0 items-center gap-2 py-2">
            <img src="/icon.svg" alt="" className="h-7 w-7 shrink-0" />
            <span className="truncate text-[12px] text-muted"><SyncDot /> <span className="ml-0.5"><SyncText short /></span></span>
          </div>
          <div className="flex shrink-0">
            {HEADER.map((id) => {
              const t = TABS.find((x) => x.id === id)!
              return (
                <button key={id} aria-label={t.label} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}
                  className={`grid h-11 w-11 place-items-center rounded-full transition active:scale-95 ${tab === id ? 'bg-accent/12 text-accent' : 'text-muted'}`}>
                  <t.Icon width={21} height={21} />
                </button>
              )
            })}
          </div>
        </header>

        <div key={tab} className="page-enter" aria-label={current.label}>
          {tab === 'inicio' && <Home onEdit={setEditing} onNew={(k) => setEditing({ new: k })} go={go} />}
          {tab === 'movimientos' && <Movements onEdit={setEditing} />}
          {tab === 'fijos' && <Fixed onEditTx={setEditing} />}
          {tab === 'deudas' && <Debts onEditTx={setEditing} />}
          {tab === 'ahorros' && <Savings />}
          {tab === 'analisis' && <Analysis onEdit={setEditing} />}
          {tab === 'cuentas' && <Accounts />}
          {tab === 'ajustes' && <Settings />}
        </div>
      </main>

      {/* ── Celular: barra inferior flotante ── */}
      <nav aria-label="Secciones" className="fixed inset-x-3 bottom-[calc(.6rem+env(safe-area-inset-bottom))] z-40 rounded-[26px] bg-surface/85 p-1.5 ring-1 ring-line backdrop-blur-2xl md:hidden" style={{ boxShadow: '0 12px 32px -8px rgb(0 0 0 / .25)' }}>
        <div className="grid grid-cols-5 items-center">
          {MOBILE.slice(0, 2).map((id) => <TabButton key={id} tab={TABS.find((t) => t.id === id)!} active={tab === id} onClick={() => go(id)} />)}
          <div className="grid place-items-center">
            <button onClick={() => setEditing({ new: 'gasto' })} aria-label="Nuevo movimiento"
              className="grid h-13 w-13 place-items-center rounded-[20px] bg-accent text-on-accent shadow-[0_8px_20px_-6px_var(--brand)] transition active:scale-90">
              <PlusIcon width={26} height={26} strokeWidth={2.4} />
            </button>
          </div>
          {MOBILE.slice(2).map((id) => <TabButton key={id} tab={TABS.find((t) => t.id === id)!} active={tab === id} onClick={() => go(id)} />)}
        </div>
      </nav>

      {editing && <EditTx tx={'new' in editing ? undefined : editing} kind={'new' in editing ? editing.new : undefined} onClose={() => setEditing(null)} />}
    </div>
  )
}

// Abre el editor que corresponde: los abonos/retiros de ahorros tienen el suyo.
function EditTx({ tx, kind, onClose }: { tx?: Tx; kind?: NewKind; onClose: () => void }) {
  const goals = useGoals()
  const txs = useAllTx()
  const saved = useMemo(() => goalSaved(txs), [txs])
  if (tx && (tx.kind === 'ahorro' || tx.kind === 'retiro')) {
    const goal = goals.find((g) => g.id === tx.goal)
    if (!goal) return null
    return <MoveSheet goal={goal} dir={tx.kind} have={saved.get(goal.id) ?? 0} tx={tx} onClose={onClose} />
  }
  return <TxSheet tx={tx} initialKind={kind} onClose={onClose} />
}

function TabButton({ tab: { label, Icon }, active, onClick }: { tab: { label: string; Icon: IconT }; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-current={active ? 'page' : undefined}
      className={`flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[10.5px] font-semibold transition active:scale-95 ${active ? 'text-accent' : 'text-muted'}`}>
      <span className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? 'bg-accent/12' : ''}`}><Icon width={22} height={22} /></span>
      {label}
    </button>
  )
}
