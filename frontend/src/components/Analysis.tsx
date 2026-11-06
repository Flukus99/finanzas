import { useMemo, useState } from 'react'
import type { Tx } from '../lib/db'
import { MONTHS, money, pad, parseYmd } from '../lib/format'
import { useAccounts, useAllTx, useCategories, useGmf, useGoals } from '../lib/hooks'
import { goalSaved } from '../lib/recurring'
import { Columns, DataTable, HBars, type Point } from './Charts'
import { ChevronLeft, ChevronRight } from './Icons'
import { TxRow } from './Tx'
import { Empty, Progress, Segmented } from './ui'

type Gran = 'mes' | 'trimestre' | 'semestre' | 'ano'
const SIZE: Record<Gran, number> = { mes: 1, trimestre: 3, semestre: 6, ano: 12 }
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

// Un periodo se define por su primer mes (índice absoluto y*12+m) y su tamaño en meses.
interface Period { start: number; size: number }
const ym = (i: number) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`
function current(g: Gran): Period {
  const d = new Date(); const size = SIZE[g]
  const i = d.getFullYear() * 12 + d.getMonth()
  return { start: i - ((i % 12) % size), size }
}
function label({ start, size }: Period) {
  const y = Math.floor(start / 12), m = start % 12
  if (size === 1) return `${cap(MONTHS[m])} ${y}`
  if (size === 12) return String(y)
  const range = `${MONTHS[m].slice(0, 3)}–${MONTHS[m + size - 1].slice(0, 3)}`
  return size === 3 ? `T${m / 3 + 1} ${y} · ${range}` : `${m === 0 ? '1.er' : '2.º'} semestre ${y}`
}
const inPeriod = (t: Tx, p: Period) => t.date >= `${ym(p.start)}-01` && t.date <= `${ym(p.start + p.size - 1)}-31`

export function Analysis({ onEdit }: { onEdit: (t: Tx) => void }) {
  const [gran, setGran] = useState<Gran>('mes')
  const [period, setPeriod] = useState<Period>(current('mes'))
  const all = useAllTx()
  const accounts = useAccounts()
  const categories = useCategories()
  const goals = useGoals()
  const { tax } = useGmf()

  const changeGran = (g: Gran) => { setGran(g); setPeriod(current(g)) }
  const shift = (n: number) => setPeriod({ ...period, start: period.start + n * period.size })

  const stats = (p: Period) => {
    const txs = all.filter((t) => inPeriod(t, p))
    const sum = (k: Tx['kind']) => txs.filter((t) => t.kind === k).reduce((a, t) => a + t.amount, 0)
    const gmf = txs.reduce((a, t) => a + (tax.get(t.id) ?? 0), 0)
    return { txs, spent: sum('gasto') + gmf, income: sum('ingreso'), saved: sum('ahorro') - sum('retiro'), gmf }
  }
  const cur = useMemo(() => stats(period), [all, tax, period]) // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => stats({ ...period, start: period.start - period.size }), [all, tax, period]) // eslint-disable-line react-hooks/exhaustive-deps

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const goalMap = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals])

  // Gasto (con 4x1000) y ahorro neto por día (mes) o por mes (resto).
  const buckets = useMemo(() => {
    const keys: { key: string; label: string; full: string }[] = []
    if (period.size === 1) {
      const y = Math.floor(period.start / 12), m = period.start % 12
      const days = new Date(y, m + 1, 0).getDate()
      for (let d = 1; d <= days; d++) keys.push({ key: `${ym(period.start)}-${pad(d)}`, label: String(d), full: `${d} de ${MONTHS[m]}` })
    } else {
      for (let i = 0; i < period.size; i++) {
        const k = ym(period.start + i), m = (period.start + i) % 12
        keys.push({ key: k, label: MONTHS[m].slice(0, 3), full: `${cap(MONTHS[m])} ${Math.floor((period.start + i) / 12)}` })
      }
    }
    const spent = new Map<string, number>(), saved = new Map<string, number>()
    const len = period.size === 1 ? 10 : 7
    for (const t of cur.txs) {
      const k = t.date.slice(0, len)
      const g = (t.kind === 'gasto' ? t.amount : 0) + (tax.get(t.id) ?? 0)
      if (g) spent.set(k, (spent.get(k) ?? 0) + g)
      if (t.kind === 'ahorro') saved.set(k, (saved.get(k) ?? 0) + t.amount)
      if (t.kind === 'retiro') saved.set(k, (saved.get(k) ?? 0) - t.amount)
    }
    const mk = (m: Map<string, number>): Point[] => keys.map((k) => ({ ...k, value: m.get(k.key) ?? 0 }))
    return { spent: mk(spent), saved: mk(saved) }
  }, [cur, period, tax])

  const byCat = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of cur.txs) if (t.kind === 'gasto') m.set(t.category, (m.get(t.category) ?? 0) + t.amount)
    const rows = [...m.entries()].map(([id, value]) => {
      const c = catMap.get(id)
      return { key: id, icon: c?.icon ?? '•', name: c?.name ?? 'Sin categoría', value }
    })
    if (cur.gmf) rows.push({ key: '__gmf', icon: '🏛️', name: '4x1000', value: cur.gmf })
    return rows.sort((a, b) => b.value - a.value)
  }, [cur, catMap])

  const gmfByAcc = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of cur.txs) { const v = tax.get(t.id); if (v) m.set(t.account, (m.get(t.account) ?? 0) + v) }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [cur, tax])
  const gmfTotal = useMemo(() => [...tax.values()].reduce((a, b) => a + b, 0), [tax])
  const gmfYear = useMemo(() => { const y = String(new Date().getFullYear()); return all.filter((t) => t.date.startsWith(y)).reduce((a, t) => a + (tax.get(t.id) ?? 0), 0) }, [all, tax])

  const savedAll = useMemo(() => goalSaved(all), [all])
  const savedPeriod = useMemo(() => goalSaved(cur.txs), [cur])
  const biggest = [...cur.txs].filter((t) => t.kind === 'gasto').sort((a, b) => b.amount - a.amount).slice(0, 5)

  const multi = period.size > 1
  const now = new Date().toISOString().slice(0, multi ? 7 : 10)
  const past = (p: Point) => p.key <= now // ignora meses/días que aún no llegan
  const spentPts = buckets.spent.filter((p) => p.value > 0 && past(p))
  const maxSpent = spentPts.length ? spentPts.reduce((a, b) => (b.value > a.value ? b : a)) : null
  const minSpent = spentPts.length > 1 ? spentPts.reduce((a, b) => (b.value < a.value ? b : a)) : null
  const savedPts = buckets.saved.filter(past)
  const savedMax = savedPts.length ? savedPts.reduce((a, b) => (b.value > a.value ? b : a)) : null
  const savedMin = savedPts.length > 1 ? savedPts.reduce((a, b) => (b.value < a.value ? b : a)) : null
  const months = multi ? Math.max(1, Math.min(period.size, monthsElapsed(period))) : 1

  return (
    <div className="space-y-6">
      <h1 className="page-title">Análisis</h1>

      {/* Filtros: un solo renglón, afectan todo lo de abajo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:w-96">
          <Segmented value={gran} onChange={changeGran} options={[
            { value: 'mes', label: 'Mes' }, { value: 'trimestre', label: 'Trimestre' }, { value: 'semestre', label: 'Semestre' }, { value: 'ano', label: 'Año' },
          ]} />
        </div>
        <div className="flex items-center justify-center gap-1">
          <button className="rounded-full p-1.5 hover:bg-fill" onClick={() => shift(-1)} aria-label="Periodo anterior"><ChevronLeft width={18} height={18} /></button>
          <span className="min-w-44 text-center text-[15px] font-medium">{label(period)}</span>
          <button className="rounded-full p-1.5 hover:bg-fill" onClick={() => shift(1)} aria-label="Periodo siguiente"><ChevronRight width={18} height={18} /></button>
        </div>
      </div>

      {/* Cifras principales */}
      <div className="card p-5">
        <div className="text-[13px] font-medium text-muted">Gastaste</div>
        <div className="mt-1 text-5xl font-semibold tracking-tight">{money(cur.spent)}</div>
        <Delta cur={cur.spent} prev={prev.spent} upIsGood={false} />
        {multi && cur.spent > 0 && <p className="mt-1 text-[13px] text-muted">Promedio {money(Math.round(cur.spent / months))} al mes</p>}
        <div className="mt-5 grid grid-cols-1 gap-2 border-t border-line pt-4 sm:grid-cols-3 sm:gap-3">
          <Tile label="Ingresos" value={cur.income} prev={prev.income} upIsGood />
          <Tile label="Ahorrado" value={cur.saved} prev={prev.saved} upIsGood />
          <Tile label="4x1000" value={cur.gmf} prev={prev.gmf} upIsGood={false} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-5 lg:col-span-2">
          <h2 className="text-[17px] font-semibold">Gasto {multi ? 'por mes' : 'por día'}</h2>
          <p className="mb-4 text-[13px] text-muted">
            {maxSpent ? <>Más gasto: <b>{maxSpent.full}</b> ({money(maxSpent.value)}){minSpent && <> · menos: <b>{minSpent.full}</b> ({money(minSpent.value)})</>}</> : 'Incluye el 4x1000.'}
          </p>
          <Columns data={buckets.spent} labelEvery={multi ? 1 : 5} emptyText="No hay gastos en este periodo" />
        </section>

        <section className="card p-5">
          <h2 className="text-[17px] font-semibold">¿En qué gastas?</h2>
          <p className="mb-4 text-[13px] text-muted">
            {byCat[0] ? <>Lo que más pesa: <b>{byCat[0].icon} {byCat[0].name}</b>, el {Math.round((byCat[0].value / (cur.spent || 1)) * 100)}% de tus gastos.</> : 'Sin gastos en este periodo.'}
          </p>
          {byCat.length ? <HBars rows={byCat} /> : <Empty>No hay gastos.</Empty>}
          {byCat.length > 0 && <DataTable head={['Categoría', 'Gastado']} rows={byCat.map((r) => [`${r.icon} ${r.name}`, money(r.value)])} />}
        </section>

        <section className="card p-5">
          <h2 className="text-[17px] font-semibold">Ahorro {multi ? 'por mes' : 'por día'}</h2>
          <p className="mb-4 text-[13px] text-muted">
            {multi && savedMax && savedMin && savedMax.value !== savedMin.value
              ? <>Más ahorro: <b>{savedMax.full}</b> ({money(savedMax.value)}) · menos: <b>{savedMin.full}</b> ({money(savedMin.value)})</>
              : 'Abonos a tus ahorros menos lo que retiraste.'}
          </p>
          <Columns data={buckets.saved} labelEvery={multi ? 1 : 5} emptyText="No abonaste a tus ahorros en este periodo" />
        </section>

        <section className="card p-5">
          <h2 className="text-[17px] font-semibold">Metas de ahorro</h2>
          <p className="mb-4 text-[13px] text-muted">Progreso total · lo abonado en el periodo va en verde.</p>
          {goals.length === 0 && <Empty>Aún no tienes ahorros.</Empty>}
          <div className="space-y-4">
            {goals.map((g) => {
              const have = savedAll.get(g.id) ?? 0
              const inP = savedPeriod.get(g.id) ?? 0
              return (
                <div key={g.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-[14px]">
                    <span className="truncate">{g.icon} {g.name}</span>
                    <span className="shrink-0 tabular-nums"><b>{money(have)}</b>{g.target ? <span className="text-muted"> / {money(g.target)}</span> : ''}</span>
                  </div>
                  <Progress value={g.target ? have / g.target : have > 0 ? 1 : 0} color={g.color} />
                  <div className="mt-1 flex justify-between text-[12px] text-muted">
                    <span>{g.target ? `${Math.round((have / g.target) * 100)}%` : 'Sin meta'}</span>
                    {inP !== 0 && <span className={inP > 0 ? 'text-pos' : ''}>{inP > 0 ? '+' : '−'}{money(Math.abs(inP))} en el periodo</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-[17px] font-semibold">🏛️ 4x1000</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fig label="Este periodo" value={cur.gmf} />
            <Fig label={`En ${new Date().getFullYear()}`} value={gmfYear} />
            <Fig label="Desde que empezaste" value={gmfTotal} />
          </div>
          <div className="mt-4 divide-y divide-line">
            {gmfByAcc.length === 0 && <p className="py-2 text-[13px] text-muted">No pagaste 4x1000 en este periodo. 🎉</p>}
            {gmfByAcc.map(([id, v]) => (
              <div key={id} className="flex justify-between py-2 text-[14px]">
                <span>{accMap.get(id)?.name ?? 'Cuenta'}</span><span className="font-semibold tabular-nums">{money(v)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-2">
          <h2 className="section-title">Gastos más grandes del periodo</h2>
          <div className="card divide-y divide-line overflow-hidden">
            {biggest.length === 0 && <Empty>No hay gastos en este periodo.</Empty>}
            {biggest.map((t) => (
              <TxRow key={t.id} tx={t} cat={catMap.get(t.category)} acc={accMap.get(t.account)} goal={goalMap.get(t.goal ?? '')} gmf={tax.get(t.id)} prefix={shortDay(t.date)} onClick={() => onEdit(t)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// Meses del periodo que ya pasaron o están en curso (para el promedio).
function monthsElapsed(p: Period) {
  const d = new Date()
  return d.getFullYear() * 12 + d.getMonth() - p.start + 1
}
const shortDay = (s: string) => { const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}` }

function Delta({ cur, prev, upIsGood }: { cur: number; prev: number; upIsGood: boolean }) {
  if (!prev && !cur) return null
  if (!prev) return <p className="mt-1 text-[13px] text-muted">Sin datos del periodo anterior</p>
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100)
  if (pct === 0) return <p className="mt-1 text-[13px] text-muted">Igual que el periodo anterior</p>
  const good = pct > 0 === upIsGood
  return (
    <p className="mt-1 text-[13px]">
      <span className={good ? 'text-pos' : 'text-neg'}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>
      <span className="text-muted"> vs. periodo anterior ({money(prev)})</span>
    </p>
  )
}

function Tile({ label, value, prev, upIsGood }: { label: string; value: number; prev: number; upIsGood: boolean }) {
  const pct = prev ? Math.round(((value - prev) / Math.abs(prev)) * 100) : null
  const good = pct !== null && pct > 0 === upIsGood
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 sm:block">
      <div className="text-[13px] text-muted sm:text-[12px]">{label}</div>
      <div className="flex items-baseline gap-2 sm:block">
        <div className="text-[16px] font-semibold whitespace-nowrap">{money(value)}</div>
        {pct !== null && pct !== 0 && <div className={`text-[11px] ${good ? 'text-pos' : 'text-neg'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</div>}
      </div>
    </div>
  )
}

function Fig({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="truncate text-[16px] font-semibold">{money(value)}</div>
    </div>
  )
}
