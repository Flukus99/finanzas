import type { Category, Debt, Recurring, Tx } from './db'
import { pad, today, type Month } from './format'
import type { Occ } from './recurring'
import { cardUsage, isCard } from './cards'

// Una deuda activa se comporta como un gasto fijo mensual desde la próxima cuota
// hasta la última. Aquí se calcula todo a partir de los datos que puso el usuario
// y de los pagos registrados (movimientos con `debt`).

const idx = (ym: string) => { const [y, m] = ym.split('-').map(Number); return y * 12 + m - 1 }
const ymOf = (i: number) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`
const daysIn = (i: number) => new Date(Math.floor(i / 12), (i % 12) + 1, 0).getDate()

export const DEBT_KINDS = [
  { value: 'tarjeta' as const, label: 'Tarjeta', icon: '💳', long: 'Tarjeta de crédito' },
  { value: 'credito' as const, label: 'Crédito', icon: '🏦', long: 'Crédito bancario' },
  { value: 'prestamo' as const, label: 'Préstamo', icon: '🤝', long: 'Préstamo personal' },
  { value: 'otro' as const, label: 'Otro', icon: '🧾', long: 'Otra deuda' },
]
export const debtKind = (k: string) => DEBT_KINDS.find((x) => x.value === k) ?? DEBT_KINDS[3]

const startIdx = (d: Debt) => idx((d.next_date || today()).slice(0, 7))
// Mes de la última cuota (null si no tiene plazo fijo).
export function endIdx(d: Debt) {
  if (!d.installments) return null
  return startIdx(d) + Math.max(0, d.installments - (d.paid_before || 0)) - 1
}
export const endYm = (d: Debt) => { const e = endIdx(d); return e === null ? null : ymOf(e) }

export interface DebtStats {
  paidCount: number // cuotas pagadas (antes + en la app)
  paidAmount: number // dinero pagado en la app (cuotas + abonos)
  remainingCount: number | null
  remainingApprox: number | null // cuotas que faltan × cuota
  owed: number // lo que se debe: saldo de la entidad si lo puso, si no el estimado
  done: boolean
  progress: number
}
export function debtStats(d: Debt, txs: Tx[]): DebtStats {
  if (isCard(d)) {
    // Tarjeta: se debe lo que se ha usado (saldo inicial + compras − pagos).
    const u = cardUsage(d, txs)
    const owed = d.closed ? 0 : d.balance_date ? d.balance : u.used
    return { paidCount: 0, paidAmount: u.paid, remainingCount: null, remainingApprox: null, owed, done: !!d.closed, progress: u.limit ? u.used / u.limit : 0 }
  }
  const pays = txs.filter((t) => t.debt === d.id && t.kind === 'gasto')
  const cuotasInApp = new Set(pays.filter((t) => t.period).map((t) => t.period)).size
  const paidCount = (d.paid_before || 0) + cuotasInApp
  const paidAmount = pays.reduce((a, t) => a + t.amount, 0)
  const remainingCount = d.installments ? Math.max(0, d.installments - paidCount) : null
  const remainingApprox = remainingCount === null ? null : remainingCount * d.cuota
  const done = d.closed || (remainingCount !== null && remainingCount === 0)
  const owed = done ? 0 : d.balance_date ? d.balance : remainingApprox ?? Math.max(0, d.amount - paidAmount)
  const progress = done ? 1 : d.installments ? paidCount / d.installments : d.amount ? Math.min(1, paidAmount / d.amount) : 0
  return { paidCount, paidAmount, remainingCount, remainingApprox, owed, done, progress }
}

// Cuota del mes como ocurrencia (igual que un fijo). Número de cuota incluido.
export function debtOccurrence(d: Debt, { y, m }: Month, txs: Tx[]): (Occ & { n: number | null }) | null {
  if (d.closed) return null
  const i = y * 12 + m
  const s = startIdx(d), e = endIdx(d)
  if (i < s || (e !== null && i > e)) return null
  const key = ymOf(i)
  const paidHere = txs.some((t) => t.debt === d.id && t.period === key)
  // Si ya se completaron las cuotas, solo se muestra la del mes en que se pagó la última.
  if (!paidHere && debtStats(d, txs).done) return null
  const date = `${key}-${pad(Math.min(d.day || 1, daysIn(i)))}`
  return { key, date, n: d.installments ? (d.paid_before || 0) + (i - s) + 1 : null }
}

// Vista de la deuda como gasto fijo, para reutilizar filas y la hoja de pago.
export function debtAsRecurring(d: Debt, categories: Category[], amount?: number): Recurring {
  const cat = categories.find((c) => c.kind === 'gasto' && c.name === 'Deudas')
  return {
    id: d.id, user: d.user, deleted: false, _dirty: 0, _new: 0, _v: 0,
    name: d.name, icon: d.icon || debtKind(d.kind).icon, kind: 'gasto', freq: 'mensual',
    day: d.day || 1, day2: 0, month: 0, amount: amount ?? d.cuota, account: d.account, category: cat?.id ?? '',
  }
}
