import type { Account, Tx } from './db'

// 4x1000 (Gravamen a los Movimientos Financieros): 0,4 % de lo que sale de una cuenta.
// Se calcula a partir de los movimientos (no se guarda), así siempre cuadra si editas o borras algo.
export const GMF_RATE = 0.004
export const DEFAULT_GMF_LIMIT = 3_000_000

// ¿Este movimiento saca dinero de la cuenta? (abonar a un ahorro no: el dinero sigue en la cuenta)
const isDebit = (t: Tx) => t.kind === 'gasto' || t.kind === 'transferencia'

export const paysGmf = (a?: Account) => !!a && a.kind !== 'efectivo' && (a.gmf === 'aplica' || a.gmf === 'tope')
export const needsGmfSetup = (a: Account) => a.kind !== 'efectivo' && !a.gmf

const order = (a: Tx, b: Tx) => a.date.localeCompare(b.date) || (a.created ?? '~').localeCompare(b.created ?? '~') || a.id.localeCompare(b.id)

// Devuelve el 4x1000 de cada movimiento (id → valor) y lo que ha salido de cada cuenta por mes.
export function gmfMap(accounts: Account[], txs: Tx[]) {
  const acc = new Map(accounts.map((a) => [a.id, a]))
  const tax = new Map<string, number>()
  const used = new Map<string, number>() // `${cuenta}|YYYY-MM` → total que ha salido
  for (const t of txs.filter((t) => isDebit(t) && paysGmf(acc.get(t.account))).sort(order)) {
    const a = acc.get(t.account)!
    const key = `${a.id}|${t.date.slice(0, 7)}`
    const before = used.get(key) ?? 0
    used.set(key, before + t.amount)
    const taxable = a.gmf === 'tope' ? Math.max(0, before + t.amount - Math.max(before, a.gmf_limit ?? DEFAULT_GMF_LIMIT)) : t.amount
    const v = Math.round(taxable * GMF_RATE)
    if (v > 0) tax.set(t.id, v)
  }
  return { tax, used }
}

// Cuánto 4x1000 pagaría un movimiento nuevo (o editado) antes de guardarlo.
export function estimateGmf(a: Account | undefined, amount: number, date: string, txs: Tx[], excludeId?: string) {
  if (!paysGmf(a) || amount <= 0) return 0
  if (a!.gmf === 'aplica') return Math.round(amount * GMF_RATE)
  const ym = date.slice(0, 7)
  const before = txs.filter((t) => t.id !== excludeId && isDebit(t) && t.account === a!.id && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0)
  const limit = a!.gmf_limit ?? DEFAULT_GMF_LIMIT
  return Math.round(Math.max(0, before + amount - Math.max(before, limit)) * GMF_RATE)
}
