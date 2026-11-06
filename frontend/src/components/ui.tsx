import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DebtSheet } from './Debts'
import { digits, money, monthLabel, parseDigits, shiftMonth, type Month } from '../lib/format'
import type { Gmf } from '../lib/db'
import { DEFAULT_GMF_LIMIT, estimateGmf } from '../lib/gmf'
import { cardUsage, isCard, nextPayDate } from '../lib/cards'
import { shortDate } from '../lib/format'
import { balances, useAccounts, useAllTx, useDebts } from '../lib/hooks'
import { ChevronLeft, ChevronRight, CloseIcon } from './Icons'

let open = 0 // hojas abiertas (para bloquear el scroll de fondo mientras haya alguna)

// Hoja inferior en el celular, ventana centrada en el PC.
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const dialogs = document.querySelectorAll('[role=dialog]')
      if (dialogs[dialogs.length - 1]?.getAttribute('aria-label') === title) onClose()
    }
    window.addEventListener('keydown', k)
    open += 1
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); open -= 1; if (!open) document.body.style.overflow = '' }
  }, [onClose])
  // Se dibuja directo en <body> (una hoja puede abrir otra) y su envío no llega a la de abajo.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}
      onSubmit={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[6px] animate-[fade_.18s_ease-out]" onClick={onClose} />
      <div className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-bg shadow-2xl ring-1 ring-line animate-[up_.28s_cubic-bezier(.2,.8,.2,1)] md:max-w-lg md:rounded-[28px]">
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-fill md:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-3 md:px-6 md:pt-5">
          <h2 className="text-[19px] font-bold tracking-tight">{title}</h2>
          <button className="-mr-1.5 grid h-10 w-10 place-items-center rounded-full bg-fill text-muted transition hover:text-ink" onClick={onClose} aria-label="Cerrar">
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]
}) {
  return (
    <div className="flex rounded-2xl bg-fill p-1" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={`min-h-10 flex-1 whitespace-nowrap rounded-xl px-1 font-semibold transition duration-200 ${options.length > 4 ? 'text-[12.5px]' : 'text-[14px]'} ${value === o.value ? ' bg-seg text-ink shadow-[0_1px_3px_rgb(0_0_0/.12)]' : ' text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function MoneyInput({ value, onChange, big, autoFocus }: { value: number; onChange: (n: number) => void; big?: boolean; autoFocus?: boolean }) {
  return (
    <div className={`flex items-baseline justify-center gap-1 ${big ? 'py-2' : 'field'}`}>
      <span className={big ? 'text-3xl font-semibold text-faint' : 'text-faint'}>$</span>
      <input
        inputMode="numeric" autoFocus={autoFocus} placeholder="0"
        value={digits(value)} onChange={(e) => onChange(parseDigits(e.target.value))}
        style={big ? { width: `${Math.max(1, digits(value).length) + 0.5}ch` } : undefined}
        className={`min-w-0 bg-transparent outline-none ${big ? 'max-w-full text-[52px] leading-none font-extrabold tracking-[-0.03em] tabular-nums' : 'w-full'}`}
      />
    </div>
  )
}

export function MonthPicker({ month, onChange }: { month: Month; onChange: (m: Month) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-surface p-1 ring-1 ring-line">
      <button className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-fill hover:text-ink" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Mes anterior"><ChevronLeft width={18} height={18} /></button>
      <span className="min-w-36 text-center text-[14px] font-bold">{monthLabel(month)}</span>
      <button className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-fill hover:text-ink" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Mes siguiente"><ChevronRight width={18} height={18} /></button>
    </div>
  )
}

export function CategoryBadge({ icon, color, size = 40 }: { icon?: string; color?: string; size?: number }) {
  return (
    <div aria-hidden className="grid shrink-0 place-items-center rounded-[34%]" style={{ width: size, height: size, background: `color-mix(in oklab, ${color || '#8e8e93'} 16%, transparent)`, fontSize: size * 0.46 }}>
      {icon || '•'}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-6 py-10 text-center text-[14px] leading-relaxed text-muted">{children}</div>
}

// ── Selector de emoji ──────────────────────────────────────────────────────
const EMOJIS = [
  '🏠', '💡', '💧', '🔥', '📶', '📱', '📺', '🎵', '🎮', '☁️',
  '💳', '🏦', '💰', '🧾', '🏛️', '🛡️', '🚗', '🏍️', '🚌', '⛽',
  '🍔', '🛒', '☕', '🍕', '💊', '🏥', '🏋️', '👕', '👟', '💇',
  '📚', '🎓', '👶', '🐶', '✈️', '🎁', '💻', '🔧', '🌴', '🎯',
  '🆘', '🐷', '💼', '✨', '📦', '❤️', '⭐', '🎬', '🧴', '🚿',
]
export function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <div>
      <span className="label">Icono</span>
      <div className="card grid grid-cols-10 gap-0.5 p-2">
        {EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => onChange(e)}
            className={`grid aspect-square place-items-center rounded-lg text-xl transition hover:bg-fill ${value === e ? 'bg-accent/15 ring-2 ring-accent' : ''}`}>
            {e}
          </button>
        ))}
      </div>
      <input className="field mt-2" placeholder="…o escribe/pega otro emoji" maxLength={8}
        value={EMOJIS.includes(value) ? '' : value} onChange={(e) => e.target.value.trim() && onChange(e.target.value.trim())} />
    </div>
  )
}

// ── "¿De dónde sale el dinero?" ────────────────────────────────────────────
// Muestra cada cuenta con su saldo y cuánto quedaría después del movimiento.
// Valor de una tarjeta en el selector: "card:<id>".
export const CARD = 'card:'
export const cardOf = (v: string) => (v.startsWith(CARD) ? v.slice(CARD.length) : '')

export function AccountPicker({ value, onChange, amount, direction, label, exclude, gmf, date, excludeId, taxBase, allowCards, cardN = 1 }: {
  value: string; onChange: (id: string) => void; amount: number; direction: 'out' | 'in'; label?: string; exclude?: string
  allowCards?: boolean // permite pagar con tarjeta de crédito (queda como deuda)
  cardN?: number // cuotas, para el mensaje
  gmf?: boolean // si el movimiento paga 4x1000 en la cuenta de origen
  date?: string; excludeId?: string // para el cálculo del tope mensual del 4x1000
  taxBase?: number // sobre cuánto se calcula el 4x1000 si no es "amount"
}) {
  const all = useAccounts()
  const accounts = all.filter((a) => a.id !== exclude)
  const allTx = useAllTx()
  // Al editar, el saldo se muestra como si el movimiento aún no existiera.
  const txs = useMemo(() => (excludeId ? allTx.filter((t) => t.id !== excludeId) : allTx), [allTx, excludeId])
  const bal = useMemo(() => balances(all, txs), [all, txs])
  const debts = useDebts()
  const cards = allowCards ? debts.filter((d) => isCard(d) && !d.closed) : []
  const selCard = cards.find((c) => CARD + c.id === value)
  const [newCard, setNewCard] = useState(false)
  const selected = accounts.find((a) => a.id === value)
  const current = selected ? bal.get(selected.id) ?? 0 : 0
  const tax = gmf && direction === 'out' ? estimateGmf(selected, Math.max(0, taxBase ?? amount), date ?? new Date().toISOString().slice(0, 10), txs, excludeId) : 0
  const after = current + (direction === 'out' ? -amount - tax : amount)

  return (
    <div>
      <span className="label">{label ?? (direction === 'out' ? '¿De dónde sale el dinero?' : '¿A dónde llega el dinero?')}</span>
      <div className="grid grid-cols-2 gap-2">
        {accounts.map((a) => {
          const b = bal.get(a.id) ?? 0
          const on = a.id === value
          return (
            <button type="button" key={a.id} onClick={() => onChange(a.id)}
              aria-pressed={on} className={`rounded-2xl px-3.5 py-3 text-left transition duration-150 active:scale-[.98] ${on ? 'bg-accent/10 ring-2 ring-accent' : 'bg-surface ring-1 ring-line hover:ring-faint/40'}`}>
              <div className="truncate text-[14px] font-medium">{a.name}</div>
              <div className={`text-[12px] tabular-nums ${b < 0 ? 'text-neg' : 'text-muted'}`}>{money(b)}</div>
            </button>
          )
        })}
        {cards.map((c) => {
          const u = cardUsage(c, txs)
          const on = CARD + c.id === value
          return (
            <button type="button" key={c.id} onClick={() => onChange(CARD + c.id)}
              aria-pressed={on} className={`relative overflow-hidden rounded-2xl px-3.5 py-3 text-left transition duration-150 active:scale-[.98] ${on ? 'bg-accent/10 ring-2 ring-accent' : 'bg-surface ring-1 ring-line hover:ring-faint/40'}`}>
              <div className="flex items-center gap-1.5 truncate text-[14px] font-medium"><CardMini />{c.name}</div>
              <div className={`text-[12px] tabular-nums ${u.available !== null && u.available < 0 ? 'text-neg' : 'text-muted'}`}>
                {u.available !== null ? `Cupo ${money(u.available)}` : `Debes ${money(u.used)}`}
              </div>
            </button>
          )
        })}
        {allowCards && (
          <button type="button" onClick={() => setNewCard(true)}
            className={`rounded-2xl px-3.5 py-3 text-left ring-1 ring-dashed ring-line transition hover:bg-hover active:scale-[.98] ${cards.length ? 'border border-dashed border-line ring-0' : 'border border-dashed border-accent/50 ring-0'}`}>
            <div className="flex items-center gap-1.5 text-[14px] font-medium"><CardMini />{cards.length ? 'Otra tarjeta' : 'Tarjeta de crédito'}</div>
            <div className="text-[12px] text-accent">+ Agregar</div>
          </button>
        )}
      </div>
      {newCard && <DebtSheet initialKind="tarjeta" onSaved={(id) => onChange(CARD + id)} onClose={() => setNewCard(false)} />}
      {selCard && amount > 0 && (() => {
        const u = cardUsage(selCard, txs)
        const left = u.available !== null ? u.available - amount : null
        return (
          <p className={`mt-2 px-1 text-[13px] ${left !== null && left < 0 ? 'text-neg' : 'text-muted'}`}>
            💳 Queda como deuda en {selCard.name}{cardN > 1 ? ` a ${cardN} cuotas de ~${money(Math.round(amount / cardN))}` : ''}.
            {left !== null && (left < 0 ? ` Superas el cupo por ${money(-left)}.` : ` Te quedan ${money(left)} de cupo.`)}
            {` Lo pagas desde el ${shortDate(nextPayDate(selCard))}.`}
          </p>
        )
      })()}
      {selected && amount > 0 && tax > 0 && (
        <p className="mt-2 px-1 text-[13px] text-warn">🏛️ 4x1000: {money(tax)}</p>
      )}
      {selected && amount > 0 && (
        <p className={`mt-1 px-1 text-[13px] ${after < 0 ? 'text-neg' : 'text-muted'}`}>
          {after < 0
            ? `No te alcanza: en ${selected.name} tienes ${money(current)}. Quedaría en ${money(after)}.`
            : `En ${selected.name} quedarán ${money(after)}.`}
        </p>
      )}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <p className="mt-1.5 px-1 text-[12px] text-muted">{hint}</p>}
    </label>
  )
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-fill">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color ?? 'var(--color-accent)' }} />
    </div>
  )
}

// ── Pregunta del 4x1000 al crear/editar una cuenta ─────────────────────────
export function GmfPicker({ kind, gmf, limit, onChange }: {
  kind: string; gmf: Gmf | '' | undefined; limit: number | undefined; onChange: (gmf: Gmf, limit: number) => void
}) {
  if (kind === 'efectivo') return <p className="px-1 text-[13px] text-muted">💵 El efectivo no paga 4x1000.</p>
  const lim = limit || DEFAULT_GMF_LIMIT
  return (
    <div>
      <span className="label">¿Esta cuenta paga 4x1000?</span>
      <Segmented value={(gmf || '') as Gmf} onChange={(g) => onChange(g, lim)} options={[
        { value: 'aplica', label: 'Sí paga' }, { value: 'exenta', label: 'Exenta' }, { value: 'tope', label: 'Exenta con tope' },
      ]} />
      <p className="mt-1.5 px-1 text-[12px] text-muted">
        {gmf === 'aplica' ? 'Cada gasto, transferencia o retiro en cajero desde esta cuenta paga $4 por cada $1.000.'
          : gmf === 'exenta' ? 'La cuenta que marcaste como exenta en tu banco: no se calcula 4x1000.'
            : gmf === 'tope' ? 'Ej: Nequi. Lo que salga en el mes por encima del tope paga 4x1000.'
              : 'Elige una opción.'}
      </p>
      {gmf === 'tope' && (
        <div className="mt-2"><span className="label">Tope mensual sin 4x1000</span>
          <MoneyInput value={lim} onChange={(n) => onChange('tope', n)} />
        </div>
      )}
    </div>
  )
}

function CardMini() {
  return <span aria-hidden className="inline-block h-3 w-4.5 shrink-0 rounded-[3px] bg-gradient-to-br from-accent to-lime" />
}

// Selector de cuotas para compras con tarjeta.
export function CardInstallments({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const quick = [1, 3, 6, 12, 24, 36]
  return (
    <div>
      <span className="label">¿A cuántas cuotas?</span>
      <div className="flex flex-wrap gap-2">
        {quick.map((n) => (
          <button type="button" key={n} onClick={() => onChange(n)} aria-pressed={value === n}
            className={`min-h-10 min-w-12 rounded-full px-3.5 text-[14px] font-semibold transition ${value === n ? 'bg-accent text-on-accent' : 'bg-surface ring-1 ring-line'}`}>
            {n === 1 ? '1 (contado)' : n}
          </button>
        ))}
        <select aria-label="Otro número de cuotas" className="field w-auto py-2" value={quick.includes(value) ? '' : value} onChange={(e) => e.target.value && onChange(Number(e.target.value))}>
          <option value="">Otra…</option>
          {Array.from({ length: 48 }, (_, i) => i + 1).filter((n) => !quick.includes(n)).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <p className="mt-1.5 px-1 text-[12px] text-muted">Los intereses los cobra el banco en cada extracto; aquí se reparte solo el valor de la compra.</p>
    </div>
  )
}
