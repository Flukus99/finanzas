import type { Goal, Recurring, Tx } from './db'
import { daysUntil, pad, today, type Month } from './format'

// Una "ocurrencia" es una fecha concreta en la que toca pagar/recibir un fijo.
export interface Occ { key: string; date: string }

const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const dateIn = (y: number, m: number, day: number) => `${y}-${pad(m + 1)}-${pad(Math.min(Math.max(day, 1), daysIn(y, m)))}`

export function occurrences(r: Recurring, { y, m }: Month): Occ[] {
  const mk = `${y}-${pad(m + 1)}`
  if (r.freq === 'anual') return r.month - 1 === m ? [{ key: String(y), date: dateIn(y, m, r.day) }] : []
  if (r.freq === 'quincenal') {
    const list = [{ key: `${mk}-1`, date: dateIn(y, m, r.day) }, { key: `${mk}-2`, date: dateIn(y, m, r.day2 || 30) }]
    return list.sort((a, b) => a.date.localeCompare(b.date))
  }
  return [{ key: mk, date: dateIn(y, m, r.day) }]
}

// Próxima fecha de un gasto anual que aún no se ha pagado.
// Si la fecha de este año pasó hace más de 30 días, se asume que ya se pagó por fuera
// (p. ej. lo creaste después) y se muestra la del próximo año; si pasó hace menos, sale como vencido.
export function nextAnnual(r: Recurring, paid: PaidMap): Occ {
  const y = new Date().getFullYear()
  const thisYear = { key: String(y), date: dateIn(y, r.month - 1, r.day) }
  if (!paid.has(`${r.id}|${y}`) && daysUntil(thisYear.date) >= -30) return thisYear
  return { key: String(y + 1), date: dateIn(y + 1, r.month - 1, r.day) }
}

export type PaidMap = Map<string, Tx>
export function paidMap(txs: Tx[]): PaidMap {
  const m: PaidMap = new Map()
  for (const t of txs) if (t.recurring && t.period) m.set(`${t.recurring}|${t.period}`, t)
  return m
}

// Lo que cuesta un fijo en un mes típico (los anuales repartidos en 12).
export function monthlyCost(r: Recurring) {
  if (r.freq === 'anual') return r.amount / 12
  if (r.freq === 'quincenal') return r.amount * 2
  return r.amount
}

export function goalSaved(txs: Tx[]) {
  const m = new Map<string, number>()
  for (const t of txs) {
    if (!t.goal) continue
    if (t.kind === 'ahorro') m.set(t.goal, (m.get(t.goal) ?? 0) + t.amount)
    if (t.kind === 'retiro') m.set(t.goal, (m.get(t.goal) ?? 0) - t.amount)
  }
  return m
}

export const goalForRecurring = (goals: Goal[], id: string) => goals.find((g) => g.recurring === id)

// Fecha por defecto al pagar: hoy, salvo que el pago sea de un mes que ya pasó.
export function defaultPayDate(occ: Occ) {
  const t = today()
  return occ.date.slice(0, 7) < t.slice(0, 7) ? occ.date : t
}

// ── Plan de ahorro para gastos anuales ─────────────────────────────────────
// Para cada gasto anual: lo que falta se reparte en partes iguales entre los meses
// que quedan antes del mes de pago. Así, al llegar la fecha, el dinero está completo.
// Después del pago empieza un ciclo nuevo de 12 meses (valor ÷ 12).
export interface PlanItem {
  r: Recurring
  occ: Occ
  goal?: Goal
  saved: number // lo ahorrado hoy
  savedThisMonth: number // abonado en el mes actual
  months: number // abonos que quedan contando este mes
  perMonth: number // cuánto separar cada mes hasta la fecha
  pending: number // lo que falta separar este mes
  after: number // cuánto al mes en el siguiente ciclo
  ready: boolean // ya está todo el dinero
  readyBefore: boolean // ya estaba completo antes de este mes (no hay que separar nada)
}

const ymIndex = (ym: string) => { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1) }
const roundUp = (n: number) => Math.ceil(n / 1000) * 1000 // redondeado a miles

export function annualPlan(annual: Recurring[], goals: Goal[], txs: Tx[]) {
  const paid = paidMap(txs)
  const saved = goalSaved(txs)
  const ym = today().slice(0, 7)
  const now = ymIndex(ym)
  const items: PlanItem[] = annual.map((r) => {
    const occ = nextAnnual(r, paid)
    const goal = goalForRecurring(goals, r.id)
    const have = goal ? saved.get(goal.id) ?? 0 : 0
    const thisMonth = goal ? txs.filter((t) => t.goal === goal.id && t.kind === 'ahorro' && t.date.startsWith(ym)).reduce((a, t) => a + t.amount, 0) : 0
    const due = ymIndex(occ.date.slice(0, 7))
    const months = Math.max(1, due - now) // meses con abono antes del mes de pago (si es este mes: todo ya)
    const remaining = Math.max(0, r.amount - (have - thisMonth))
    const perMonth = roundUp(remaining / months)
    return {
      r, occ, goal, saved: have, savedThisMonth: thisMonth, months, perMonth,
      pending: 0, // se calcula abajo
      after: roundUp(r.amount / 12),
      ready: have >= r.amount,
      readyBefore: have - thisMonth >= r.amount,
    }
  })
  for (const it of items) it.pending = it.ready ? 0 : Math.max(0, Math.min(it.perMonth - it.savedThisMonth, it.r.amount - it.saved))
  items.sort((a, b) => a.occ.date.localeCompare(b.occ.date))

  // Pronóstico de los próximos 12 meses si sigues el plan.
  const forecast = Array.from({ length: 12 }, (_, k) => {
    const idx = now + k
    let total = 0
    for (const it of items) {
      const due = ymIndex(it.occ.date.slice(0, 7))
      if (k === 0) total += it.readyBefore ? 0 : it.perMonth
      else if (idx < due) total += it.ready ? 0 : it.perMonth
      else total += it.after // ya se pagó: se empieza a ahorrar para el siguiente año
    }
    return { ym: `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`, total }
  })

  return {
    items,
    thisMonth: items.reduce((a, it) => a + (it.readyBefore ? 0 : it.perMonth), 0),
    pending: items.reduce((a, it) => a + it.pending, 0),
    forecast,
  }
}
