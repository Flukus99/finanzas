import { useMemo, useState } from 'react'
import type { Debt, DebtKind, Tx } from '../lib/db'
import { DEBT_KINDS, debtAsRecurring, debtKind, debtOccurrence, debtStats, endYm } from '../lib/debts'
import { dueLabel, daysUntil, money, MONTHS, shortDate, thisMonth, today, ymLabel } from '../lib/format'
import { useAllTx, useCategories, useDebts, useRecurring } from '../lib/hooks'
import { monthlyCost, type Occ } from '../lib/recurring'
import { removeLocal, saveLocal } from '../lib/sync'
import { cardStatement, cardUsage, cutDay, isCard, nextPayDate, payDate, payDay, ymOf, type StatementItem } from '../lib/cards'
import { PaySheet } from './Fixed'
import { PlusIcon } from './Icons'
import { AccountPicker, CategoryBadge, EmojiPicker, Empty, Field, MoneyInput, Progress, Segmented, Sheet } from './ui'

export function Debts({ onEditTx }: { onEditTx: (t: Tx) => void }) {
  const debts = useDebts()
  const txs = useAllTx()
  const recurring = useRecurring()
  const categories = useCategories()
  const [editing, setEditing] = useState<Debt | 'new' | null>(null)
  const [paying, setPaying] = useState<{ d: Debt; occ: Occ; n: number | null } | null>(null)
  const [extra, setExtra] = useState<Debt | null>(null)
  const [balanceFor, setBalanceFor] = useState<Debt | null>(null)
  const [payingCard, setPayingCard] = useState<{ d: Debt; pay: number } | null>(null)

  const now = thisMonth()
  const rows = useMemo(() => debts.map((d) => ({ d, s: debtStats(d, txs), occ: debtOccurrence(d, now, txs) })), [debts, txs]) // eslint-disable-line react-hooks/exhaustive-deps
  const active = rows.filter((x) => !x.s.done)
  const finished = rows.filter((x) => x.s.done)
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const nowIdx = now.y * 12 + now.m
  // Mes del próximo pago de cada tarjeta: este mes si aún no lo pagaste (o no ha vencido), si no el siguiente.
  const cardPay = (d: Debt) => {
    const paidNow = txs.some((t) => t.debt === d.id && t.period === ymOf(nowIdx))
    return !paidNow && (payDate(d, nowIdx) >= today() || cardStatement(d, nowIdx, txs, recurring).total > 0) ? nowIdx : nowIdx + 1
  }
  const cards = active.filter((x) => isCard(x.d))
  const loans = active.filter((x) => !isCard(x.d))
  const monthlyOf = (x: (typeof rows)[number]) => (isCard(x.d) ? cardStatement(x.d, nowIdx, txs, recurring).total : x.occ ? x.d.cuota : 0)

  const owed = active.reduce((a, x) => a + x.s.owed, 0)
  const monthCuotas = active.reduce((a, x) => a + monthlyOf(x), 0)
  const monthPaid = active.concat(finished).reduce((a, x) => a + (x.occ ? txs.filter((t) => t.debt === x.d.id && t.period === x.occ!.key).reduce((s, t) => s + t.amount, 0) : 0), 0)
  const income = recurring.filter((r) => r.kind === 'ingreso').reduce((a, r) => a + monthlyCost(r), 0)
  const pct = income ? Math.round((active.reduce((a, x) => a + (isCard(x.d) ? cardStatement(x.d, cardPay(x.d), txs, recurring).total : x.d.cuota), 0) / income) * 100) : 0
  const level = pct <= 30 ? { t: 'Saludable', icon: '✅', cls: 'text-pos' }
    : pct <= 40 ? { t: 'Con cuidado', icon: '⚠️', cls: 'text-warn' } : { t: 'Alto', icon: '⛔', cls: 'text-neg' }
  const ends = loans.map((x) => endYm(x.d))
  const freeAt = ends.length && ends.every(Boolean) ? (ends as string[]).sort().at(-1)! : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Deudas</h1>
        <button className="btn-ghost py-2" onClick={() => setEditing('new')}><PlusIcon width={18} height={18} />Nueva</button>
      </div>

      {debts.length === 0 ? (
        <div className="card">
          <Empty>
            Registra tus créditos, tarjetas de crédito y préstamos.<br />Sus cuotas aparecerán en tus gastos fijos hasta que termines de pagarlas.
            <br /><button className="btn-primary mt-4" onClick={() => setEditing('new')}>Agregar deuda</button>
          </Empty>
        </div>
      ) : (
        <div className="card p-5">
          <div className="text-[13px] font-medium text-muted">Debes en total</div>
          <div className="mt-1 text-4xl font-semibold tracking-tight">{money(owed)}</div>
          <p className="mt-1 text-[13px] text-muted">
            {freeAt && !cards.length ? <>Si sigues pagando, quedas libre de deudas en <b>{ymLabel(freeAt)}</b>.</> : freeAt ? <>Tus créditos terminan en <b>{ymLabel(freeAt)}</b>; las tarjetas dependen de lo que compres.</> : active.length ? 'Tienes deudas sin plazo fijo (p. ej. tarjetas).' : '¡No tienes deudas activas! 🎉'}
          </p>
          <div className="mt-5 grid grid-cols-1 gap-2 border-t border-line pt-4 sm:grid-cols-3">
            <Row label={`A pagar en ${MONTHS[now.m]}`} value={money(monthCuotas)} />
            <Row label="Pagado este mes" value={money(monthPaid)} />
            {pct > 0 && <Row label="De tus ingresos fijos" value={<>{pct}% <span className={`text-[12px] font-medium ${level.cls}`}>{level.icon} {level.t}</span></>} />}
          </div>
        </div>
      )}

      {cards.length > 0 && (
        <section>
          <h2 className="section-title">Tarjetas de crédito</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {cards.map(({ d }, i) => (
              <CreditCard key={d.id} d={d} i={i} pay={cardPay(d)} txs={txs} recurring={recurring} catMap={catMap}
                onEdit={() => setEditing(d)} onPay={(pay) => setPayingCard({ d, pay })} onBalance={() => setBalanceFor(d)} onSeeTx={onEditTx} />
            ))}
          </div>
        </section>
      )}

      {loans.length > 0 && (
        <div className="space-y-2.5">
        {cards.length > 0 && <h2 className="section-title">Créditos y préstamos</h2>}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {loans.map(({ d, s, occ }) => (
            <DebtCard key={d.id} d={d} s={s} occ={occ} txs={txs} onEdit={() => setEditing(d)}
              onPay={() => occ && setPaying({ d, occ, n: occ.n })} onExtra={() => setExtra(d)} onBalance={() => setBalanceFor(d)}
              onSeePaid={(t) => onEditTx(t)} />
          ))}
        </div>
        </div>
      )}

      {finished.length > 0 && (
        <section>
          <h2 className="section-title">Pagadas 🎉</h2>
          <div className="card divide-y divide-line overflow-hidden">
            {finished.map(({ d, s }) => (
              <button key={d.id} onClick={() => setEditing(d)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover">
                <CategoryBadge icon={d.icon || debtKind(d.kind).icon} color="#30d158" size={36} />
                <span className="min-w-0 flex-1 truncate text-[15px]">{d.name}</span>
                <span className="text-[13px] text-muted">{isCard(d) ? 'Tarjeta cerrada' : `Pagaste ${money(s.paidAmount)} en la app`}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {editing && <DebtSheet debt={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {paying && <PaySheet r={debtAsRecurring(paying.d, categories)} occ={paying.occ} debt={paying.d.id}
        label={paying.n ? `Cuota ${paying.n} de ${paying.d.installments}` : undefined} onClose={() => setPaying(null)} />}
      {payingCard && <CardPaySheet card={payingCard.d} pay={payingCard.pay} onClose={() => setPayingCard(null)} />}
      {extra && <ExtraSheet debt={extra} onClose={() => setExtra(null)} />}
      {balanceFor && <BalanceSheet debt={balanceFor} onClose={() => setBalanceFor(null)} />}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <div className="text-[13px] text-muted sm:text-[12px]">{label}</div>
      <div className="text-[16px] font-semibold whitespace-nowrap">{value}</div>
    </div>
  )
}

function DebtCard({ d, s, occ, txs, onEdit, onPay, onExtra, onBalance, onSeePaid }: {
  d: Debt; s: ReturnType<typeof debtStats>; occ: ReturnType<typeof debtOccurrence>; txs: Tx[]
  onEdit: () => void; onPay: () => void; onExtra: () => void; onBalance: () => void; onSeePaid: (t: Tx) => void
}) {
  const k = debtKind(d.kind)
  const end = endYm(d)
  const paidTx = occ ? txs.find((t) => t.debt === d.id && t.period === occ.key) : undefined
  const n = occ ? daysUntil(occ.date) : 0
  return (
    <div className="card space-y-3.5 p-4">
      <button onClick={onEdit} className="flex w-full items-center gap-3 text-left">
        <CategoryBadge icon={d.icon || k.icon} color="#ff453a" size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold">{d.name}</div>
          <div className="truncate text-[13px] text-muted">{k.long}{d.lender ? ` · ${d.lender}` : ''}{d.rate ? ` · ${d.rate}%` : ''}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[16px] font-semibold">{money(d.cuota)}</div>
          <div className="text-[12px] text-muted">al mes · día {d.day}</div>
        </div>
      </button>

      <div>
        <Progress value={s.progress} color="#30d158" />
        <div className="mt-1.5 flex justify-between gap-2 text-[12px] text-muted">
          <span>{d.installments ? `${s.paidCount} de ${d.installments} cuotas pagadas · faltan ${s.remainingCount}` : 'Sin plazo fijo'}</span>
          {end && <span>Última: {ymLabel(end)}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-fill-soft p-3 text-[13px]">
        <div>
          <div className="text-[12px] text-muted">{d.balance_date ? 'Saldo según la entidad' : 'Te falta pagar (aprox.)'}</div>
          <div className="font-semibold">{money(s.owed)}</div>
          <button className="text-[12px] text-accent" onClick={onBalance}>{d.balance_date ? `Actualizado ${shortDate(d.balance_date)} · cambiar` : 'Poner saldo real'}</button>
        </div>
        <div>
          <div className="text-[12px] text-muted">Pagado en la app</div>
          <div className="font-semibold">{money(s.paidAmount)}</div>
          {d.amount > 0 && <div className="text-[12px] text-muted">de {money(d.amount)} {d.kind === 'tarjeta' ? 'que debías' : 'prestados'}</div>}
        </div>
      </div>

      {occ ? (
        paidTx ? (
          <button onClick={() => onSeePaid(paidTx)} className="flex w-full items-center justify-between rounded-xl bg-pos/10 px-3 py-2.5 text-[14px] text-pos">
            <span>Cuota de {MONTHS[Number(occ.key.slice(5)) - 1]} pagada ✓</span><span className="font-semibold">{money(paidTx.amount)}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`min-w-0 flex-1 text-[13px] ${n < 0 ? 'text-neg' : n <= 3 ? 'text-warn' : 'text-muted'}`}>
              {occ.n ? `Cuota ${occ.n}` : 'Próximo pago'} · {dueLabel(n)}
            </span>
            <button className="btn-primary py-2" onClick={onPay}>{occ.n ? 'Pagar cuota' : 'Pagar'}</button>
          </div>
        )
      ) : (
        <p className="text-[13px] text-muted">La próxima cuota es el {shortDate(d.next_date)}.</p>
      )}
      <button className="w-full text-center text-[13px] text-accent" onClick={onExtra}>+ Abono extra a la deuda</button>
    </div>
  )
}

// ── Crear / editar deuda ───────────────────────────────────────────────────
export function DebtSheet({ debt, onClose, initialKind, onSaved }: { debt?: Debt; onClose: () => void; initialKind?: DebtKind; onSaved?: (id: string) => void }) {
  const [kind, setKind] = useState<DebtKind>(debt?.kind ?? initialKind ?? 'credito')
  const [name, setName] = useState(debt?.name ?? '')
  const [lender, setLender] = useState(debt?.lender ?? '')
  const [icon, setIcon] = useState(debt?.icon || debtKind(debt?.kind ?? initialKind ?? 'credito').icon)
  const [amount, setAmount] = useState(debt?.amount ?? 0)
  const [cuota, setCuota] = useState(debt?.cuota ?? 0)
  const [installments, setInstallments] = useState(debt?.installments ?? 12)
  const [paidBefore, setPaidBefore] = useState(debt?.paid_before ?? 0)
  const [nextDate, setNextDate] = useState(debt?.next_date ?? today())
  const [rate, setRate] = useState(debt?.rate ? String(debt.rate) : '')
  const [account, setAccount] = useState(debt?.account ?? '')
  const [note, setNote] = useState(debt?.note ?? '')
  const [limit, setLimit] = useState(debt?.limit ?? 0)
  const [cut, setCut] = useState(debt?.cut_day || 15)
  const [pDay, setPDay] = useState(debt?.day || 30)
  const [error, setError] = useState('')
  const card = kind === 'tarjeta'

  const left = installments ? Math.max(0, installments - paidBefore) : 0
  const preview = installments && nextDate ? endYm({ installments, paid_before: paidBefore, next_date: nextDate } as Debt) : null

  async function save() {
    if (!name.trim()) return setError('Ponle un nombre')
    if (card) {
      if (!limit) return setError('Escribe el cupo de la tarjeta')
      if (!account) return setError('Elige desde qué cuenta la pagas')
      const base = { cut_day: cut, day: pDay } as Debt
      const id = await saveLocal('debts', {
        id: debt?.id, kind, name: name.trim(), lender: lender.trim(), icon, amount, cuota, installments: 0, paid_before: 0,
        limit, cut_day: cut, day: pDay, next_date: debt?.next_date && debt.kind === 'tarjeta' ? debt.next_date : nextPayDate(base),
        rate: Number(rate.replace(',', '.')) || 0, account, note: note.trim(),
        closed: debt?.closed ?? false, balance: debt?.balance ?? 0, balance_date: debt?.balance_date ?? '',
      })
      onSaved?.(id)
      return onClose()
    }
    if (!cuota) return setError('Escribe la cuota mensual')
    if (!nextDate) return setError('Elige la fecha de la próxima cuota')
    if (installments && paidBefore >= installments) return setError('Las cuotas pagadas deben ser menos que el total')
    if (!account) return setError('Elige de qué cuenta la pagas')
    await saveLocal('debts', {
      id: debt?.id, kind, name: name.trim(), lender: lender.trim(), icon, amount, cuota, installments, paid_before: paidBefore,
      next_date: nextDate, day: Number(nextDate.slice(8)), rate: Number(rate.replace(',', '.')) || 0, account, note: note.trim(),
      closed: debt?.closed ?? false, balance: debt?.balance ?? 0, balance_date: debt?.balance_date ?? '',
    })
    onClose()
  }
  async function toggleClosed() {
    if (!debt) return
    const msg = debt.closed ? '¿Reactivar esta deuda? Sus cuotas volverán a aparecer en tus gastos fijos.' : '¿Marcar como pagada? Sus cuotas dejarán de aparecer en tus gastos fijos.'
    if (confirm(msg)) { await saveLocal('debts', { id: debt.id, closed: !debt.closed }); onClose() }
  }
  async function remove() {
    if (debt && confirm(`¿Eliminar "${debt.name}"? Los pagos ya registrados se conservan como gastos.`)) { await removeLocal('debts', debt.id); onClose() }
  }

  return (
    <Sheet title={debt ? (card ? 'Editar tarjeta' : 'Editar deuda') : card ? 'Nueva tarjeta de crédito' : 'Nueva deuda'} onClose={onClose}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Segmented value={kind} onChange={(k) => { if (icon === debtKind(kind).icon) setIcon(debtKind(k).icon); setKind(k); if (!debt && k === 'tarjeta') setInstallments(0) }}
          options={DEBT_KINDS.map((k) => ({ value: k.value, label: k.label }))} />
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-fill text-3xl">{icon}</div>
          <div className="min-w-0 flex-1 space-y-2">
            <input className="field" autoFocus={!debt} placeholder={kind === 'tarjeta' ? 'Ej: Tarjeta Visa' : kind === 'prestamo' ? 'Ej: Préstamo de mi tío' : 'Ej: Crédito libre inversión'} maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setError('') }} />
            <input className="field" placeholder={kind === 'prestamo' ? '¿Quién te prestó?' : 'Entidad (Bancolombia, Davivienda…)'} maxLength={60} value={lender} onChange={(e) => setLender(e.target.value)} />
          </div>
        </div>

        {card ? (
          <>
            <Field label="Cupo total"><MoneyInput value={limit} onChange={(n) => { setLimit(n); setError('') }} /></Field>
            <Field label="¿Cuánto debes hoy en la tarjeta?" hint="Lo que ya habías usado antes de empezar a registrar compras aquí (0 si está en ceros).">
              <MoneyInput value={amount} onChange={setAmount} />
            </Field>
            {amount > 0 && (
              <Field label="¿Cuánto pagas al mes de esa deuda? (opcional)" hint="Si esa deuda está a cuotas, pon la cuota; se suma a cada extracto mientras quede saldo.">
                <MoneyInput value={cuota} onChange={setCuota} />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Día de corte"><DaySel value={cut} onChange={setCut} /></Field>
              <Field label="Día de pago"><DaySel value={pDay} onChange={setPDay} /></Field>
            </div>
            <p className="-mt-2 px-1 text-[12px] text-muted">Las compras hasta el día {cut} se pagan el {pDay} {pDay > cut ? 'de ese mismo mes' : 'del mes siguiente'}.</p>
            <AccountPicker value={account} onChange={(a) => { setAccount(a); setError('') }} amount={0} direction="out" label="¿Desde qué cuenta la pagas?" />
          </>
        ) : (<>
        <div>
          <span className="label">Cuota mensual</span>
          <MoneyInput value={cuota} onChange={(n) => { setCuota(n); setError('') }} />
          <p className="mt-1.5 px-1 text-[12px] text-muted">Escríbela como te la cobra la entidad (con intereses y seguros). Al pagar cada mes la puedes ajustar.</p>
        </div>
        <Field label="¿Cuánto te prestaron?">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Total de cuotas" hint={installments ? undefined : 'Sin plazo fijo'}>
            <input className="field" inputMode="numeric" value={installments || ''} placeholder="0"
              onChange={(e) => setInstallments(Math.min(600, Number(e.target.value.replace(/\D/g, '')) || 0))} />
          </Field>
          <Field label="Cuotas ya pagadas">
            <input className="field" inputMode="numeric" value={paidBefore || ''} placeholder="0" disabled={!installments}
              onChange={(e) => setPaidBefore(Number(e.target.value.replace(/\D/g, '')) || 0)} />
          </Field>
        </div>
        <Field label="Fecha de la próxima cuota" hint={preview ? `Te faltan ${left} cuotas · la última es en ${ymLabel(preview)}.` : 'Se paga cada mes ese mismo día hasta que la marques como pagada.'}>
          <input type="date" className="field" value={nextDate} onChange={(e) => { setNextDate(e.target.value); setError('') }} />
        </Field>

        <AccountPicker value={account} onChange={(a) => { setAccount(a); setError('') }} amount={0} direction="out" label="¿De qué cuenta la pagas?" />
        </>)}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tasa de interés (opcional)"><input className="field" inputMode="decimal" placeholder="Ej: 1,8 % mensual" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, ''))} /></Field>
          <Field label="Nota"><input className="field" placeholder="Opcional" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <EmojiPicker value={icon} onChange={setIcon} />

        {error && <p className="text-center text-[14px] text-neg">{error}</p>}
        <button className="btn-primary w-full">Guardar</button>
        {debt && (
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" onClick={() => void toggleClosed()}>{debt.closed ? 'Reactivar' : card ? 'Cerrar tarjeta' : '✓ Marcar como pagada'}</button>
            <button type="button" className="btn-danger" onClick={() => void remove()}>Eliminar</button>
          </div>
        )}
      </form>
    </Sheet>
  )
}

// Abono extra (a capital): un gasto ligado a la deuda que no cuenta como cuota.
function ExtraSheet({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const categories = useCategories()
  const [amount, setAmount] = useState(0)
  const [account, setAccount] = useState(debt.account)
  const [date, setDate] = useState(today())
  const [error, setError] = useState('')
  async function save() {
    if (!amount) return setError('Escribe el valor')
    if (!account) return setError('Elige de dónde sale el dinero')
    const cat = categories.find((c) => c.kind === 'gasto' && c.name === 'Deudas')
    await saveLocal('transactions', { kind: 'gasto', amount, account, date, category: cat?.id ?? '', debt: debt.id, note: `${debt.name} · abono extra` })
    onClose()
  }
  return (
    <Sheet title={`Abono extra a ${debt.name}`} onClose={onClose}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <p className="text-center text-[13px] text-muted">Un pago adicional a la cuota (abono a capital). Después actualiza el saldo con lo que te diga la entidad.</p>
        <MoneyInput big autoFocus value={amount} onChange={(n) => { setAmount(n); setError('') }} />
        <AccountPicker value={account} onChange={(a) => { setAccount(a); setError('') }} amount={amount} direction="out" gmf date={date} />
        <Field label="Fecha"><input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value || date)} /></Field>
        {error && <p className="text-center text-[14px] text-neg">{error}</p>}
        <button className="btn-primary w-full">Registrar abono</button>
      </form>
    </Sheet>
  )
}

function BalanceSheet({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const [balance, setBalance] = useState(debt.balance ?? 0)
  async function save(clear?: boolean) {
    await saveLocal('debts', { id: debt.id, balance: clear ? 0 : balance, balance_date: clear ? '' : today() })
    onClose()
  }
  return (
    <Sheet title="Saldo real de la deuda" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-center text-[13px] text-muted">Escribe lo que te dice {debt.lender || 'la entidad'} que debes hoy (en la app, el extracto o el certificado de deuda).</p>
        <MoneyInput big autoFocus value={balance} onChange={setBalance} />
        <button className="btn-primary w-full" onClick={() => void save()}>Guardar saldo</button>
        {debt.balance_date && <button className="btn-ghost w-full" onClick={() => void save(true)}>Usar el estimado de la app</button>}
      </div>
    </Sheet>
  )
}

function DaySel({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
    </select>
  )
}

// ── Tarjeta de crédito: cupo, próximo pago y lo que vas a pagar ─────────────
const CARD_BG = [
  'linear-gradient(135deg, #0f2a24 0%, #134e40 55%, #1f7a5f 100%)',
  'linear-gradient(135deg, #1b1d2e 0%, #2b2f4a 55%, #46507a 100%)',
  'linear-gradient(135deg, #2a1b12 0%, #4a2e1a 55%, #7a4f2a 100%)',
  'linear-gradient(135deg, #1e1e1e 0%, #333 55%, #555 100%)',
]

function CreditCard({ d, i, pay, txs, recurring, catMap, onEdit, onPay, onBalance, onSeeTx }: {
  d: Debt; i: number; pay: number; txs: Tx[]; recurring: ReturnType<typeof useRecurring>; catMap: Map<string, { icon: string; name: string }>
  onEdit: () => void; onPay: (pay: number) => void; onBalance: () => void; onSeeTx: (t: Tx) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const u = cardUsage(d, txs)
  const st = cardStatement(d, pay, txs, recurring, catMap)
  const owed = d.balance_date ? d.balance : u.used
  const pct = u.limit ? Math.min(1, u.used / u.limit) : 0
  const n = daysUntil(st.due)
  const items = showAll ? st.items : st.items.slice(0, 5)
  return (
    <div className="card overflow-hidden">
      <button onClick={onEdit} className="relative block w-full overflow-hidden p-5 text-left text-white" style={{ background: CARD_BG[i % CARD_BG.length] }} aria-label={`Editar ${d.name}`}>
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[16px] font-bold">{d.name}</div>
            <div className="text-[12px] text-white/60">{d.lender || 'Tarjeta de crédito'}</div>
          </div>
          <span aria-hidden className="h-7 w-10 rounded-md bg-gradient-to-br from-[#f4d47c] to-[#c9a24a] opacity-90" />
        </div>
        <div className="mt-6 text-[12px] text-white/60">{u.available !== null ? 'Cupo disponible' : 'Debes'}</div>
        <div className="num text-[30px] leading-tight font-extrabold tracking-tight">{money(u.available ?? owed)}</div>
        {u.limit > 0 && (
          <>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: pct > 0.8 ? '#ff6b6e' : 'var(--lime)' }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[12px] text-white/70">
              <span>Usado {money(u.used)}</span><span>Cupo {money(u.limit)}</span>
            </div>
          </>
        )}
        <div className="mt-3 flex gap-4 text-[11px] font-semibold tracking-wide text-white/55 uppercase">
          <span>Corte día {cutDay(d)}</span><span>Pago día {payDay(d)}</span>
        </div>
      </button>

      <div className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-muted">Próximo pago · {shortDate(st.due)} <span className={n < 0 ? 'text-neg' : n <= 3 ? 'text-warn' : ''}>({dueLabel(n).toLowerCase()})</span></div>
            <div className="num text-[22px] font-extrabold">{money(st.total)}</div>
            <div className="text-[12px] text-faint">Estimado sin intereses · corte del {shortDate(st.cut)}</div>
          </div>
          <button className="btn-primary" onClick={() => onPay(pay)}>Pagar</button>
        </div>

        <div>
          <div className="mb-1 text-[12px] font-bold tracking-wide text-muted uppercase">Lo que vas a pagar</div>
          {st.items.length === 0 && <p className="py-2 text-[13px] text-muted">Nada en este extracto. Las compras con esta tarjeta aparecerán aquí.</p>}
          <div className="divide-y divide-line">
            {items.map((it) => <StatementRow key={it.key} it={it} onClick={it.tx ? () => onSeeTx(it.tx!) : undefined} />)}
          </div>
          {st.items.length > 5 && (
            <button className="mt-1 text-[13px] font-semibold text-accent" onClick={() => setShowAll(!showAll)}>{showAll ? 'Ver menos' : `Ver los ${st.items.length}`}</button>
          )}
        </div>
        <button className="text-[12px] text-accent" onClick={onBalance}>
          {d.balance_date ? `Saldo según el banco: ${money(d.balance)} (${shortDate(d.balance_date)}) · cambiar` : 'Poner el saldo real del banco'}
        </button>
      </div>
    </div>
  )
}

function StatementRow({ it, onClick }: { it: StatementItem; onClick?: () => void }) {
  return (
    <button type="button" disabled={!onClick} onClick={onClick} className="flex w-full items-center gap-3 py-2.5 text-left disabled:cursor-default">
      <CategoryBadge icon={it.icon} color="#8e8e93" size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{it.label}</div>
        <div className="truncate text-[12px] text-muted">{it.detail}{it.kind === 'programado' ? ' · programado' : ''}</div>
      </div>
      <span className="num text-[14px] font-bold">{money(it.amount)}</span>
    </button>
  )
}

// Pagar la tarjeta: el dinero pasa de una cuenta a la tarjeta (no es un gasto nuevo,
// las compras ya se contaron). Intereses y cuota de manejo sí quedan como gasto.
export function CardPaySheet({ card, pay, onClose }: { card: Debt; pay: number; onClose: () => void }) {
  const txs = useAllTx()
  const recurring = useRecurring()
  const categories = useCategories()
  const st = cardStatement(card, pay, txs, recurring)
  const u = cardUsage(card, txs)
  const [amount, setAmount] = useState(st.total || u.used)
  const [interest, setInterest] = useState(0)
  const [account, setAccount] = useState(card.account)
  const [date, setDate] = useState(today())
  const [error, setError] = useState('')

  async function save() {
    if (!amount) return setError('Escribe cuánto pagaste')
    if (interest > amount) return setError('Los intereses no pueden ser más que el pago')
    if (!account) return setError('Elige de qué cuenta pagaste')
    const principal = amount - interest
    if (principal > 0) {
      await saveLocal('transactions', { kind: 'transferencia', amount: principal, account, to: '', debt: card.id, recurring: card.id, period: ymOf(pay), date, note: `Pago ${card.name}`, category: '' })
    }
    if (interest > 0) {
      const cat = categories.find((c) => c.kind === 'gasto' && c.name === 'Deudas')
      await saveLocal('transactions', { kind: 'gasto', amount: interest, account, debt: card.id, category: cat?.id ?? '', date, note: `Intereses y cuota de manejo · ${card.name}` })
    }
    onClose()
  }

  return (
    <Sheet title={`Pagar ${card.name}`} onClose={onClose}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <p className="text-center text-[13px] text-muted">Extracto con corte el {shortDate(st.cut)} · vence el {shortDate(st.due)}</p>
        <MoneyInput big autoFocus value={amount} onChange={(n) => { setAmount(n); setError('') }} />
        <div className="flex flex-wrap justify-center gap-2">
          {st.total > 0 && <button type="button" className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ${amount === st.total ? 'bg-accent text-on-accent' : 'bg-fill'}`} onClick={() => setAmount(st.total)}>Este extracto · {money(st.total)}</button>}
          {u.used > 0 && u.used !== st.total && <button type="button" className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ${amount === u.used ? 'bg-accent text-on-accent' : 'bg-fill'}`} onClick={() => setAmount(u.used)}>Toda la deuda · {money(u.used)}</button>}
        </div>
        <Field label="De lo que pagaste, ¿cuánto fue intereses y cuota de manejo?" hint="Míralo en el extracto del banco. Esa parte sí cuenta como gasto; el resto solo baja la deuda de la tarjeta.">
          <MoneyInput value={interest} onChange={setInterest} />
        </Field>
        <AccountPicker value={account} onChange={(a) => { setAccount(a); setError('') }} amount={amount} direction="out" gmf date={date} label="¿De qué cuenta pagaste?" />
        <Field label="Fecha"><input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value || date)} /></Field>
        {error && <p className="text-center text-[14px] text-neg">{error}</p>}
        <button className="btn-primary w-full">Registrar pago</button>
      </form>
    </Sheet>
  )
}
