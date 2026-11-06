import { useMemo, useState } from 'react'
import { MONTHS, money, shortDate, today } from '../lib/format'
import { useAllTx, useGoals, useRecurring } from '../lib/hooks'
import { annualPlan, monthlyCost, type PlanItem } from '../lib/recurring'
import { saveLocal } from '../lib/sync'
import { AccountPicker, CategoryBadge, Progress, Sheet } from './ui'

// Cuánto separar cada mes para tener listo el dinero de cada gasto anual en su fecha.
export function AnnualPlan() {
  const recurring = useRecurring()
  const goals = useGoals()
  const txs = useAllTx()
  const annual = recurring.filter((r) => r.kind === 'gasto' && r.freq === 'anual')
  const plan = useMemo(() => annualPlan(annual, goals, txs), [annual, goals, txs])
  const income = recurring.filter((r) => r.kind === 'ingreso').reduce((a, r) => a + monthlyCost(r), 0)
  const [separating, setSeparating] = useState(false)
  if (!annual.length) return null

  const done = Math.max(0, plan.thisMonth - plan.pending)
  const maxF = Math.max(...plan.forecast.map((f) => f.total), 1)
  const pct = income ? Math.round((plan.thisMonth / income) * 100) : 0

  return (
    <div className="card space-y-4 p-5">
      <div>
        <div className="text-[13px] font-medium text-muted">Plan de ahorro · este mes separa</div>
        <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{money(plan.thisMonth)}</div>
        <p className="mt-1 text-[13px] text-muted">
          {plan.pending === 0 ? '¡Ya separaste lo de este mes! ✓' : done > 0 ? `Llevas ${money(done)} · faltan ${money(plan.pending)}` : 'Así tendrás el dinero completo en cada fecha de pago.'}
          {pct > 0 && ` · ${pct}% de tus ingresos fijos`}
        </p>
        {plan.thisMonth > 0 && <div className="mt-3"><Progress value={done / plan.thisMonth} color="#30d158" /></div>}
      </div>

      <div className="divide-y divide-line">
        {plan.items.map((it) => <PlanRow key={it.r.id} it={it} />)}
      </div>

      <div>
        <div className="mb-2 text-[12px] font-medium text-muted">Lo que te toca separar los próximos 12 meses</div>
        <div className="flex h-24 items-end gap-1">
          {plan.forecast.map((f, i) => (
            <div key={f.ym} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${MONTHS[Number(f.ym.slice(5)) - 1]}: ${money(f.total)}`}>
              <div className={`w-full rounded-t ${i === 0 ? 'bg-accent' : 'bg-accent/35'}`} style={{ height: `${Math.max(4, (f.total / maxF) * 100)}%` }} />
              <span className="text-[10px] text-muted uppercase">{MONTHS[Number(f.ym.slice(5)) - 1].slice(0, 1)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Cuando pagas un gasto, empieza el ahorro para el año siguiente, repartido en 12 meses.
        </p>
      </div>

      {plan.pending > 0 && (
        <button className="btn-primary w-full" onClick={() => setSeparating(true)}>Separar {money(plan.pending)} ahora</button>
      )}
      {separating && <SeparateSheet items={plan.items.filter((it) => it.pending > 0)} onClose={() => setSeparating(false)} />}
    </div>
  )
}

function PlanRow({ it }: { it: PlanItem }) {
  const status = it.ready
    ? { text: 'Listo ✓', cls: 'text-pos' }
    : it.pending === 0 ? { text: 'Este mes ✓', cls: 'text-pos' }
      : { text: `Falta ${money(it.pending)}`, cls: 'text-warn' }
  return (
    <div className="flex items-center gap-3 py-3">
      <CategoryBadge icon={it.r.icon} color="#ff9f0a" size={36} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex justify-between gap-2 text-[14px]">
          <span className="truncate font-medium">{it.r.name}</span>
          <span className="shrink-0 font-semibold tabular-nums">{it.readyBefore ? '—' : `${money(it.perMonth)}/mes`}</span>
        </div>
        <Progress value={it.r.amount ? it.saved / it.r.amount : 0} color="#ff9f0a" />
        <div className="flex justify-between gap-2 text-[12px] text-muted">
          <span className="truncate">{money(it.saved)} de {money(it.r.amount)} · {shortDate(it.occ.date)}{it.occ.key !== String(new Date().getFullYear()) ? ` ${it.occ.key}` : ''} · {it.months} {it.months === 1 ? 'abono' : 'abonos'}</span>
          <span className={`shrink-0 ${status.cls}`}>{status.text}</span>
        </div>
      </div>
    </div>
  )
}

// Separa de una vez lo de este mes: crea el ahorro de cada gasto si no existe y abona.
function SeparateSheet({ items, onClose }: { items: PlanItem[]; onClose: () => void }) {
  const [account, setAccount] = useState('')
  const [error, setError] = useState('')
  const total = items.reduce((a, it) => a + it.pending, 0)

  async function save() {
    if (!account) return setError('Elige de dónde sale el dinero')
    for (const it of items) {
      const goal = it.goal?.id ?? await saveLocal('goals', {
        kind: 'anual', name: it.r.name, icon: it.r.icon, color: '#ff9f0a', target: it.r.amount,
        deadline: it.occ.date.slice(0, 7), recurring: it.r.id,
      })
      await saveLocal('transactions', { kind: 'ahorro', amount: it.pending, account, goal, date: today(), note: 'Plan de gastos anuales', category: '' })
    }
    onClose()
  }

  return (
    <Sheet title="Separar para gastos anuales" onClose={onClose}>
      <div className="space-y-5">
        <div className="card divide-y divide-line">
          {items.map((it) => (
            <div key={it.r.id} className="flex items-center justify-between px-4 py-2.5 text-[14px]">
              <span>{it.r.icon} {it.r.name}</span>
              <span className="font-semibold tabular-nums">{money(it.pending)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5 text-[15px] font-semibold">
            <span>Total</span><span className="tabular-nums">{money(total)}</span>
          </div>
        </div>
        <AccountPicker value={account} onChange={(a) => { setAccount(a); setError('') }} amount={total} direction="out" />
        {error && <p className="text-center text-[14px] text-neg">{error}</p>}
        <button className="btn-primary w-full" onClick={() => void save()}>Separar {money(total)}</button>
      </div>
    </Sheet>
  )
}
