import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useSyncExternalStore } from 'react'
import { db, type Account, type Category, type Debt, type Goal, type Recurring, type Tx } from './db'
import { monthRange, type Month } from './format'
import { gmfMap } from './gmf'
import { pb } from './pb'
import { pendingCount, syncStore } from './sync'

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'es')

export const useAccounts = (): Account[] =>
  useLiveQuery(async () => (await db.accounts.filter((a) => !a.deleted).toArray()).sort(byName), []) ?? []

export const useCategories = (): Category[] =>
  useLiveQuery(async () => (await db.categories.filter((c) => !c.deleted).toArray()).sort(byName), []) ?? []

export const useRecurring = (): Recurring[] =>
  useLiveQuery(async () => (await db.recurring.filter((r) => !r.deleted).toArray()).sort(byName), []) ?? []

export const useGoals = (): Goal[] =>
  useLiveQuery(async () => (await db.goals.filter((g) => !g.deleted).toArray()).sort(byName), []) ?? []

export const useDebts = (): Debt[] =>
  useLiveQuery(async () => (await db.debts.filter((d) => !d.deleted).toArray()).sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, 'es')), []) ?? []

export const useAllTx = (): Tx[] => useLiveQuery(() => db.transactions.filter((t) => !t.deleted).toArray(), []) ?? []

export function useMonthTx(month: Month): Tx[] {
  const [a, b] = monthRange(month)
  return (
    useLiveQuery(
      () => db.transactions.where('date').between(a, b, true, true).filter((t) => !t.deleted).toArray(),
      [a, b],
    ) ?? []
  )
}

export const usePending = () => useLiveQuery(pendingCount, []) ?? 0

export const useSyncStatus = () => useSyncExternalStore(syncStore.subscribe, syncStore.get)

// El SDK devuelve un objeto nuevo en cada lectura, así que lo guardamos para que React no entre en bucle.
let currentUser = pb.authStore.record
pb.authStore.onChange(() => { currentUser = pb.authStore.record })
export const useUser = () =>
  useSyncExternalStore(
    (cb) => pb.authStore.onChange(cb),
    () => currentUser,
  )

// Orden: fecha más reciente primero; dentro del día, lo último creado primero.
export const sortTx = (list: Tx[]) =>
  [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.created ?? '~').localeCompare(a.created ?? '~'))

export function balances(accounts: Account[], txs: Tx[]) {
  const map = new Map<string, number>(accounts.map((a) => [a.id, a.initial || 0]))
  const { tax } = gmfMap(accounts, txs)
  const add = (id: string | undefined, n: number) => { if (id && map.has(id)) map.set(id, map.get(id)! + n) }
  for (const t of txs) {
    if (t.kind === 'transferencia') { add(t.account, -t.amount); add(t.to, t.amount) }
    else add(t.account, txSign(t) * t.amount)
    add(t.account, -(tax.get(t.id) ?? 0)) // 4x1000
  }
  return map
}

// Cómo afecta un movimiento a tu dinero disponible (las transferencias no lo cambian).
export const txSign = (t: Tx) => (t.kind === 'transferencia' ? 0 : t.kind === 'ingreso' || t.kind === 'retiro' ? 1 : -1)

// 4x1000 calculado para todos los movimientos.
export function useGmf() {
  const accounts = useAccounts()
  const txs = useAllTx()
  return useMemo(() => gmfMap(accounts, txs), [accounts, txs])
}
