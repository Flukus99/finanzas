import Dexie, { type Table } from 'dexie'

// Copia local de los datos (IndexedDB). La app siempre lee y escribe aquí,
// y sync.ts se encarga de mandar y traer cambios del servidor.
export type Kind = 'gasto' | 'ingreso'
// ahorro = sale de una cuenta hacia un ahorro; retiro = vuelve de un ahorro a una cuenta
// transferencia = pasa dinero entre dos cuentas propias (no es gasto ni ingreso)
export type TxKind = Kind | 'ahorro' | 'retiro' | 'transferencia'
export type Freq = 'mensual' | 'quincenal' | 'anual'
export type GoalKind = 'emergencia' | 'anual' | 'meta'

export interface Base {
  id: string
  user: string
  deleted: boolean
  created?: string
  updated?: string
  _dirty: 0 | 1 // 1 = tiene cambios que el servidor aún no conoce
  _new: 0 | 1 // 1 = el servidor todavía no tiene este registro
  _v: number // versión local, para no pisar cambios hechos mientras se sincroniza
}
export type Gmf = 'aplica' | 'exenta' | 'tope'
export interface Account extends Base {
  name: string
  kind: string
  initial: number
  color: string
  gmf?: Gmf | '' // 4x1000: vacío = aún no configurado
  gmf_limit?: number // en "tope": cuánto puede salir al mes sin pagar 4x1000
}
export interface Category extends Base { name: string; kind: Kind; icon: string; color: string }
export interface Tx extends Base {
  kind: TxKind
  amount: number
  account: string
  category: string
  date: string // YYYY-MM-DD
  note: string
  recurring?: string // gasto o ingreso fijo que se pagó con este movimiento
  period?: string // periodo pagado: 2026-11, 2026-11-2 (quincena) o 2026 (anual)
  goal?: string // ahorro al que va o del que sale
  to?: string // en transferencias: cuenta a la que llega
  debt?: string // pago (cuota o abono extra) de una deuda
  card?: string // compra hecha con esta tarjeta de crédito (no sale de ninguna cuenta)
  card_n?: number // a cuántas cuotas se difirió la compra
}
export type DebtKind = 'tarjeta' | 'credito' | 'prestamo' | 'otro'
// Deuda asumida. La cuota la pone el usuario: depende de los intereses de cada entidad.
export interface Debt extends Base {
  name: string
  icon: string
  kind: DebtKind
  lender: string
  amount: number // monto al asumirla
  cuota: number // cuota mensual
  installments: number // total de cuotas (0 = sin plazo fijo, p. ej. tarjeta)
  paid_before: number // cuotas pagadas antes de usar la app
  next_date: string // próxima cuota (YYYY-MM-DD)
  day: number
  rate: number // tasa (informativa)
  balance: number // saldo según la entidad
  balance_date: string
  account: string
  closed: boolean
  note: string
  limit?: number // tarjetas: cupo total
  cut_day?: number // tarjetas: día de corte
}
// Gasto o ingreso fijo: arriendo, Netflix, salario, SOAT…
export interface Recurring extends Base {
  name: string
  icon: string
  kind: Kind
  freq: Freq
  day: number // día del mes (1-31)
  day2: number // segunda fecha en quincenal
  month: number // mes (1-12) en anual
  amount: number
  account: string // de dónde sale / a dónde llega normalmente
  category: string
  card?: string // si se carga a una tarjeta de crédito (p. ej. Netflix)
}
export interface Goal extends Base {
  name: string
  icon: string
  color: string
  kind: GoalKind
  target: number
  deadline: string // YYYY-MM, opcional
  recurring: string // gasto anual al que está ligado
}
interface Meta { key: string; value: string }

class FinanzasDB extends Dexie {
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  transactions!: Table<Tx, string>
  recurring!: Table<Recurring, string>
  goals!: Table<Goal, string>
  debts!: Table<Debt, string>
  meta!: Table<Meta, string>
  constructor() {
    super('finanzas')
    this.version(1).stores({
      accounts: 'id, _dirty',
      categories: 'id, _dirty',
      transactions: 'id, _dirty, date',
      meta: 'key',
    })
    this.version(2).stores({ recurring: 'id, _dirty', goals: 'id, _dirty' })
    this.version(3).stores({ debts: 'id, _dirty' })
  }
}

export const db = new FinanzasDB()
// El orden importa: primero cuentas y categorías, luego los movimientos que las usan.
export const TABLES = ['accounts', 'categories', 'recurring', 'goals', 'debts', 'transactions'] as const
export type TableName = (typeof TABLES)[number]

// IDs de 15 caracteres [a-z0-9], el formato que acepta PocketBase.
// Se generan en el dispositivo para poder crear registros sin conexión.
export function newId() {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => abc[b % 36]).join('')
}
