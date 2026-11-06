import { useMemo, useState } from 'react'
import type { Debt, Freq, Kind, Recurring, Tx } from '../lib/db'
import { debtAsRecurring, debtOccurrence } from '../lib/debts'
import { daysUntil, dueLabel, money, MONTHS, shiftMonth, shortDate, thisMonth, type Month } from '../lib/format'
import { useAccounts, useAllTx, useCategories, useDebts, useGoals, useRecurring } from '../lib/hooks'
import {
  annualPlan, defaultPayDate, goalForRecurring, goalSaved, nextAnnual, occurrences, paidMap, type Occ, type PaidMap,
} from '../lib/recurring'
import { removeLocal, saveLocal } from '../lib/sync'
import { PlusIcon } from './Icons'
import { AnnualPlan } from './AnnualPlan'
import { DebtSheet } from './Debts'
import { GoalSheet } from './Savings'
import { CardPaySheet } from './Debts'
import { cardStatement, isCard } from '../lib/cards'
import { AccountPicker, CARD, cardOf, CategoryBadge, EmojiPicker, Empty, Field, MoneyInput, MonthPicker, Progress, Segmented, Sheet } from './ui'

type View = 'mensual' | 'anual' | 'ingreso'

export function Fixed({ onEditTx }: { onEditTx: (t: Tx) => void }) {
  const [view, setView] = useState<View>('mensual')
  const [month, setMonth] = useState(thisMonth())
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null)
  const [paying, setPaying] = useState<{ r: Recurring; occ: Occ } | null>(null)
  const [goalFor, setGoalFor] = useState<{ r: Recurring; occ: Occ } | null>(null)
  const [editDebt, setEditDebt] = useState<Debt | null>(null)
  const [payDebt, setPayDebt] = useState<{ d: Debt; occ: Occ; n: number | null } | null>(null)
  const recurring = useRecurring()
  const debts = useDebts()
  const categories = useCategories()
  const txs = useAllTx()
  const goals = useGoals()
  const paid = useMemo(() => paidMap(txs), [txs])
  const saved = useMemo(() => goalSaved(txs), [txs])
  const plan = useMemo(() => annualPlan(recurring.filter((r) => r.kind === 'gasto' && r.freq === 'anual'), goals, txs), [recurring, goals, txs])

  const monthly = recurring.filter((r) => r.kind === 'gasto' && r.freq !== 'anual')
  const annual = recurring.filter((r) => r.kind === 'gasto' && r.freq === 'anual')
  const incomes = recurring.filter((r) => r.kind === 'ingreso')

  const rowsFor = (list: Recurring[], m: Month) =>
    list.flatMap((r) => occurrences(r, m).map((occ) => ({ r, occ, tx: paid.get(`${r.id}|${occ.key}`) })))
      .sort((a, b) => a.occ.date.localeCompare(b.occ.date))

  const onRow = (r: Recurring, occ: Occ, tx?: Tx) => (tx ? onEditTx(tx) : setPaying({ r, occ }))
  // Las cuotas de deudas activas se muestran como un gasto fijo más.
  const catIcons = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const debtRows = (m: Month) => debts.flatMap((d) => {
    const occ = debtOccurrence(d, m, txs)
    if (!occ) return []
    const tx = paid.get(`${d.id}|${occ.key}`)
    const amount = isCard(d) ? cardStatement(d, m.y * 12 + m.m, txs, recurring, catIcons).total : undefined
    if (isCard(d) && !tx && !amount) return [] // tarjeta sin nada que pagar ese mes
    return [{ d, r: debtAsRecurring(d, categories, amount), occ, n: occ.n, tx }]
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">Fijos</h1>
        <button className="btn-ghost py-2" onClick={() => setEditing('new')}><PlusIcon width={18} height={18} />Nuevo</button>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="md:w-[26rem]"><Segmented value={view} onChange={setView} options={[
        { value: 'mensual', label: 'Mensuales' }, { value: 'anual', label: 'Anuales' }, { value: 'ingreso', label: 'Ingresos' },
      ]} /></div>{view !== 'anual' && <div className="flex justify-center"><MonthPicker month={month} onChange={setMonth} /></div>}</div>

      {view === 'mensual' && (() => {
        const dRows = debtRows(month)
        const rows: { r: Recurring; occ: Occ; tx?: Tx; d?: Debt; n?: number | null }[] =
          [...rowsFor(monthly, month), ...dRows].sort((a, b) => a.occ.date.localeCompare(b.occ.date))
        // El pago de la tarjeta no suma: sus compras y suscripciones ya se cuentan como gasto.
        const counted = rows.filter((x) => !(x.d && isCard(x.d)))
        const total = counted.reduce((a, x) => a + (x.tx?.amount ?? x.r.amount), 0)
        const done = counted.filter((x) => x.tx).reduce((a, x) => a + x.tx!.amount, 0)
        return (
          <>
            <Summary items={[['Total del mes', money(total)], ['Pagado', money(done)], ['Falta', money(total - done)]]} progress={total ? done / total : 0} />
            <List empty="Agrega tus gastos fijos: arriendo, servicios, tarjetas, suscripciones, transporte…" onAdd={() => setEditing('new')}>
              {rows.map((row) => {
                const { r, occ, tx, d } = row
                const n = row.n ?? null
                return d
                  ? <FixedRow key={r.id + occ.key} r={r} occ={occ} tx={tx} extra={isCard(d) ? '💳 Pago de tarjeta' : n ? `Cuota ${n} de ${d.installments}` : 'Deuda'}
                      onPay={() => (tx ? onEditTx(tx) : setPayDebt({ d, occ, n }))} onEdit={() => setEditDebt(d)} />
                  : <FixedRow key={r.id + occ.key} r={r} occ={occ} tx={tx} onPay={() => onRow(r, occ, tx)} onEdit={() => setEditing(r)} />
              })}
            </List>
          </>
        )
      })()}

      {view === 'anual' && (() => {
        const rows = annual.map((r) => ({ r, occ: nextAnnual(r, paid) })).sort((a, b) => a.occ.date.localeCompare(b.occ.date))
        const total = annual.reduce((a, r) => a + r.amount, 0)
        return (
          <>
            <Summary items={[['Total al año', money(total)], ['Equivale al mes', money(Math.round(total / 12))]]} />
            <AnnualPlan />
            <List empty="Agrega gastos que pagas una vez al año: SOAT, seguros, impuesto predial o vehicular, renovaciones…" onAdd={() => setEditing('new')}>
              {rows.map(({ r, occ }) => {
                const goal = goalForRecurring(goals, r.id)
                const have = goal ? saved.get(goal.id) ?? 0 : 0
                const perMonth = plan.items.find((it) => it.r.id === r.id)?.perMonth ?? 0
                return (
                  <div key={r.id}>
                    <FixedRow r={r} occ={occ} tx={paid.get(`${r.id}|${occ.key}`)} onPay={() => setPaying({ r, occ })} onEdit={() => setEditing(r)} annual />
                    <div className="space-y-2 px-4 pb-3.5 pl-[4.25rem]">
                      {goal ? (
                        <>
                          <Progress value={r.amount ? have / r.amount : 0} color={goal.color} />
                          <div className="flex justify-between text-[12px] text-muted">
                            <span>Ahorrado {money(have)} de {money(r.amount)}</span>
                            {have < r.amount && <span>Ahorra {money(perMonth)}/mes</span>}
                          </div>
                        </>
                      ) : (
                        <button className="text-[13px] text-accent" onClick={() => setGoalFor({ r, occ })}>
                          🐷 Crear ahorro para este pago · {money(perMonth)}/mes
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </List>
          </>
        )
      })()}

      {view === 'ingreso' && (() => {
        const rows = rowsFor(incomes, month)
        const total = rows.reduce((a, x) => a + (x.tx?.amount ?? x.r.amount), 0)
        const done = rows.filter((x) => x.tx).reduce((a, x) => a + x.tx!.amount, 0)
        return (
          <>
            <Summary items={[['Esperado', money(total)], ['Recibido', money(done)], ['Por recibir', money(total - done)]]} progress={total ? done / total : 0} />
            <List empty="Agrega tus ingresos fijos: salario, arriendos que recibes, pensión…" onAdd={() => setEditing('new')}>
              {rows.map(({ r, occ, tx }) => (
                <FixedRow key={r.id + occ.key} r={r} occ={occ} tx={tx} onPay={() => onRow(r, occ, tx)} onEdit={() => setEditing(r)} />
              ))}
            </List>
          </>
        )
      })()}

      {editing && (
        <RecurringSheet rec={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}
          defaults={view === 'ingreso' ? { kind: 'ingreso', freq: 'mensual' } : { kind: 'gasto', freq: view === 'anual' ? 'anual' : 'mensual' }} />
      )}
      {paying && <PaySheet r={paying.r} occ={paying.occ} onClose={() => setPaying(null)} />}
      {payDebt && isCard(payDebt.d) && <CardPaySheet card={payDebt.d} pay={Number(payDebt.occ.key.slice(0, 4)) * 12 + Number(payDebt.occ.key.slice(5)) - 1} onClose={() => setPayDebt(null)} />}
      {payDebt && !isCard(payDebt.d) && <PaySheet r={debtAsRecurring(payDebt.d, categories)} occ={payDebt.occ} debt={payDebt.d.id} label={payDebt.n ? `Cuota ${payDebt.n} de ${payDebt.d.installments}` : undefined} onClose={() => setPayDebt(null)} />}
      {editDebt && <DebtSheet debt={editDebt} onClose={() => setEditDebt(null)} />}
      {goalFor && <GoalSheet defaults={{ kind: 'anual', linked: goalFor.r, deadline: goalFor.occ.date.slice(0, 7) }} onClose={() => setGoalFor(null)} />}
    </div>
  )
}

function Summary({ items, progress }: { items: [string, string][]; progress?: number }) {
  return (
    <div className="card space-y-3 p-4">
      <div className={`grid gap-3 ${items.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {items.map(([l, v]) => (
          <div key={l} className="min-w-0">
            <div className="text-[12px] text-muted">{l}</div>
            <div className="truncate text-[15px] font-semibold tabular-nums sm:text-[17px]">{v}</div>
          </div>
        ))}
      </div>
      {progress !== undefined && <Progress value={progress} color="#30d158" />}
    </div>
  )
}

function List({ children, empty, onAdd }: { children: React.ReactNode[]; empty: string; onAdd: () => void }) {
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {children.length === 0
        ? <Empty>{empty}<br /><button className="btn-primary mt-4" onClick={onAdd}>Agregar</button></Empty>
        : children}
    </div>
  )
}

export function FixedRow({ r, occ, tx, onPay, onEdit, annual, extra: extraIn }: {
  r: Recurring; occ: Occ; tx?: Tx; onPay: () => void; onEdit: () => void; annual?: boolean; extra?: string
}) {
  const debts = useDebts()
  const card = r.card ? debts.find((d) => d.id === r.card) : undefined
  const extra = extraIn ?? (card ? `💳 ${card.name}` : undefined)
  const income = r.kind === 'ingreso'
  const n = daysUntil(occ.date)
  const status = tx
    ? { text: income ? 'Recibido ✓' : 'Pagado ✓', cls: 'text-pos' }
    : n < 0 ? { text: income ? `Debió llegar hace ${-n} d` : dueLabel(n), cls: 'text-neg' }
      : n <= 3 ? { text: dueLabel(n), cls: 'text-warn' }
        : { text: dueLabel(n), cls: 'text-muted' }
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left" title="Editar">
        <CategoryBadge icon={r.icon} color={income ? '#30d158' : extraIn ? '#ff453a' : '#0a84ff'} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium">{r.name}</div>
          <div className="truncate text-[13px]">
            <span className="text-muted">{annual ? shortDate(occ.date) + (occ.key !== String(new Date().getFullYear()) ? ` ${occ.key}` : '') : `Día ${Number(occ.date.slice(8))}`}{extra ? ` · ${extra}` : ''} · </span>
            <span className={status.cls}>{status.text}</span>
          </div>
        </div>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`text-[15px] font-semibold tabular-nums ${tx ? 'text-faint line-through decoration-1' : ''}`}>{money(tx?.amount ?? r.amount)}</span>
        {!tx && (
          <button onClick={onPay} className={`rounded-full px-3 py-0.5 text-[12px] font-semibold ${income ? 'bg-pos/15 text-pos' : 'bg-accent/15 text-accent'}`}>
            {income ? 'Recibí' : 'Pagar'}
          </button>
        )}
        {tx && <button onClick={onPay} className="text-[12px] text-muted hover:underline">Ver</button>}
      </div>
    </div>
  )
}

// ── Pagar / recibir un fijo ────────────────────────────────────────────────
export function PaySheet({ r, occ, onClose, debt, label }: { r: Recurring; occ: Occ; onClose: () => void; debt?: string; label?: string }) {
  const income = r.kind === 'ingreso'
  const goals = useGoals()
  const txs = useAllTx()
  const categories = useCategories()
  const goal = goalForRecurring(goals, r.id)
  const have = goal ? goalSaved(txs).get(goal.id) ?? 0 : 0
  const [amount, setAmount] = useState(r.amount)
  const [account, setAccount] = useState(r.card ? CARD + r.card : r.account)
  const [date, setDate] = useState(defaultPayDate(occ))
  const [useSavings, setUseSavings] = useState(have > 0)
  const [error, setError] = useState('')
  const card = !income && !debt ? cardOf(account) : ''
  const fromSavings = useSavings && goal && !card ? Math.min(have, amount) : 0

  async function save() {
    if (!amount) return setError('Escribe el valor')
    if (!account) return setError(income ? 'Elige a dónde llegó' : 'Elige de dónde sale el dinero')
    if (fromSavings > 0 && goal) {
      // Primero se pasa lo ahorrado a la cuenta, luego se paga desde ella.
      await saveLocal('transactions', { kind: 'retiro', amount: fromSavings, account, goal: goal.id, date, note: `Para pagar ${r.name}`, category: '' })
    }
    const category = categories.some((c) => c.id === r.category) ? r.category : ''
    await saveLocal('transactions', {
      kind: r.kind, amount, account: card ? '' : account, category, date, note: label ? `${r.name} · ${label}` : r.name, recurring: r.id, period: occ.key,
      ...(debt ? { debt } : {}), ...(card ? { card, card_n: 1 } : {}),
    })
    onClose()
  }

  return (
    <Sheet title={income ? `Recibir ${r.name}` : `Pagar ${r.name}`} onClose={onClose}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <div className="text-center">
          <div className="text-4xl">{r.icon}</div>
          <div className="mt-1 text-[13px] text-muted">
            {label ? `${label} · ` : ''}{r.freq === 'anual' ? `Pago de ${occ.key}` : `Correspondía el ${shortDate(occ.date)}`}
          </div>
          {debt && <div className="mt-1 text-[12px] text-muted">Si este mes la cuota cambió (intereses, seguros…), ajusta el valor.</div>}
        </div>
        <MoneyInput big value={amount} onChange={(n) => { setAmount(n); setError('') }} />
        {goal && have > 0 && !income && !card && (
          <label className="card flex items-center gap-3 p-3.5">
            <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={useSavings} onChange={(e) => setUseSavings(e.target.checked)} />
            <span className="text-[14px]">Usar lo ahorrado en <b>{goal.icon} {goal.name}</b> ({money(have)})</span>
          </label>
        )}
        <AccountPicker value={account} onChange={(a) => { setAccount(a); setError('') }}
          amount={amount - fromSavings} direction={income ? 'in' : 'out'} gmf={!income} date={date} taxBase={amount} allowCards={!income && !debt} />
        <Field label="Fecha"><input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value || date)} /></Field>
        {error && <p className="text-center text-[14px] text-neg">{error}</p>}
        <button className="btn-primary w-full">{income ? 'Registrar ingreso' : card ? 'Registrar cargo a la tarjeta' : 'Marcar como pagado'}</button>
      </form>
    </Sheet>
  )
}

// ── Crear / editar un fijo ─────────────────────────────────────────────────
export function RecurringSheet({ rec, defaults, onClose }: { rec?: Recurring; defaults: { kind: Kind; freq: Freq }; onClose: () => void }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const [kind, setKind] = useState<Kind>(rec?.kind ?? defaults.kind)
  const [freq, setFreq] = useState<Freq>(rec?.freq ?? defaults.freq)
  const [name, setName] = useState(rec?.name ?? '')
  const [icon, setIcon] = useState(rec?.icon ?? (defaults.kind === 'ingreso' ? '💼' : '🧾'))
  const [amount, setAmount] = useState(rec?.amount ?? 0)
  const [day, setDay] = useState(rec?.day ?? (defaults.kind === 'ingreso' ? 15 : 1))
  const [day2, setDay2] = useState(rec?.day2 || 30)
  const [month, setMonth] = useState(rec?.month || new Date().getMonth() + 1)
  const [account, setAccount] = useState(rec?.card ? CARD + rec.card : rec?.account ?? '')
  const [category, setCategory] = useState(rec?.category ?? '')
  const [error, setError] = useState('')
  const cats = categories.filter((c) => c.kind === kind)

  async function save() {
    if (!name.trim()) return setError('Ponle un nombre')
    if (!amount) return setError('Escribe el valor')
    if (!account) return setError(kind === 'gasto' ? 'Elige de qué cuenta se paga' : 'Elige a qué cuenta llega')
    await saveLocal('recurring', {
      id: rec?.id, kind, freq: kind === 'gasto' && freq === 'quincenal' ? 'mensual' : freq, name: name.trim(), icon, amount,
      day, day2: freq === 'quincenal' ? day2 : 0, month: freq === 'anual' ? month : 0, category,
      account: kind === 'gasto' && cardOf(account) ? '' : account, card: kind === 'gasto' ? cardOf(account) : '',
    })
    onClose()
  }
  async function remove() {
    if (rec && confirm(`¿Eliminar "${rec.name}"? Los pagos ya registrados se conservan.`)) { await removeLocal('recurring', rec.id); onClose() }
  }

  const freqOptions = kind === 'ingreso'
    ? [{ value: 'mensual' as Freq, label: 'Mensual' }, { value: 'quincenal' as Freq, label: 'Quincenal' }, { value: 'anual' as Freq, label: 'Anual' }]
    : [{ value: 'mensual' as Freq, label: 'Cada mes' }, { value: 'anual' as Freq, label: 'Una vez al año' }]

  return (
    <Sheet title={rec ? 'Editar fijo' : kind === 'ingreso' ? 'Nuevo ingreso fijo' : 'Nuevo gasto fijo'} onClose={onClose}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save() }}>
        {!rec && <Segmented value={kind} onChange={(k) => { setKind(k); setCategory(''); if (k === 'gasto' && freq === 'quincenal') setFreq('mensual') }}
          options={[{ value: 'gasto', label: 'Gasto' }, { value: 'ingreso', label: 'Ingreso' }]} />}
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-fill text-3xl">{icon}</div>
          <input className="field" autoFocus={!rec} placeholder={kind === 'ingreso' ? 'Ej: Salario' : 'Ej: Arriendo, Netflix, SOAT…'} maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setError('') }} />
        </div>
        <MoneyInput big value={amount} onChange={(n) => { setAmount(n); setError('') }} />
        <div><span className="label">¿Cada cuánto?</span><Segmented value={freq} onChange={setFreq} options={freqOptions} /></div>

        {freq === 'anual' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mes"><select className="field" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m[0].toUpperCase() + m.slice(1)}</option>)}
            </select></Field>
            <Field label="Día"><DaySelect value={day} onChange={setDay} /></Field>
          </div>
        ) : freq === 'quincenal' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Primer pago (día)"><DaySelect value={day} onChange={setDay} /></Field>
            <Field label="Segundo pago (día)"><DaySelect value={day2} onChange={setDay2} /></Field>
          </div>
        ) : (
          <Field label={kind === 'ingreso' ? 'Día en que llega' : 'Día de pago'} hint="Si el mes tiene menos días, se toma el último.">
            <DaySelect value={day} onChange={setDay} />
          </Field>
        )}

        <AccountPicker value={account} onChange={(a) => { setAccount(a); setError('') }} amount={0} allowCards={kind === 'gasto'}
          direction={kind === 'gasto' ? 'out' : 'in'} label={kind === 'gasto' ? '¿Con qué se paga normalmente? (cuenta o tarjeta)' : '¿A qué cuenta llega?'} />

        <div><span className="label">Categoría (para el resumen)</span>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <button type="button" key={c.id} onClick={() => { setCategory(c.id); if (!rec && icon === '🧾') setIcon(c.icon) }}
                className={`rounded-full px-3 py-1.5 text-[13px] transition ${category === c.id ? 'bg-accent text-on-accent' : 'bg-surface ring-1 ring-line'}`}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>

        <EmojiPicker value={icon} onChange={setIcon} />

        {accounts.length === 0 && <p className="text-[13px] text-neg">Primero crea una cuenta.</p>}
        {error && <p className="text-center text-[14px] text-neg">{error}</p>}
        <div className="flex gap-2">
          {rec && <button type="button" className="btn-danger" onClick={() => void remove()}>Eliminar</button>}
          <button className="btn-primary flex-1">Guardar</button>
        </div>
      </form>
    </Sheet>
  )
}

function DaySelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
    </select>
  )
}

// Próximos pagos e ingresos pendientes (para el inicio).
export interface Upcoming { r: Recurring; occ: Occ; debt?: Debt; n?: number | null }
export function upcoming(recurring: Recurring[], paid: PaidMap, days = 30, extra?: { debts: Debt[]; txs: Tx[]; categories: { id: string; kind: string; name: string }[] }) {
  const now = thisMonth()
  const out: Upcoming[] = []
  for (const d of extra?.debts ?? []) {
    for (const m of [now, shiftMonth(now, 1)]) {
      const occ = debtOccurrence(d, m, extra!.txs)
      if (occ && !paid.has(`${d.id}|${occ.key}`) && daysUntil(occ.date) <= days) {
        const amount = isCard(d) ? cardStatement(d, m.y * 12 + m.m, extra!.txs, recurring).total : undefined
        if (isCard(d) && !amount) continue
        out.push({ r: debtAsRecurring(d, extra!.categories as never, amount), occ, debt: d, n: occ.n })
      }
    }
  }
  for (const r of recurring) {
    const occs = r.freq === 'anual' ? [nextAnnual(r, paid)] : [...occurrences(r, now), ...occurrences(r, shiftMonth(now, 1))]
    for (const occ of occs) {
      if (paid.has(`${r.id}|${occ.key}`)) continue
      if (daysUntil(occ.date) <= days) out.push({ r, occ })
    }
  }
  return out.sort((a, b) => a.occ.date.localeCompare(b.occ.date))
}
