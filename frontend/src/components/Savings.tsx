import { useMemo, useState } from 'react'
import type { Goal, GoalKind, Recurring, Tx } from '../lib/db'
import { money, monthsUntil, today, ymLabel } from '../lib/format'
import { useAllTx, useGoals, useRecurring } from '../lib/hooks'
import { goalSaved, monthlyCost, nextAnnual, paidMap } from '../lib/recurring'
import { removeLocal, saveLocal } from '../lib/sync'
import { AnnualPlan } from './AnnualPlan'
import { PlusIcon } from './Icons'
import { AccountPicker, CategoryBadge, EmojiPicker, Empty, Field, MoneyInput, Progress, Segmented, Sheet } from './ui'

const KINDS: { value: GoalKind; label: string; title: string; icon: string; color: string; hint: string }[] = [
  { value: 'emergencia', label: 'Emergencia', title: 'Colchón de emergencia', icon: '🆘', color: '#ff453a', hint: 'Para imprevistos: lo ideal es tener de 3 a 6 meses de tus gastos fijos.' },
  { value: 'anual', label: 'Gasto anual', title: 'Para gastos anuales', icon: '📅', color: '#ff9f0a', hint: 'Ahorra poco a poco para el SOAT, seguros, impuestos…' },
  { value: 'meta', label: 'Meta', title: 'Metas y compras', icon: '🎯', color: '#0a84ff', hint: 'Una moto, unos zapatos, un viaje…' },
]

export function Savings() {
  const goals = useGoals()
  const txs = useAllTx()
  const recurring = useRecurring()
  const saved = useMemo(() => goalSaved(txs), [txs])
  const [editing, setEditing] = useState<Goal | GoalKind | null>(null)
  const [moving, setMoving] = useState<{ goal: Goal; dir: 'ahorro' | 'retiro' } | null>(null)
  const total = goals.reduce((a, g) => a + (saved.get(g.id) ?? 0), 0)
  const fixedMonthly = recurring.filter((r) => r.kind === 'gasto').reduce((a, r) => a + monthlyCost(r), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Ahorros</h1>
        <button className="btn-ghost py-2" onClick={() => setEditing('meta')}><PlusIcon width={18} height={18} />Nuevo</button>
      </div>
      <div className="card p-5">
        <div className="text-[13px] font-medium text-muted">Total ahorrado</div>
        <div className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{money(total)}</div>
        <p className="mt-2 text-[13px] text-muted">Este dinero está separado: no cuenta en el saldo disponible de tus cuentas.</p>
      </div>

      {KINDS.map((k) => {
        const list = goals.filter((g) => g.kind === k.value)
        return (
          <section key={k.value}>
            <div className="flex items-baseline justify-between">
              <h2 className="section-title">{k.title}</h2>
              <button className="flex items-center gap-1 px-1 text-[14px] text-accent" onClick={() => setEditing(k.value)}><PlusIcon width={16} height={16} />Agregar</button>
            </div>
            {k.value === 'anual' && <div className="mb-3"><AnnualPlan /></div>}
            {list.length === 0 ? (
              <div className="card"><Empty>{k.hint}{k.value === 'emergencia' && fixedMonthly > 0 && <><br /><span className="text-[13px]">Para ti: entre {money(Math.round(fixedMonthly * 3))} y {money(Math.round(fixedMonthly * 6))}.</span></>}</Empty></div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {list.map((g) => <GoalCard key={g.id} goal={g} have={saved.get(g.id) ?? 0} onEdit={() => setEditing(g)}
                  onAdd={() => setMoving({ goal: g, dir: 'ahorro' })} onTake={() => setMoving({ goal: g, dir: 'retiro' })} />)}
              </div>
            )}
          </section>
        )
      })}

      {editing && <GoalSheet goal={typeof editing === 'string' ? undefined : editing}
        defaults={{ kind: typeof editing === 'string' ? editing : editing.kind }} onClose={() => setEditing(null)} />}
      {moving && <MoveSheet goal={moving.goal} dir={moving.dir} have={saved.get(moving.goal.id) ?? 0} onClose={() => setMoving(null)} />}
    </div>
  )
}

function GoalCard({ goal, have, onEdit, onAdd, onTake }: { goal: Goal; have: number; onEdit: () => void; onAdd: () => void; onTake: () => void }) {
  const pct = goal.target ? have / goal.target : 0
  const left = Math.max(0, goal.target - have)
  const perMonth = goal.deadline && left ? Math.ceil(left / monthsUntil(goal.deadline)) : 0
  return (
    <div className="card space-y-3 p-4">
      <button onClick={onEdit} className="flex w-full items-center gap-3 text-left">
        <CategoryBadge icon={goal.icon} color={goal.color} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold">{goal.name}</div>
          <div className="text-[13px] text-muted">
            {goal.target ? `Meta ${money(goal.target)}` : 'Sin meta'}{goal.deadline ? ` · para ${ymLabel(goal.deadline)}` : ''}
          </div>
        </div>
      </button>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[20px] font-semibold tabular-nums">{money(have)}</span>
          {goal.target > 0 && <span className="text-[13px] text-muted tabular-nums">{Math.round(pct * 100)}%</span>}
        </div>
        {goal.target > 0 && <Progress value={pct} color={goal.color} />}
        <p className="mt-1.5 text-[12px] text-muted">
          {goal.target > 0 && left === 0 ? '¡Meta cumplida! 🎉' : perMonth ? `Ahorra ${money(perMonth)} al mes para llegar a tiempo` : goal.target ? `Faltan ${money(left)}` : ''}
        </p>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary flex-1 py-2" onClick={onAdd}>Abonar</button>
        <button className="btn-ghost flex-1 py-2" onClick={onTake} disabled={have <= 0}>Retirar</button>
      </div>
    </div>
  )
}

// ── Crear / editar ahorro ──────────────────────────────────────────────────
export function GoalSheet({ goal, defaults, onClose }: {
  goal?: Goal; defaults: { kind: GoalKind; linked?: Recurring; deadline?: string }; onClose: () => void
}) {
  const recurring = useRecurring()
  const txs = useAllTx()
  const annual = recurring.filter((r) => r.kind === 'gasto' && r.freq === 'anual')
  const fixedMonthly = recurring.filter((r) => r.kind === 'gasto').reduce((a, r) => a + monthlyCost(r), 0)
  const linkedInit = defaults.linked
  const kInit = KINDS.find((k) => k.value === (goal?.kind ?? defaults.kind))!

  const [kind, setKind] = useState<GoalKind>(kInit.value)
  const [name, setName] = useState(goal?.name ?? linkedInit?.name ?? '')
  const [icon, setIcon] = useState(goal?.icon ?? linkedInit?.icon ?? kInit.icon)
  const [target, setTarget] = useState(goal?.target ?? linkedInit?.amount ?? 0)
  const [deadline, setDeadline] = useState(goal?.deadline ?? defaults.deadline ?? '')
  const [linked, setLinked] = useState(goal?.recurring ?? linkedInit?.id ?? '')
  const [error, setError] = useState('')

  function link(id: string) {
    setLinked(id)
    const r = annual.find((x) => x.id === id)
    if (!r) return
    setName(r.name); setIcon(r.icon); setTarget(r.amount)
    setDeadline(nextAnnual(r, paidMap(txs)).date.slice(0, 7))
  }

  async function save() {
    if (!name.trim()) return setError('Ponle un nombre')
    const color = KINDS.find((k) => k.value === kind)!.color
    await saveLocal('goals', { id: goal?.id, kind, name: name.trim(), icon, color, target, deadline, recurring: kind === 'anual' ? linked : '' })
    onClose()
  }
  async function remove() {
    if (goal && confirm(`¿Eliminar el ahorro "${goal.name}"? Lo que tenga ahorrado debes retirarlo antes a una cuenta.`)) {
      await removeLocal('goals', goal.id); onClose()
    }
  }

  return (
    <Sheet title={goal ? 'Editar ahorro' : 'Nuevo ahorro'} onClose={onClose}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Segmented value={kind} onChange={(k) => { setKind(k); if (!goal && icon === kInit.icon) setIcon(KINDS.find((x) => x.value === k)!.icon) }}
          options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
        <p className="-mt-2 px-1 text-[13px] text-muted">{KINDS.find((k) => k.value === kind)!.hint}</p>

        {kind === 'anual' && (
          <Field label="¿Para qué gasto anual?" hint={annual.length ? undefined : 'Aún no tienes gastos anuales. Créalos en Fijos → Anuales.'}>
            <select className="field" value={linked} onChange={(e) => link(e.target.value)}>
              <option value="">— Ninguno —</option>
              {annual.map((r) => <option key={r.id} value={r.id}>{r.icon} {r.name} · {money(r.amount)}</option>)}
            </select>
          </Field>
        )}

        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-fill text-3xl">{icon}</div>
          <input className="field" placeholder={kind === 'meta' ? 'Ej: Moto, zapatos, viaje…' : 'Nombre'} maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setError('') }} />
        </div>
        <div>
          <span className="label">¿Cuánto quieres juntar?</span>
          <MoneyInput value={target} onChange={setTarget} />
          {kind === 'emergencia' && fixedMonthly > 0 && (
            <div className="mt-2 flex gap-2">
              {[3, 6].map((n) => (
                <button type="button" key={n} className="btn-ghost flex-1 py-1.5 text-[13px]" onClick={() => setTarget(Math.round(fixedMonthly * n))}>
                  {n} meses · {money(Math.round(fixedMonthly * n))}
                </button>
              ))}
            </div>
          )}
        </div>
        <Field label="¿Para cuándo? (opcional)" hint="Con fecha te digo cuánto ahorrar cada mes.">
          <input type="month" className="field" min={today().slice(0, 7)} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        <EmojiPicker value={icon} onChange={setIcon} />
        {error && <p className="text-center text-[14px] text-neg">{error}</p>}
        <div className="flex gap-2">
          {goal && <button type="button" className="btn-danger" onClick={() => void remove()}>Eliminar</button>}
          <button className="btn-primary flex-1">Guardar</button>
        </div>
      </form>
    </Sheet>
  )
}

// ── Abonar / retirar ───────────────────────────────────────────────────────
export function MoveSheet({ goal, dir, have, tx, onClose }: { goal: Goal; dir: 'ahorro' | 'retiro'; have: number; tx?: Tx; onClose: () => void }) {
  const [amount, setAmount] = useState(tx?.amount ?? 0)
  const [account, setAccount] = useState(tx?.account ?? '')
  const [date, setDate] = useState(tx?.date ?? today())
  const [note, setNote] = useState(tx?.note ?? '')
  const [error, setError] = useState('')
  const max = have + (tx?.kind === 'retiro' ? tx.amount : 0)

  async function save() {
    if (!amount) return setError('Escribe el valor')
    if (!account) return setError(dir === 'ahorro' ? 'Elige de dónde sale el dinero' : 'Elige a qué cuenta va')
    if (dir === 'retiro' && amount > max) return setError(`Solo tienes ${money(max)} en este ahorro`)
    await saveLocal('transactions', { id: tx?.id, kind: dir, amount, account, goal: goal.id, date, note: note.trim(), category: '' })
    onClose()
  }
  async function remove() {
    if (tx && confirm('¿Eliminar este movimiento?')) { await removeLocal('transactions', tx.id); onClose() }
  }

  return (
    <Sheet title={`${dir === 'ahorro' ? 'Abonar a' : 'Retirar de'} ${goal.name}`} onClose={onClose}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <div className="text-center">
          <div className="text-4xl">{goal.icon}</div>
          <div className="mt-1 text-[13px] text-muted">Ahorrado: {money(have)}{goal.target ? ` de ${money(goal.target)}` : ''}</div>
        </div>
        <MoneyInput big autoFocus={!tx} value={amount} onChange={(n) => { setAmount(n); setError('') }} />
        <AccountPicker value={account} onChange={(a) => { setAccount(a); setError('') }} amount={amount} excludeId={tx?.id}
          direction={dir === 'ahorro' ? 'out' : 'in'} label={dir === 'ahorro' ? '¿De dónde sale el dinero?' : '¿A qué cuenta va el dinero?'} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha"><input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value || date)} /></Field>
          <Field label="Nota"><input className="field" placeholder="Opcional" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        {error && <p className="text-center text-[14px] text-neg">{error}</p>}
        <div className="flex gap-2">
          {tx && <button type="button" className="btn-danger" onClick={() => void remove()}>Eliminar</button>}
          <button className="btn-primary flex-1">{dir === 'ahorro' ? 'Abonar' : 'Retirar'}</button>
        </div>
      </form>
    </Sheet>
  )
}
