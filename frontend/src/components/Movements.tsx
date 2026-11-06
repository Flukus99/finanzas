import { useMemo, useState } from 'react'
import type { Tx } from '../lib/db'
import { dayLabel, money, thisMonth } from '../lib/format'
import { sortTx, txSign, useAccounts, useCategories, useGmf, useGoals, useMonthTx } from '../lib/hooks'
import { SearchIcon } from './Icons'
import { TxRow } from './Tx'
import { Empty, MonthPicker, Segmented } from './ui'

type Filter = 'todos' | 'gasto' | 'ingreso' | 'ahorro' | 'transferencia'

export function Movements({ onEdit }: { onEdit: (t: Tx) => void }) {
  const [month, setMonth] = useState(thisMonth())
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const txs = useMonthTx(month)
  const categories = useCategories()
  const accounts = useAccounts()
  const goals = useGoals()
  const { tax } = useGmf()
  const goalMap = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals])
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = sortTx(txs).filter((t) => {
      if (filter === 'ahorro' ? t.kind !== 'ahorro' && t.kind !== 'retiro' : filter !== 'todos' && t.kind !== filter) return false
      if (!needle) return true
      const hay = `${t.note} ${catMap.get(t.category)?.name ?? ''} ${accMap.get(t.account)?.name ?? ''} ${accMap.get(t.to ?? '')?.name ?? ''} ${t.kind === 'transferencia' ? 'transferencia' : ''} ${goalMap.get(t.goal ?? '')?.name ?? ''} ${t.amount}`.toLowerCase()
      return hay.includes(needle)
    })
    const out: { date: string; items: Tx[]; net: number }[] = []
    for (const t of list) {
      let g = out[out.length - 1]
      if (!g || g.date !== t.date) out.push((g = { date: t.date, items: [], net: 0 }))
      g.items.push(t)
      g.net += txSign(t) * t.amount - (tax.get(t.id) ?? 0)
    }
    return out
  }, [txs, q, filter, catMap, accMap, goalMap, tax])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">Movimientos</h1>
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <SearchIcon width={18} height={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input className="field pl-9" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="sm:w-[28rem]">
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'todos', label: 'Todos' }, { value: 'gasto', label: 'Gastos' }, { value: 'ingreso', label: 'Ingresos' }, { value: 'ahorro', label: 'Ahorros' }, { value: 'transferencia', label: 'Transf.' },
          ]} />
        </div>
      </div>

      {groups.length === 0 && <div className="card"><Empty>No hay movimientos{q ? ' que coincidan' : ' en este mes'}.</Empty></div>}
      {groups.map((g) => (
        <section key={g.date}>
          <div className="mb-2 flex justify-between px-1 text-[13px] font-medium text-muted">
            <span>{dayLabel(g.date)}</span>
            <span className="tabular-nums">{g.net >= 0 ? '+' : '−'}{money(Math.abs(g.net))}</span>
          </div>
          <div className="card divide-y divide-line overflow-hidden">
            {g.items.map((t) => <TxRow key={t.id} tx={t} cat={catMap.get(t.category)} acc={accMap.get(t.account)} goal={goalMap.get(t.goal ?? '')} to={accMap.get(t.to ?? '')} gmf={tax.get(t.id)} onClick={() => onEdit(t)} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
