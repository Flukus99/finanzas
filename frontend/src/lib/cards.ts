import type { Debt, Recurring, Tx } from './db'
import { pad, today } from './format'
import { occurrences } from './recurring'

// Tarjetas de crédito. Una compra con tarjeta no sale de ninguna cuenta: aumenta la
// deuda de la tarjeta. Cada compra cae en el extracto del corte siguiente y, si se
// difirió a N cuotas, se reparte en N extractos. Pagar la tarjeta es mover dinero de
// una cuenta a la tarjeta (no es un gasto nuevo; los intereses sí lo son).

export const isCard = (d?: Debt) => d?.kind === 'tarjeta'
const idx = (ym: string) => { const [y, m] = ym.split('-').map(Number); return y * 12 + m - 1 }
export const ymOf = (i: number) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`
const daysIn = (i: number) => new Date(Math.floor(i / 12), (i % 12) + 1, 0).getDate()
const dayIn = (i: number, day: number) => `${ymOf(i)}-${pad(Math.min(Math.max(day, 1), daysIn(i)))}`

export const cutDay = (d: Debt) => d.cut_day || 15
export const payDay = (d: Debt) => d.day || 1
// Mes del corte que incluye esta fecha.
export const cycleOf = (d: Debt, date: string) => idx(date.slice(0, 7)) + (Number(date.slice(8)) <= cutDay(d) ? 0 : 1)
// Mes en que se paga el extracto de un corte (mismo mes si el pago es después del corte).
export const payMonthOf = (d: Debt, cycle: number) => cycle + (payDay(d) > cutDay(d) ? 0 : 1)
export const cycleOfPayMonth = (d: Debt, pay: number) => pay - (payDay(d) > cutDay(d) ? 0 : 1)
export const payDate = (d: Debt, pay: number) => dayIn(pay, payDay(d))
export const cutDate = (d: Debt, pay: number) => dayIn(cycleOfPayMonth(d, pay), cutDay(d))

// Próximo pago desde hoy (si el de este mes ya pasó, el del siguiente).
export function nextPayDate(d: Debt) {
  const t = today(), now = idx(t.slice(0, 7))
  return payDate(d, payDate(d, now) >= t ? now : now + 1)
}

const isPayment = (t: Tx, d: Debt) => t.debt === d.id && (t.kind === 'transferencia' || (t.kind === 'gasto' && !!t.period && !t.card))

export function cardUsage(d: Debt, txs: Tx[]) {
  const purchases = txs.filter((t) => t.card === d.id && t.kind === 'gasto').reduce((a, t) => a + t.amount, 0)
  const paid = txs.filter((t) => isPayment(t, d)).reduce((a, t) => a + t.amount, 0)
  const used = Math.max(0, (d.amount || 0) + purchases - paid)
  const limit = d.limit || 0
  return { used, limit, available: limit ? limit - used : null, purchases, paid }
}

export interface StatementItem { key: string; label: string; icon: string; amount: number; detail: string; kind: 'compra' | 'saldo' | 'programado'; tx?: Tx }

// Lo que llega en el extracto que se paga en el mes `pay` (estimado, sin intereses).
export function cardStatement(d: Debt, pay: number, txs: Tx[], recurring: Recurring[], cats?: Map<string, { icon: string; name: string }>) {
  const items: StatementItem[] = []
  for (const t of txs) {
    if (t.card !== d.id || t.kind !== 'gasto') continue
    const n = Math.max(1, t.card_n || 1)
    const first = payMonthOf(d, cycleOf(d, t.date))
    const i = pay - first
    if (i < 0 || i >= n) continue
    const part = i === n - 1 ? t.amount - Math.round(t.amount / n) * (n - 1) : Math.round(t.amount / n)
    const c = cats?.get(t.category)
    items.push({ key: t.id, tx: t, label: t.note || c?.name || 'Compra', icon: c?.icon ?? '🛍️', amount: part, kind: 'compra', detail: n > 1 ? `Cuota ${i + 1} de ${n}` : 'Una cuota' })
  }
  // Suscripciones y fijos que se cargan a la tarjeta y aún no se han registrado.
  const cycle = cycleOfPayMonth(d, pay)
  for (const r of recurring) {
    if (r.card !== d.id || r.kind !== 'gasto') continue
    const since = r.created ? r.created.slice(0, 10) : today() // no cuenta cobros de antes de crear el fijo
    for (const m of [cycle - 1, cycle]) {
      for (const occ of occurrences(r, { y: Math.floor(m / 12), m: m % 12 })) {
        if (cycleOf(d, occ.date) !== cycle || occ.date < since) continue
        if (txs.some((t) => t.recurring === r.id && t.period === occ.key)) continue
        items.push({ key: r.id + occ.key, label: r.name, icon: r.icon, amount: r.amount, kind: 'programado', detail: `Se cobra el ${Number(occ.date.slice(8))}` })
      }
    }
  }
  // Saldo que ya tenía la tarjeta al empezar: su cuota fija mientras quede deuda.
  const { used } = cardUsage(d, txs)
  if (d.amount > 0 && d.cuota > 0 && used > 0) {
    items.push({ key: 'saldo', label: 'Saldo anterior', icon: '🧾', amount: Math.min(d.cuota, used), kind: 'saldo', detail: 'Cuota que pusiste para lo que ya debías' })
  }
  items.sort((a, b) => b.amount - a.amount)
  return { items, total: items.reduce((a, x) => a + x.amount, 0), cut: cutDate(d, pay), due: payDate(d, pay) }
}
