import { ClientResponseError, type RecordModel } from 'pocketbase'
import { pb } from './pb'
import { db, newId, TABLES, type TableName } from './db'

// ── Estado visible en la interfaz ──────────────────────────────────────────
export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'auth'
export interface SyncStatus { state: SyncState; lastAt: number | null; message?: string }

let status: SyncStatus = { state: 'idle', lastAt: null }
const listeners = new Set<() => void>()
function setStatus(s: Partial<SyncStatus>) {
  status = { ...status, ...s }
  listeners.forEach((l) => l())
}
export const syncStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => { listeners.delete(l) }
  },
  get: () => status,
}

// ── Escrituras locales ─────────────────────────────────────────────────────
// Guarda en el dispositivo, lo marca como pendiente y pide sincronizar.
export async function saveLocal(name: TableName, data: Record<string, unknown> & { id?: string }) {
  const t = db.table(name)
  const id = data.id ?? newId()
  const prev = await t.get(id)
  await t.put({
    deleted: false,
    ...prev,
    ...data,
    id,
    user: pb.authStore.record!.id,
    _dirty: 1,
    _new: prev ? prev._new : 1,
    _v: (prev?._v ?? 0) + 1,
  })
  requestSync()
  return id
}
export const removeLocal = (name: TableName, id: string) => saveLocal(name, { id, deleted: true })

// ── Conversión entre formato local y del servidor ──────────────────────────
const LOCAL_ONLY = ['_dirty', '_new', '_v', 'created', 'updated', 'collectionId', 'collectionName', 'expand']
function toServer(rec: Record<string, unknown>) {
  const o = { ...rec }
  for (const k of LOCAL_ONLY) delete o[k]
  return o
}
function fromServer(rec: RecordModel) {
  const { collectionId: _a, collectionName: _b, expand: _c, ...rest } = rec
  return { ...rest, _dirty: 0, _new: 0, _v: 0 }
}

// ── Sincronización ─────────────────────────────────────────────────────────
let running: Promise<void> | null = null
let again = false
let sessionChecked = false

export function sync(): Promise<void> {
  if (running) { again = true; return running }
  running = (async () => {
    try {
      do { again = false; await syncOnce() } while (again)
    } finally { running = null }
  })()
  return running
}

let timer: ReturnType<typeof setTimeout> | undefined
export function requestSync() {
  clearTimeout(timer)
  timer = setTimeout(() => { void sync() }, 400)
}

async function syncOnce() {
  if (!pb.authStore.record) return
  if (!navigator.onLine) { setStatus({ state: 'offline' }); return }
  setStatus({ state: 'syncing' })
  try {
    if (!sessionChecked) {
      await pb.collection('users').authRefresh() // renueva la sesión
      sessionChecked = true
      subscribeRealtime()
    }
    const problems: string[] = []
    for (const name of TABLES) {
      await push(name, problems)
      await pull(name)
    }
    await db.meta.put({ key: 'ready', value: '1' }) // ya tenemos los datos del servidor al menos una vez
    setStatus({ state: problems.length ? 'error' : 'idle', lastAt: Date.now(), message: problems[0] })
  } catch (e) {
    if (e instanceof ClientResponseError && (e.status === 401 || e.status === 403)) {
      setStatus({ state: 'auth', message: 'Tu sesión expiró. Cierra sesión y vuelve a entrar para sincronizar.' })
    } else if (e instanceof ClientResponseError && e.status === 0) {
      setStatus({ state: 'offline' })
    } else {
      setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }
}

// Sube lo pendiente de este dispositivo.
async function push(name: TableName, problems: string[]) {
  const t = db.table(name)
  const col = pb.collection(name)
  const pending = await t.where('_dirty').equals(1).toArray()
  for (const rec of pending) {
    const data = toServer(rec)
    const { id: _id, ...fields } = data
    let saved: RecordModel
    try {
      if (rec._new) {
        try {
          saved = await col.create(data)
        } catch (e) {
          // Ya existía (se subió pero se perdió la respuesta): entonces actualizamos.
          if (e instanceof ClientResponseError && e.status === 400 && e.response?.data?.id) saved = await col.update(rec.id, fields)
          else throw e
        }
      } else {
        try {
          saved = await col.update(rec.id, fields)
        } catch (e) {
          if (e instanceof ClientResponseError && e.status === 404) saved = await col.create(data)
          else throw e
        }
      }
    } catch (e) {
      // Un registro inválido no debe frenar toda la sincronización.
      if (e instanceof ClientResponseError && e.status === 400) {
        problems.push(`No se pudo guardar un registro en ${name}: ${e.message}`)
        continue
      }
      throw e
    }
    await db.transaction('rw', t, async () => {
      const cur = await t.get(rec.id)
      if (!cur) return
      // Si lo editaste mientras subía, queda pendiente para la próxima vuelta.
      if (cur._v === rec._v) await t.put(fromServer(saved))
      else await t.update(rec.id, { _new: 0 })
    })
  }
}

// Baja lo que cambió en el servidor desde la última vez.
async function pull(name: TableName) {
  const t = db.table(name)
  const key = `last:${name}`
  const last = (await db.meta.get(key))?.value
  const list = await pb.collection(name).getFullList({
    filter: last ? pb.filter('updated >= {:last}', { last }) : '',
    sort: 'updated',
    batch: 500,
  })
  if (!list.length) return
  await db.transaction('rw', t, db.meta, async () => {
    for (const r of list) {
      const cur = await t.get(r.id)
      if (cur?._dirty) continue // hay un cambio local más nuevo, se sube en la próxima vuelta
      await t.put(fromServer(r))
    }
    await db.meta.put({ key, value: list[list.length - 1].updated })
  })
}

// Cambios en vivo: lo que hagas en otro dispositivo aparece aquí al instante.
function subscribeRealtime() {
  for (const name of TABLES) {
    pb.collection(name).subscribe('*', async (e) => {
      const t = db.table(name)
      const cur = await t.get(e.record.id)
      if (cur?._dirty) return
      if (e.action === 'delete') await t.delete(e.record.id)
      else await t.put(fromServer(e.record))
    }).catch(() => { /* se reintenta en la próxima sincronización */ sessionChecked = false })
  }
}

let started = false
export function startSync() {
  if (!started) {
    started = true
    window.addEventListener('online', () => { void sync() })
    window.addEventListener('offline', () => setStatus({ state: 'offline' }))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void sync()
    })
    setInterval(() => { void sync() }, 60_000)
  }
  void sync()
}

export async function pendingCount() {
  const counts = await Promise.all(TABLES.map((n) => db.table(n).where('_dirty').equals(1).count()))
  return counts.reduce((a, b) => a + b, 0)
}

// Al cerrar sesión se borra la copia local (puede que otra persona use este dispositivo).
export async function logout() {
  await pb.realtime.unsubscribe().catch(() => {})
  sessionChecked = false
  pb.authStore.clear()
  await Promise.all([...TABLES.map((n) => db.table(n).clear()), db.meta.clear()])
  setStatus({ state: 'idle', lastAt: null, message: undefined })
}
