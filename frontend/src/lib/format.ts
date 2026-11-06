const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

export const money = (n: number) => cop.format(n)
export const digits = (n: number) => (n ? num.format(n) : '')
export const parseDigits = (s: string) => Number(s.replace(/\D/g, '').slice(0, 13)) || 0

export const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => ymd(new Date())

export function parseYmd(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Mes como { y, m } con m de 0 a 11.
export interface Month { y: number; m: number }
export const thisMonth = (): Month => ({ y: new Date().getFullYear(), m: new Date().getMonth() })
export const shiftMonth = ({ y, m }: Month, delta: number): Month => {
  const d = new Date(y, m + delta, 1)
  return { y: d.getFullYear(), m: d.getMonth() }
}
export const monthRange = ({ y, m }: Month): [string, string] => [`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-31`]
export function monthLabel({ y, m }: Month) {
  const s = new Date(y, m, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1).replace(' de ', ' ')
}

export function dayLabel(s: string) {
  if (s === today()) return 'Hoy'
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (s === ymd(y)) return 'Ayer'
  const out = parseYmd(s).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  return out.charAt(0).toUpperCase() + out.slice(1)
}

export function timeAgo(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 10) return 'justo ahora'
  if (s < 60) return `hace ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  return `hace ${Math.round(m / 60)} h`
}

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function daysUntil(date: string) {
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((parseYmd(date).getTime() - t.getTime()) / 86_400_000)
}
export function dueLabel(n: number) {
  if (n < -1) return `Venció hace ${-n} días`
  if (n === -1) return 'Venció ayer'
  if (n === 0) return 'Vence hoy'
  if (n === 1) return 'Mañana'
  return `En ${n} días`
}
export function shortDate(s: string) {
  const d = parseYmd(s)
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`
}
// Meses que faltan hasta YYYY-MM (mínimo 1).
export function monthsUntil(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const now = new Date()
  return Math.max(1, (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()))
}
export function ymLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
