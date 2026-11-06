import { useState } from 'react'
import { money } from '../lib/format'

// Gráficas hechas a mano (sin librerías): columnas delgadas de un solo color,
// valores solo en el punto clave, valor al tocar/pasar el mouse y vista de tabla.

const compact = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 })
export const moneyShort = (n: number) => `${n < 0 ? '−' : ''}$${compact.format(Math.abs(n))}`

function niceMax(v: number) {
  if (v <= 0) return 0
  const p = 10 ** Math.floor(Math.log10(v))
  const f = v / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

export interface Point { key: string; label: string; full: string; value: number }

export function Columns({ data, labelEvery = 1, emptyText = 'Sin datos en este periodo' }: { data: Point[]; labelEvery?: number; emptyText?: string }) {
  const [active, setActive] = useState<number | null>(null)
  const values = data.map((d) => d.value)
  const top = niceMax(Math.max(0, ...values))
  const bottom = -niceMax(-Math.min(0, ...values))
  const span = top - bottom || 1
  const zero = (top / span) * 100 // % desde arriba hasta la línea de 0
  const maxI = values.indexOf(Math.max(...values))
  const has = values.some((v) => v !== 0)
  const ticks = [top, top / 2, ...(bottom < 0 ? [0, bottom] : [0])]

  if (!has) return <div className="grid h-40 place-items-center text-[13px] text-muted">{emptyText}</div>

  return (
    <div>
      <div className="relative flex h-48 pt-12" onPointerLeave={() => setActive(null)}>
        {/* eje y */}
        <div className="relative w-12 shrink-0 text-[10px] text-muted tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 -translate-y-1/2" style={{ top: `${((top - t) / span) * 100}%` }}>{moneyShort(t)}</span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className={`absolute inset-x-0 h-px ${t === 0 ? 'bg-line' : 'bg-fill'}`} style={{ top: `${((top - t) / span) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex">
            {data.map((d, i) => {
              const h = (Math.abs(d.value) / span) * 100
              const neg = d.value < 0
              return (
                <button key={d.key} type="button" aria-label={`${d.full}: ${money(d.value)}`}
                  onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)}
                  className="group relative flex-1 outline-none">
                  {d.value !== 0 && (
                    <span className={`absolute left-1/2 w-[min(24px,70%)] -translate-x-1/2 transition ${neg ? 'rounded-b bg-faint' : 'rounded-t bg-[var(--series-1)]'} ${active === i ? 'brightness-110 saturate-150' : active !== null ? 'opacity-50' : ''}`}
                      style={neg ? { top: `${zero}%`, height: `${h}%` } : { bottom: `${100 - zero}%`, height: `${h}%` }} />
                  )}
                  {active === null && i === maxI && d.value > 0 && (
                    <span className="absolute left-1/2 -translate-x-1/2 -translate-y-full pb-1 text-[11px] font-semibold whitespace-nowrap tabular-nums"
                      style={{ bottom: `${100 - zero + h}%` }}>{moneyShort(d.value)}</span>
                  )}
                </button>
              )
            })}
          </div>
          {active !== null && (
            <div className="pointer-events-none absolute -top-11 z-10 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-center whitespace-nowrap text-bg shadow-lg"
              style={{ left: `${Math.min(88, Math.max(12, ((active + 0.5) / data.length) * 100))}%` }}>
              <div className="text-[13px] font-semibold tabular-nums">{money(data[active].value)}</div>
              <div className="text-[11px] opacity-70">{data[active].full}</div>
            </div>
          )}
        </div>
      </div>
      <div className="ml-12 flex">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 pt-1.5 text-center text-[10px] text-muted">
            {i % labelEvery === 0 || i === data.length - 1 ? d.label : ''}
          </span>
        ))}
      </div>
      <DataTable rows={data.map((d) => [d.full, money(d.value)])} />
    </div>
  )
}

export function DataTable({ rows, head = ['Periodo', 'Valor'] }: { rows: (string | number)[][]; head?: string[] }) {
  return (
    <details className="mt-3 text-[13px]">
      <summary className="cursor-pointer text-accent select-none">Ver tabla</summary>
      <table className="mt-2 w-full">
        <thead><tr className="text-left text-[12px] text-muted">{head.map((h, i) => <th key={h} className={`py-1 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])} className="border-t border-line">
              {r.map((c, i) => <td key={i} className={`py-1.5 ${i ? 'text-right tabular-nums' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

// Barras horizontales para "en qué se gasta": nombre como texto, barra de un solo color.
export function HBars({ rows }: { rows: { key: string; icon: string; name: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  const total = rows.reduce((a, r) => a + r.value, 0) || 1
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} title={`${r.name}: ${money(r.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[14px]">
            <span className="truncate">{r.icon} {r.name}</span>
            <span className="shrink-0 tabular-nums"><b>{money(r.value)}</b> <span className="text-[12px] text-muted">{Math.round((r.value / total) * 100)}%</span></span>
          </div>
          <div className="h-2 rounded-r bg-fill">
            <div className="h-full rounded-r bg-[var(--series-1)]" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
