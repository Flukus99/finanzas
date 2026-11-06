import { useMemo, useState, type ReactNode } from 'react'
import type { NewKind, Tab } from '../App'
import type { Debt, Recurring, Tx } from '../lib/db'
import { debtStats } from '../lib/debts'
import { money, thisMonth, today, ymd } from '../lib/format'
import { gmfMap, needsGmfSetup } from '../lib/gmf'
import { balances, sortTx, txSign, useAccounts, useAllTx, useCategories, useDebts, useGmf, useGoals, useMonthTx, useRecurring } from '../lib/hooks'
import { goalSaved, paidMap, type Occ } from '../lib/recurring'
import { isCard } from '../lib/cards'
import { CardPaySheet } from './Debts'
import { FixedRow, PaySheet, upcoming, type Upcoming } from './Fixed'
import { ArrowDownIcon, ArrowUpIcon, ChevronRight, LandmarkIcon, SwapIcon } from './Icons'
import { TxRow } from './Tx'
import { CategoryBadge, Empty, MonthPicker } from './ui'

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches' }

export function Home({ onEdit, onNew, go }: { onEdit: (t: Tx) => void; onNew: (k: NewKind) => void; go: (t: Tab) => void }) {
  const [month, setMonth] = useState(thisMonth())
  const [paying, setPaying] = useState<{ r: Recurring; occ: Occ; debt?: Debt; n?: number | null } | null>(null)
  const accounts = useAccounts()
  const categories = useCategories()
  const goals = useGoals()
  const recurring = useRecurring()
  const debts = useDebts()
  const all = useAllTx()
  const txs = useMonthTx(month)
  const { tax } = useGmf()

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const goalMap = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals])
  const bal = useMemo(() => balances(accounts, all), [accounts, all])
  const total = [...bal.values()].reduce((a, b) => a + b, 0)
  const savedMap = useMemo(() => goalSaved(all), [all])
  const savedTotal = [...savedMap.values()].reduce((a, b) => a + b, 0)
  const owed = debts.reduce((a, d) => a + debtStats(d, all).owed, 0)
  const next: Upcoming[] = useMemo(() => upcoming(recurring, paidMap(all), 15, { debts, txs: all, categories }), [recurring, all, debts, categories])
  // Lo que va a salir de tus cuentas: los cargos a tarjeta salen cuando pagas la tarjeta.
  const nextTotal = next.filter((x) => x.r.kind === 'gasto' && !x.r.card).reduce((a, x) => a + x.r.amount, 0)
  const trend = useMemo(() => balanceTrend(accounts, all, total), [accounts, all, total])

  const sum = (k: Tx['kind']) => txs.filter((t) => t.kind === k).reduce((a, t) => a + t.amount, 0)
  const monthGmf = txs.reduce((a, t) => a + (tax.get(t.id) ?? 0), 0)
  const income = sum('ingreso'), expense = sum('gasto') + monthGmf, saved = sum('ahorro') - sum('retiro')
  const pendingGmf = accounts.filter(needsGmfSetup)

  const byCat = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of txs) if (t.kind === 'gasto') m.set(t.category, (m.get(t.category) ?? 0) + t.amount)
    if (monthGmf) m.set('__gmf', monthGmf)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [txs, monthGmf])
  const maxCat = byCat[0]?.[1] ?? 1
  const recent = sortTx(txs).slice(0, 6)
  const delta = trend.length > 1 ? total - trend[0] : 0

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <p className="text-[14px] font-medium text-muted">{greeting()} · {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="page-title">Resumen</h1>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {pendingGmf.length > 0 && (
        <button onClick={() => go('cuentas')} className="card flex w-full items-center gap-3 p-4 text-left ring-warn/40 transition hover:ring-warn/70">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warn/12 text-warn"><LandmarkIcon width={20} height={20} /></span>
          <span className="min-w-0 flex-1 text-[14px]"><b>¿Tus cuentas pagan 4x1000?</b><br /><span className="text-muted">Configúralo en {pendingGmf.map((a) => a.name).join(', ')} para que los saldos sean exactos.</span></span>
          <ChevronRight width={18} height={18} className="text-faint" />
        </button>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:gap-5 xl:grid-cols-12">
        {/* Saldo */}
        <section className="hero p-5 md:col-span-6 md:p-7 xl:col-span-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[13px] font-semibold text-white/60">Disponible en cuentas</div>
              <div className="num mt-1 text-[40px] leading-none font-extrabold tracking-[-0.035em] md:text-[56px]">{money(total)}</div>
              {trend.length > 1 && delta !== 0 && (
                <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold ${delta > 0 ? 'bg-lime/15 text-lime' : 'bg-white/10 text-white/80'}`}>
                  {delta > 0 ? <ArrowUpIcon width={13} height={13} /> : <ArrowDownIcon width={13} height={13} />}{money(Math.abs(delta))} en 30 días
                </div>
              )}
            </div>
            <div className="hidden flex-col items-end gap-2 sm:flex">
              {savedTotal > 0 && <HeroChip label="Ahorros" value={money(savedTotal)} onClick={() => go('ahorros')} />}
              {owed > 0 && <HeroChip label="Debes" value={money(owed)} onClick={() => go('deudas')} />}
            </div>
          </div>
          <Sparkline values={trend} />
          <div className="mt-1 flex gap-2 sm:hidden">
            {savedTotal > 0 && <HeroChip label="Ahorros" value={money(savedTotal)} onClick={() => go('ahorros')} />}
            {owed > 0 && <HeroChip label="Debes" value={money(owed)} onClick={() => go('deudas')} />}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <QuickAction label="Gasto" onClick={() => onNew('gasto')} icon={<ArrowUpIcon width={18} height={18} />} />
            <QuickAction label="Ingreso" onClick={() => onNew('ingreso')} icon={<ArrowDownIcon width={18} height={18} />} />
            <QuickAction label="Transferir" onClick={() => onNew('transferencia')} icon={<SwapIcon width={18} height={18} />} />
          </div>
        </section>

        {/* Este mes */}
        <section className="card flex flex-col p-5 md:col-span-6 md:p-6 xl:col-span-5">
          <h2 className="text-[16px] font-bold">Este mes</h2>
          <p className="text-[13px] text-muted">{nextTotal > 0 ? <>Próximos 15 días: <b className="text-ink">{money(nextTotal)}</b> en pagos · te quedarían <b className={total - nextTotal < 0 ? 'text-neg' : 'text-ink'}>{money(total - nextTotal)}</b></> : 'Sin pagos pendientes en los próximos 15 días.'}</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Metric label="Ingresos" value={income} tone="pos" />
            <Metric label="Gastos" value={expense} tone="ink" />
            <Metric label="Ahorrado" value={saved} tone="accent" />
          </div>
          <IncomeBar income={income} expense={expense} saved={saved} />
        </section>

        {/* Próximos 15 días */}
        <Panel className="md:col-span-6 xl:col-span-5" title="Próximos 15 días" action="Ver fijos" onAction={() => go('fijos')} flush>
          {next.length === 0 && <Empty>Nada pendiente en los próximos 15 días.</Empty>}
          {next.slice(0, 5).map(({ r, occ, debt, n }) => (
            <FixedRow key={r.id + occ.key} r={r} occ={occ} annual={r.freq === 'anual'} extra={debt ? (isCard(debt) ? '💳 Pago de tarjeta' : n ? `Cuota ${n} de ${debt.installments}` : 'Deuda') : undefined}
              onPay={() => setPaying({ r, occ, debt, n })} onEdit={() => go(debt ? 'deudas' : 'fijos')} />
          ))}
        </Panel>

        {/* Categorías */}
        <Panel className="md:col-span-3 xl:col-span-4" title="En qué se va" action="Análisis" onAction={() => go('analisis')}>
          {byCat.length === 0 && <Empty>Sin gastos este mes.</Empty>}
          <div className="space-y-3.5">
            {byCat.slice(0, 6).map(([id, amount]) => {
              const c = id === '__gmf' ? { name: '4x1000', icon: '🏛️', color: '#b86e00' } : catMap.get(id)
              return (
                <div key={id} className="flex items-center gap-3">
                  <CategoryBadge icon={c?.icon} color={c?.color} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2 text-[13.5px]">
                      <span className="truncate font-semibold">{c?.name ?? 'Sin categoría'}</span>
                      <span className="num shrink-0 font-semibold">{money(amount)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-fill">
                      <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${(amount / maxCat) * 100}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        {/* Cuentas */}
        <Panel className="md:col-span-3 xl:col-span-3" title="Cuentas" action="Ver" onAction={() => go('cuentas')} flush>
          {accounts.map((a) => {
            const b = bal.get(a.id) ?? 0
            return (
              <button key={a.id} onClick={() => go('cuentas')} className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-hover">
                <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: a.color || 'var(--brand)' }} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{a.name}</span>
                <span className={`num text-[14px] font-bold ${b < 0 ? 'text-neg' : ''}`}>{money(b)}</span>
              </button>
            )
          })}
        </Panel>

        {/* Últimos movimientos */}
        <Panel className="md:col-span-6 xl:col-span-7" title="Últimos movimientos" action="Ver todos" onAction={() => go('movimientos')} flush>
          {recent.length === 0 && <Empty>Aún no hay movimientos este mes. Toca <b>+</b> para agregar el primero.</Empty>}
          <div className="divide-y divide-line">
            {recent.map((t) => <TxRow key={t.id} tx={t} cat={catMap.get(t.category)} acc={accMap.get(t.account)} goal={goalMap.get(t.goal ?? '')} to={accMap.get(t.to ?? '')} gmf={tax.get(t.id)} onClick={() => onEdit(t)} />)}
          </div>
        </Panel>

        {/* Metas */}
        <Panel className="md:col-span-6 xl:col-span-5" title="Metas de ahorro" action="Ahorros" onAction={() => go('ahorros')}>
          {goals.length === 0 && <Empty>Crea una meta: un colchón de emergencia, una moto, un viaje…</Empty>}
          <div className="space-y-4">
            {goals.slice(0, 4).map((g) => {
              const have = savedMap.get(g.id) ?? 0
              const pct = g.target ? Math.min(1, have / g.target) : 0
              return (
                <div key={g.id} className="flex items-center gap-3">
                  <Ring value={pct} color={g.color} label={g.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{g.name}</div>
                    <div className="num text-[12.5px] text-muted">{money(have)}{g.target ? ` de ${money(g.target)}` : ''}</div>
                  </div>
                  {g.target > 0 && <span className="num text-[13px] font-bold">{Math.round(pct * 100)}%</span>}
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      {paying?.debt && isCard(paying.debt) && <CardPaySheet card={paying.debt} pay={Number(paying.occ.key.slice(0, 4)) * 12 + Number(paying.occ.key.slice(5)) - 1} onClose={() => setPaying(null)} />}
      {paying && !(paying.debt && isCard(paying.debt)) && <PaySheet r={paying.r} occ={paying.occ} debt={paying.debt?.id}
        label={paying.debt && paying.n ? `Cuota ${paying.n} de ${paying.debt.installments}` : undefined} onClose={() => setPaying(null)} />}
    </div>
  )
}

export function Panel({ title, action, onAction, children, className = '', flush }: {
  title: string; action?: string; onAction?: () => void; children: ReactNode; className?: string; flush?: boolean
}) {
  return (
    <section className={`card flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
        <h2 className="text-[16px] font-bold">{title}</h2>
        {action && <button onClick={onAction} className="-mr-2 flex min-h-9 items-center gap-0.5 rounded-full px-2.5 text-[13px] font-semibold text-accent transition hover:bg-accent/10">{action}<ChevronRight width={15} height={15} /></button>}
      </div>
      <div className={flush ? 'pb-2' : 'px-5 pb-5'}>{children}</div>
    </section>
  )
}

function HeroChip({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-2xl bg-white/8 px-3 py-2 text-left ring-1 ring-white/10 backdrop-blur transition hover:bg-white/12 sm:text-right">
      <div className="text-[11px] font-semibold text-white/55">{label}</div>
      <div className="num text-[14px] font-bold">{value}</div>
    </button>
  )
}

function QuickAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 text-[14px] font-semibold ring-1 ring-white/10 transition hover:bg-white/15 active:scale-[.97]">
      <span className="text-lime">{icon}</span>{label}
    </button>
  )
}

// El punto de color enlaza cada cifra con su parte en la barra de abajo.
function Metric({ label, value, tone }: { label: string; value: number; tone: 'pos' | 'ink' | 'accent' }) {
  const dot = tone === 'pos' ? null : tone === 'accent' ? 'var(--brand)' : 'var(--ink)'
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">{dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}{label}</div>
      <div className={`num truncate text-[17px] font-extrabold md:text-[19px] ${tone === 'pos' ? 'text-pos' : 'text-ink'}`}>{money(value)}</div>
    </div>
  )
}

// Barra segmentada: de lo que entró este mes, cuánto se gastó, se ahorró y queda libre.
function IncomeBar({ income, expense, saved }: { income: number; expense: number; saved: number }) {
  if (income <= 0) return <p className="mt-auto pt-5 text-[12.5px] text-muted">Cuando registres ingresos verás aquí en qué se va cada peso.</p>
  const s = Math.max(0, saved), e = Math.min(expense, income)
  const free = Math.max(0, income - e - s)
  const parts = [
    { k: 'Gastado', v: e, c: 'var(--ink)' },
    { k: 'Ahorrado', v: Math.min(s, income - e), c: 'var(--brand)' },
    { k: 'Libre', v: free, c: 'var(--lime)' },
  ].filter((p) => p.v > 0)
  return (
    <div className="mt-auto pt-6">
      <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.k} ${Math.round((p.v / income) * 100)}%`).join(', ')}>
        {parts.map((p) => <div key={p.k} className="h-full rounded-full" style={{ width: `${(p.v / income) * 100}%`, background: p.c }} title={`${p.k}: ${money(p.v)}`} />)}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        {parts.map((p) => <span key={p.k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: p.c }} />{p.k} <b className="num text-ink">{Math.round((p.v / income) * 100)}%</b></span>)}
        {expense > income && <span className="text-neg">Gastaste {money(expense - income)} más de lo que entró</span>}
      </div>
    </div>
  )
}

function Ring({ value, color, label }: { value: number; color: string; label: string }) {
  const r = 18, c = 2 * Math.PI * r
  return (
    <div className="relative grid h-12 w-12 shrink-0 place-items-center">
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--fill)" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} />
      </svg>
      <span className="text-[18px]">{label}</span>
    </div>
  )
}

// Saldo total de cada uno de los últimos 30 días (reconstruido hacia atrás desde hoy).
function balanceTrend(accounts: ReturnType<typeof useAccounts>, txs: Tx[], total: number) {
  const { tax } = gmfMap(accounts, txs)
  const byDay = new Map<string, number>()
  for (const t of txs) {
    const eff = (t.kind === 'transferencia' ? 0 : txSign(t) * t.amount) - (tax.get(t.id) ?? 0)
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + eff)
  }
  if (!txs.length) return []
  const out: number[] = []
  let v = total
  // efectos posteriores a hoy (fechas futuras) no cuentan para "hoy"
  for (const [d, e] of byDay) if (d > today()) v -= e
  const day = new Date()
  for (let i = 0; i < 30; i++) {
    out.unshift(v)
    v -= byDay.get(ymd(day)) ?? 0
    day.setDate(day.getDate() - 1)
  }
  return out
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-6" />
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const W = 300, H = 64
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 6 - ((v - min) / span) * (H - 12)])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-4 h-16 w-full overflow-visible" aria-label="Evolución del saldo en los últimos 30 días" role="img">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--lime)" stopOpacity=".28" />
          <stop offset="1" stopColor="var(--lime)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#spark)" />
      <path d={line} fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="4" fill="var(--lime)" stroke="#0a1513" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
