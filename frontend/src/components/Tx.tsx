import { useMemo, useState } from 'react'
import type { Account, Category, Goal, Tx } from '../lib/db'
import { money, today } from '../lib/format'
import { useAccounts, useCategories, useDebts } from '../lib/hooks'
import { removeLocal, saveLocal } from '../lib/sync'
import { AccountPicker, CARD, CardInstallments, cardOf, CategoryBadge, MoneyInput, Segmented, Sheet } from './ui'

export function TxRow({ tx, cat, acc, goal, to, gmf, prefix, onClick }: {
  tx: Tx; cat?: Category; acc?: Account; goal?: Goal; to?: Account; gmf?: number; prefix?: string; onClick: () => void
}) {
  const pre = prefix ? `${prefix} · ` : ''
  const debts = useDebts()
  const card = tx.card ? debts.find((d) => d.id === tx.card) : undefined
  const paidCard = tx.kind === 'transferencia' && tx.debt ? debts.find((d) => d.id === tx.debt) : undefined
  const tax = gmf ? ` · 4x1000 ${money(gmf)}` : ''
  if (tx.kind === 'transferencia') {
    return (
      <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-hover">
        <CategoryBadge icon={paidCard ? '💳' : '🔁'} color="#8e8e93" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium">{paidCard ? `Pago ${paidCard.name}` : `${acc?.name ?? 'Cuenta'} → ${to?.name ?? 'Cuenta'}`}</div>
          <div className="truncate text-[13px] text-muted">
            {pre}{paidCard ? `Desde ${acc?.name ?? 'cuenta'}` : tx.note || 'Transferencia entre tus cuentas'}{tax}{tx._dirty ? ' · sin sincronizar' : ''}
          </div>
        </div>
        <div className="shrink-0 text-[15px] font-semibold tabular-nums text-muted">{money(tx.amount)}</div>
      </button>
    )
  }
  const isMove = tx.kind === 'ahorro' || tx.kind === 'retiro'
  const title = isMove ? `${tx.kind === 'ahorro' ? 'Ahorro' : 'Retiro'}: ${goal?.name ?? 'ahorro'}` : tx.note || cat?.name || 'Sin categoría'
  const sub = isMove
    ? `${tx.kind === 'ahorro' ? 'Desde' : 'Hacia'} ${acc?.name ?? 'cuenta'}${tx.note ? ` · ${tx.note}` : ''}`
    : `${tx.note ? `${cat?.name ?? 'Sin categoría'} · ` : ''}${card ? `💳 ${card.name}${(tx.card_n ?? 1) > 1 ? ` · ${tx.card_n} cuotas` : ''}` : acc?.name ?? 'Sin cuenta'}`
  const sign = tx.kind === 'ingreso' || tx.kind === 'retiro' ? '+' : '−'
  const color = tx.kind === 'ingreso' ? 'income' : isMove ? 'text-accent' : 'expense'
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-hover">
      <CategoryBadge icon={isMove ? goal?.icon ?? '🐷' : cat?.icon} color={isMove ? goal?.color ?? '#0a84ff' : cat?.color} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{title}</div>
        <div className="truncate text-[13px] text-muted">
          {pre}{sub}{tx.recurring ? ' · fijo' : ''}{tax}{tx._dirty ? ' · sin sincronizar' : ''}
        </div>
      </div>
      <div className={`shrink-0 text-[15px] font-semibold tabular-nums ${color}`}>{sign}{money(tx.amount)}</div>
    </button>
  )
}

type SheetKind = 'gasto' | 'ingreso' | 'transferencia'

export function TxSheet({ tx, initialKind, onClose }: { tx?: Tx; initialKind?: SheetKind; onClose: () => void }) {
  const categories = useCategories()
  const accounts = useAccounts()
  const [kind, setKind] = useState<SheetKind>(tx?.kind === 'ingreso' || tx?.kind === 'transferencia' ? tx.kind : tx ? 'gasto' : initialKind ?? 'gasto')
  const [to, setTo] = useState(tx?.to ?? '')
  const [fee, setFee] = useState(0)
  const [amount, setAmount] = useState(tx?.amount ?? 0)
  const [category, setCategory] = useState(tx?.category ?? '')
  // sin valor por defecto: hay que elegir de dónde sale (cuenta o tarjeta de crédito)
  const [account, setAccount] = useState(tx?.card ? CARD + tx.card : tx?.account ?? '')
  const [cardN, setCardN] = useState(tx?.card_n || 1)
  const [date, setDate] = useState(tx?.date ?? today())
  const [note, setNote] = useState(tx?.note ?? '')
  const [error, setError] = useState('')

  const cats = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind])

  async function save() {
    if (!amount) return setError('Escribe el valor')
    if (kind === 'transferencia') {
      if (!account) return setError('Elige de qué cuenta sale')
      if (!to) return setError('Elige a qué cuenta llega')
      await saveLocal('transactions', { id: tx?.id, kind, amount, account, to, date, note: note.trim(), category: '' })
      if (fee > 0) {
        // La comisión sí es un gasto real.
        const other = categories.find((c) => c.kind === 'gasto' && c.name === 'Otros gastos') ?? categories.find((c) => c.kind === 'gasto')
        const toName = accounts.find((a) => a.id === to)?.name ?? ''
        await saveLocal('transactions', { kind: 'gasto', amount: fee, account, category: other?.id ?? '', date, note: `Comisión transferencia a ${toName}` })
      }
      return onClose()
    }
    if (!cats.some((c) => c.id === category)) return setError('Elige una categoría')
    if (!account) return setError(kind === 'gasto' ? 'Elige de dónde sale el dinero' : 'Elige a dónde llega el dinero')
    const card = kind === 'gasto' ? cardOf(account) : ''
    await saveLocal('transactions', {
      id: tx?.id, kind, amount, category, date, note: note.trim(),
      account: card ? '' : account, card, card_n: card ? cardN : 0,
    })
    onClose()
  }

  async function remove() {
    const extra = tx?.recurring ? ' El gasto fijo volverá a quedar como pendiente.' : ''
    if (tx && confirm(`¿Eliminar este movimiento?${extra}`)) { await removeLocal('transactions', tx.id); onClose() }
  }

  return (
    <Sheet title={kind === 'transferencia' ? (tx ? 'Editar transferencia' : 'Transferir entre cuentas') : tx ? 'Editar movimiento' : 'Nuevo movimiento'} onClose={onClose}>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save() }}>
        {!tx?.recurring && (
          <Segmented value={kind} onChange={(k) => { setKind(k); setCategory(''); setError(''); if (k !== 'gasto' && cardOf(account)) setAccount('') }}
            options={[{ value: 'gasto', label: 'Gasto' }, { value: 'ingreso', label: 'Ingreso' }, { value: 'transferencia', label: 'Transferir' }]} />
        )}

        <MoneyInput big autoFocus={!tx} value={amount} onChange={(n) => { setAmount(n); setError('') }} />

        {kind === 'transferencia' ? (
          <>
            <p className="-mt-2 text-center text-[13px] text-muted">
              Pasar plata a Nequi, sacar del cajero… Sigue siendo tu dinero: no cuenta como gasto ni como ingreso.
            </p>
            <AccountPicker value={account} onChange={(a) => { setAccount(a); if (a === to) setTo(''); setError('') }}
              amount={amount + fee} direction="out" label="¿De qué cuenta sale?" gmf date={date} excludeId={tx?.id} />
            <AccountPicker value={to} onChange={(a) => { setTo(a); setError('') }} exclude={account}
              amount={amount} direction="in" label="¿A qué cuenta llega?" excludeId={tx?.id} />
            {!tx && (
              <div><span className="label">Comisión (opcional)</span>
                <MoneyInput value={fee} onChange={setFee} />
                <p className="mt-1.5 px-1 text-[12px] text-muted">Si el banco o el cajero te cobró algo; eso sí se registra como gasto.</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label><span className="label">Fecha</span>
                <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value || today())} />
              </label>
              <label><span className="label">Nota</span>
                <input className="field" placeholder="Opcional" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
          </>
        ) : (<>
        <AccountPicker value={account} onChange={(a) => { setAccount(a); setError('') }} amount={amount}
          direction={kind === 'gasto' ? 'out' : 'in'} gmf={kind === 'gasto'} date={date} excludeId={tx?.id}
          allowCards={kind === 'gasto'} cardN={cardN} />
        {kind === 'gasto' && cardOf(account) && <CardInstallments value={cardN} onChange={setCardN} />}

        <div>
          <span className="label">Categoría</span>
          <div className="grid grid-cols-4 gap-2">
            {cats.map((c) => (
              <button type="button" key={c.id} onClick={() => { setCategory(c.id); setError('') }}
                className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[12px] transition ${category === c.id ? 'bg-accent/10 ring-2 ring-accent' : 'bg-surface ring-1 ring-line'}`}>
                <span className="text-xl">{c.icon}</span>
                <span className="w-full truncate text-center">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label><span className="label">Fecha</span>
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value || today())} />
          </label>
          <label><span className="label">Nota</span>
            <input className="field" placeholder="Opcional" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        </>)}

        {error && <p className="text-center text-[14px] text-neg">{error}</p>}

        <div className="flex gap-2">
          {tx && <button type="button" className="btn-danger" onClick={() => void remove()}>Eliminar</button>}
          <button className="btn-primary flex-1">Guardar</button>
        </div>
      </form>
    </Sheet>
  )
}
