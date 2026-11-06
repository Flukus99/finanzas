import { useMemo, useState } from 'react'
import type { Account } from '../lib/db'
import { money, today } from '../lib/format'
import { DEFAULT_GMF_LIMIT, needsGmfSetup } from '../lib/gmf'
import { balances, useAccounts, useAllTx, useGmf } from '../lib/hooks'
import { removeLocal, saveLocal } from '../lib/sync'
import { PlusIcon, SwapIcon } from './Icons'
import { TxSheet } from './Tx'
import { CategoryBadge, Empty, GmfPicker, MoneyInput, Segmented, Sheet } from './ui'

const KINDS = [
  { value: 'efectivo', label: 'Efectivo', icon: '💵', color: '#30d158' },
  { value: 'banco', label: 'Banco', icon: '🏦', color: '#0a84ff' },
  { value: 'tarjeta', label: 'Tarjeta', icon: '💳', color: '#ff9f0a' },
  { value: 'ahorro', label: 'Ahorro', icon: '🐷', color: '#ff375f' },
] as const
const kindInfo = (k: string) => KINDS.find((x) => x.value === k) ?? KINDS[0]

export function Accounts() {
  const accounts = useAccounts()
  const txs = useAllTx()
  const bal = useMemo(() => balances(accounts, txs), [accounts, txs])
  const total = [...bal.values()].reduce((a, b) => a + b, 0)
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [transfer, setTransfer] = useState(false)
  const { tax, used } = useGmf()
  const ym = today().slice(0, 7)
  const monthTax = (id: string) => txs.filter((t) => t.account === id && t.date.startsWith(ym)).reduce((s, t) => s + (tax.get(t.id) ?? 0), 0)
  const gmfText = (a: Account) => {
    if (a.kind === 'efectivo') return ''
    if (needsGmfSetup(a)) return '⚠️ Toca para configurar el 4x1000'
    if (a.gmf === 'exenta') return 'Exenta de 4x1000'
    const t = monthTax(a.id)
    if (a.gmf === 'tope') {
      const u = used.get(`${a.id}|${ym}`) ?? 0
      return `Exenta hasta ${money(a.gmf_limit ?? DEFAULT_GMF_LIMIT)} · este mes salieron ${money(u)}${t ? ` · 4x1000 ${money(t)}` : ''}`
    }
    return `Paga 4x1000${t ? ` · ${money(t)} este mes` : ''}`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Cuentas</h1>
        <div className="flex gap-2">
          {accounts.length > 1 && <button className="btn-ghost py-2" onClick={() => setTransfer(true)}><SwapIcon width={18} height={18} />Transferir</button>}
          <button className="btn-ghost py-2" onClick={() => setEditing('new')}><PlusIcon width={18} height={18} />Nueva</button>
        </div>
      </div>
      <div className="card p-5">
        <div className="text-[13px] font-medium text-muted">Total en todas las cuentas</div>
        <div className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{money(total)}</div>
      </div>
      <div className="card divide-y divide-line overflow-hidden">
        {accounts.length === 0 && <Empty>No tienes cuentas.</Empty>}
        {accounts.map((a) => {
          const k = kindInfo(a.kind)
          const b = bal.get(a.id) ?? 0
          return (
            <button key={a.id} onClick={() => setEditing(a)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-hover">
              <CategoryBadge icon={k.icon} color={a.color || k.color} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{a.name}</div>
                <div className={`text-[13px] ${needsGmfSetup(a) ? 'text-warn' : 'text-muted'}`}>{k.label}{gmfText(a) ? ` · ${gmfText(a)}` : ''}</div>
              </div>
              <div className={`text-[15px] font-semibold tabular-nums ${b < 0 ? 'text-neg' : ''}`}>{money(b)}</div>
            </button>
          )
        })}
      </div>
      {transfer && <TxSheet initialKind="transferencia" onClose={() => setTransfer(false)} />}
      {editing && <AccountSheet account={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function AccountSheet({ account, onClose }: { account?: Account; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<string>(account?.kind ?? 'banco')
  const [initial, setInitial] = useState(account?.initial ?? 0)
  const [gmf, setGmf] = useState(account?.gmf ?? '')
  const [limit, setLimit] = useState(account?.gmf_limit || DEFAULT_GMF_LIMIT)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) return
    if (kind !== 'efectivo' && !gmf) return setError('Indica si esta cuenta paga 4x1000')
    await saveLocal('accounts', {
      id: account?.id, name: name.trim(), kind, initial, color: kindInfo(kind).color,
      gmf: kind === 'efectivo' ? 'exenta' : gmf, gmf_limit: gmf === 'tope' ? limit : 0,
    })
    onClose()
  }
  async function remove() {
    if (account && confirm(`¿Eliminar la cuenta "${account.name}"? Sus movimientos quedarán sin cuenta.`)) {
      await removeLocal('accounts', account.id)
      onClose()
    }
  }

  return (
    <Sheet title={account ? 'Editar cuenta' : 'Nueva cuenta'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <label className="block"><span className="label">Nombre</span>
          <input className="field" autoFocus placeholder="Ej: Bancolombia, Nequi…" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div><span className="label">Tipo</span>
          <Segmented value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
        </div>
        <div><span className="label">Saldo inicial</span>
          <MoneyInput value={initial} onChange={setInitial} />
          <p className="mt-1.5 px-1 text-[12px] text-muted">Lo que tenía la cuenta antes de empezar a registrar movimientos.</p>
        </div>
        <GmfPicker kind={kind} gmf={gmf} limit={limit} onChange={(g, l) => { setGmf(g); setLimit(l); setError('') }} />
        {error && <p className="text-center text-[14px] text-neg">{error}</p>}
        <div className="flex gap-2 pt-1">
          {account && <button type="button" className="btn-danger" onClick={() => void remove()}>Eliminar</button>}
          <button className="btn-primary flex-1" disabled={!name.trim()}>Guardar</button>
        </div>
      </form>
    </Sheet>
  )
}
