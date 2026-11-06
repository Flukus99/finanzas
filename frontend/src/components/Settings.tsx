import { useState } from 'react'
import type { Category, Kind } from '../lib/db'
import { timeAgo } from '../lib/format'
import { useCategories, usePending, useSyncStatus, useUser } from '../lib/hooks'
import { logout, removeLocal, saveLocal, sync } from '../lib/sync'
import { PlusIcon } from './Icons'
import { CategoryBadge, Segmented, Sheet } from './ui'

const COLORS = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ac8e68', '#8e8e93']

export function SyncText({ short }: { short?: boolean } = {}) {
  const s = useSyncStatus()
  const pending = usePending()
  const text =
    s.state === 'syncing' ? 'Sincronizando…'
      : s.state === 'offline' ? (short ? 'Sin conexión' : 'Sin conexión · tus cambios se guardan en este dispositivo')
        : s.state === 'auth' ? 'Sesión expirada'
          : s.state === 'error' ? 'Error al sincronizar'
            : s.lastAt ? (short ? 'Sincronizado' : `Sincronizado ${timeAgo(s.lastAt)}`) : 'Esperando…'
  return <>{text}{pending > 0 && s.state !== 'syncing' ? ` · ${pending} pendiente${pending > 1 ? 's' : ''}` : ''}</>
}

export function SyncDot() {
  const s = useSyncStatus()
  const color = s.state === 'idle' ? 'bg-pos' : s.state === 'syncing' ? 'bg-accent animate-pulse' : s.state === 'offline' ? 'bg-faint' : 'bg-neg'
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
}

export function Settings() {
  const user = useUser()
  const s = useSyncStatus()
  const pending = usePending()
  const categories = useCategories()
  const [editing, setEditing] = useState<Category | Kind | null>(null)

  async function doLogout() {
    const msg = pending
      ? `Hay ${pending} cambio(s) sin sincronizar que se perderán. ¿Cerrar sesión igual?`
      : '¿Cerrar sesión? Los datos se borran de este dispositivo (siguen en el servidor).'
    if (confirm(msg)) await logout()
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title">Ajustes</h1>

      <section>
        <h2 className="section-title">Sincronización</h2>
        <div className="card space-y-3 p-4">
          <div className="flex items-center gap-2 text-[15px]"><SyncDot /><SyncText /></div>
          {s.message && <p className="text-[13px] text-neg">{s.message}</p>}
          <button className="btn-ghost w-full" onClick={() => void sync()} disabled={s.state === 'syncing'}>Sincronizar ahora</button>
        </div>
      </section>

      {(['gasto', 'ingreso'] as const).map((kind) => (
        <section key={kind}>
          <div className="flex items-baseline justify-between">
            <h2 className="section-title">Categorías de {kind === 'gasto' ? 'gastos' : 'ingresos'}</h2>
            <button className="flex items-center gap-1 px-1 text-[14px] text-accent" onClick={() => setEditing(kind)}><PlusIcon width={16} height={16} />Agregar</button>
          </div>
          <div className="card grid grid-cols-1 divide-y divide-line overflow-hidden sm:grid-cols-2 sm:divide-y-0">
            {categories.filter((c) => c.kind === kind).map((c) => (
              <button key={c.id} onClick={() => setEditing(c)} className="flex items-center gap-3 px-4 py-2.5 text-left transition hover:bg-hover">
                <CategoryBadge icon={c.icon} color={c.color} size={32} />
                <span className="text-[15px]">{c.name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section>
        <h2 className="section-title">Cuenta</h2>
        <div className="card flex items-center justify-between gap-3 p-4">
          <span className="truncate text-[15px]">{user?.email}</span>
          <button className="btn-danger py-2" onClick={() => void doLogout()}>Cerrar sesión</button>
        </div>
      </section>

      {editing && (
        <CategorySheet
          category={typeof editing === 'string' ? undefined : editing}
          kind={typeof editing === 'string' ? editing : editing.kind}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function CategorySheet({ category, kind: initialKind, onClose }: { category?: Category; kind: Kind; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '🏷️')
  const [color, setColor] = useState(category?.color ?? COLORS[5])
  const [kind, setKind] = useState<Kind>(initialKind)

  async function save() {
    if (!name.trim()) return
    await saveLocal('categories', { id: category?.id, name: name.trim(), icon: icon.trim() || '🏷️', color, kind })
    onClose()
  }
  async function remove() {
    if (category && confirm(`¿Eliminar la categoría "${category.name}"?`)) { await removeLocal('categories', category.id); onClose() }
  }

  return (
    <Sheet title={category ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <div className="flex justify-center"><CategoryBadge icon={icon} color={color} size={64} /></div>
        <Segmented value={kind} onChange={setKind} options={[{ value: 'gasto', label: 'Gasto' }, { value: 'ingreso', label: 'Ingreso' }]} />
        <div className="grid grid-cols-[5rem_1fr] gap-3">
          <label><span className="label">Emoji</span>
            <input className="field text-center text-xl" maxLength={8} value={icon} onChange={(e) => setIcon(e.target.value)} />
          </label>
          <label><span className="label">Nombre</span>
            <input className="field" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <div><span className="label">Color</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} aria-label={c}
                className={`h-8 w-8 rounded-full transition ${color === c ? 'ring-2 ring-offset-2 ring-offset-bg' : ''}`}
                style={{ background: c, ['--tw-ring-color' as string]: c }} />
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          {category && <button type="button" className="btn-danger" onClick={() => void remove()}>Eliminar</button>}
          <button className="btn-primary flex-1" disabled={!name.trim()}>Guardar</button>
        </div>
      </form>
    </Sheet>
  )
}
