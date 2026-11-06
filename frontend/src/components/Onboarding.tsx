import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, newId, type Freq, type Gmf } from '../lib/db'
import { DEFAULT_GMF_LIMIT } from '../lib/gmf'
import { money } from '../lib/format'
import { removeLocal, saveLocal } from '../lib/sync'
import { PlusIcon } from './Icons'
import { GmfPicker, MoneyInput, Segmented } from './ui'

// Primer uso: hay que decir cuánto dinero se tiene y cuándo entra dinero.
// La app no deja continuar hasta tener al menos una cuenta con saldo y un ingreso.

interface AccDraft { id: string; name: string; kind: string; initial: number; isNew: boolean; gmf: Gmf | ''; gmf_limit: number }
interface IncDraft { id: string; name: string; amount: number; freq: Freq; day: number; day2: number; account: string }

const ACC_KINDS = [
  { value: 'efectivo', label: '💵' }, { value: 'banco', label: '🏦' }, { value: 'tarjeta', label: '💳' }, { value: 'ahorro', label: '🐷' },
]
const ACC_COLORS: Record<string, string> = { efectivo: '#30d158', banco: '#0a84ff', tarjeta: '#ff9f0a', ahorro: '#ff375f' }

export function Onboarding() {
  const existing = useLiveQuery(() => db.accounts.filter((a) => !a.deleted).toArray(), [])
  const salary = useLiveQuery(() => db.categories.filter((c) => !c.deleted && c.kind === 'ingreso').toArray(), [])
  const [step, setStep] = useState<1 | 2>(1)
  const [accs, setAccs] = useState<AccDraft[] | null>(null)
  const [removed, setRemoved] = useState<string[]>([])
  const [incs, setIncs] = useState<IncDraft[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (existing && accs === null) {
      setAccs(existing.length
        ? existing.map((a) => ({ id: a.id, name: a.name, kind: a.kind, initial: a.initial || 0, isNew: false, gmf: a.gmf ?? '', gmf_limit: a.gmf_limit || DEFAULT_GMF_LIMIT }))
        : [{ id: newId(), name: 'Efectivo', kind: 'efectivo', initial: 0, isNew: true, gmf: 'exenta', gmf_limit: 0 }])
    }
  }, [existing, accs])

  if (!accs) return null
  const named = accs.filter((a) => a.name.trim())
  const total = named.reduce((s, a) => s + a.initial, 0)

  const setAcc = (i: number, p: Partial<AccDraft>) => { setAccs(accs.map((a, j) => (j === i ? { ...a, ...p } : a))); setError('') }
  const setInc = (i: number, p: Partial<IncDraft>) => { setIncs(incs.map((a, j) => (j === i ? { ...a, ...p } : a))); setError('') }
  const addIncome = () => setIncs([...incs, { id: newId(), name: incs.length ? '' : 'Salario', amount: 0, freq: 'mensual', day: 30, day2: 30, account: named[0]?.id ?? '' }])

  async function next() {
    if (!named.length) return setError('Agrega al menos una cuenta')
    if (total <= 0) return setError('Escribe cuánto dinero tienes en tus cuentas hoy')
    const noGmf = named.find((a) => a.kind !== 'efectivo' && !a.gmf)
    if (noGmf) return setError(`Indica si "${noGmf.name}" paga 4x1000`)
    for (const id of removed) await removeLocal('accounts', id)
    for (const a of named) {
      await saveLocal('accounts', {
        id: a.id, name: a.name.trim(), kind: a.kind, initial: a.initial, color: ACC_COLORS[a.kind] ?? '#0a84ff',
        gmf: a.kind === 'efectivo' ? 'exenta' : a.gmf, gmf_limit: a.gmf === 'tope' ? a.gmf_limit : 0,
      })
    }
    if (!incs.length) addIncome()
    setStep(2)
  }

  async function finish() {
    const valid = incs.filter((x) => x.name.trim() && x.amount > 0)
    if (!valid.length) return setError('Agrega al menos un ingreso con su valor')
    if (valid.some((x) => !x.account)) return setError('Elige a qué cuenta llega cada ingreso')
    const cat = salary?.find((c) => c.name === 'Salario') ?? salary?.[0]
    for (const x of valid) {
      await saveLocal('recurring', {
        id: x.id, kind: 'ingreso', name: x.name.trim(), icon: '💼', amount: x.amount, freq: x.freq,
        day: x.day, day2: x.freq === 'quincenal' ? x.day2 : 0, month: 0, account: x.account, category: cat?.id ?? '',
      })
    }
    // Al guardar el primer ingreso, la app pasa sola a la pantalla principal.
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-10">
      <div className="mb-8 flex items-center justify-center gap-2">
        {[1, 2].map((n) => <span key={n} className={`h-1.5 w-10 rounded-full ${n <= step ? 'bg-accent' : 'bg-fill'}`} />)}
      </div>

      {step === 1 ? (
        <div className="space-y-5">
          <div className="text-center">
            <div className="text-5xl">💰</div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight">¿Cuánto dinero tienes hoy?</h1>
            <p className="mt-1 text-[15px] text-muted">Escribe lo que hay en cada cuenta, billetera o bolsillo. Será tu punto de partida.</p>
          </div>
          <div className="space-y-3">
            {accs.map((a, i) => (
              <div key={a.id} className="card space-y-3 p-4">
                <div className="flex gap-2">
                  <input className="field" placeholder="Nombre (Bancolombia, Nequi, Efectivo…)" maxLength={60} value={a.name} onChange={(e) => setAcc(i, { name: e.target.value })} />
                  {accs.length > 1 && (
                    <button type="button" className="btn-ghost px-3" aria-label="Quitar" onClick={() => { if (!a.isNew) setRemoved([...removed, a.id]); setAccs(accs.filter((_, j) => j !== i)) }}>✕</button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-40 shrink-0"><Segmented value={a.kind} onChange={(k) => setAcc(i, { kind: k })} options={ACC_KINDS} /></div>
                  <MoneyInput value={a.initial} onChange={(n) => setAcc(i, { initial: n })} />
                </div>
                <GmfPicker kind={a.kind} gmf={a.gmf} limit={a.gmf_limit} onChange={(g, l) => setAcc(i, { gmf: g, gmf_limit: l })} />
              </div>
            ))}
            <button type="button" className="btn-ghost w-full" onClick={() => setAccs([...accs, { id: newId(), name: '', kind: 'banco', initial: 0, isNew: true, gmf: '', gmf_limit: DEFAULT_GMF_LIMIT }])}>
              <PlusIcon width={18} height={18} />Agregar otra cuenta
            </button>
          </div>
          <div className="text-center text-[15px]">Total: <b className="tabular-nums">{money(total)}</b></div>
          {error && <p className="text-center text-[14px] text-neg">{error}</p>}
          <button className="btn-primary w-full" onClick={() => void next()}>Continuar</button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="text-center">
            <div className="text-5xl">💼</div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight">¿Cuánto y cuándo te ingresa dinero?</h1>
            <p className="mt-1 text-[15px] text-muted">Tu salario u otros ingresos fijos. Así sabré cuándo llega la plata y a qué cuenta.</p>
          </div>
          <div className="space-y-3">
            {incs.map((x, i) => (
              <div key={x.id} className="card space-y-3 p-4">
                <div className="flex gap-2">
                  <input className="field" placeholder="Ej: Salario, arriendo que recibo…" maxLength={60} value={x.name} onChange={(e) => setInc(i, { name: e.target.value })} />
                  {incs.length > 1 && <button type="button" className="btn-ghost px-3" aria-label="Quitar" onClick={() => setIncs(incs.filter((_, j) => j !== i))}>✕</button>}
                </div>
                <div><span className="label">{x.freq === 'quincenal' ? 'Valor de cada pago' : 'Valor'}</span><MoneyInput value={x.amount} onChange={(n) => setInc(i, { amount: n })} /></div>
                <Segmented value={x.freq} onChange={(f) => setInc(i, { freq: f, day: f === 'quincenal' ? 15 : x.day })}
                  options={[{ value: 'mensual', label: 'Mensual' }, { value: 'quincenal', label: 'Quincenal' }]} />
                <div className="grid grid-cols-2 gap-3">
                  <label><span className="label">{x.freq === 'quincenal' ? 'Primer pago (día)' : 'Día en que llega'}</span>
                    <select className="field" value={x.day} onChange={(e) => setInc(i, { day: Number(e.target.value) })}>
                      {Array.from({ length: 31 }, (_, d) => <option key={d} value={d + 1}>{d + 1}</option>)}
                    </select>
                  </label>
                  {x.freq === 'quincenal' && (
                    <label><span className="label">Segundo pago (día)</span>
                      <select className="field" value={x.day2} onChange={(e) => setInc(i, { day2: Number(e.target.value) })}>
                        {Array.from({ length: 31 }, (_, d) => <option key={d} value={d + 1}>{d + 1}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div><span className="label">¿A qué cuenta llega?</span>
                  <div className="flex flex-wrap gap-2">
                    {named.map((a) => (
                      <button type="button" key={a.id} onClick={() => setInc(i, { account: a.id })}
                        className={`rounded-full px-3.5 py-1.5 text-[14px] transition ${x.account === a.id ? 'bg-accent text-on-accent' : 'bg-surface ring-1 ring-line'}`}>
                        {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="btn-ghost w-full" onClick={addIncome}><PlusIcon width={18} height={18} />Agregar otro ingreso</button>
          </div>
          {error && <p className="text-center text-[14px] text-neg">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setStep(1)}>Atrás</button>
            <button className="btn-primary flex-1" onClick={() => void finish()}>Empezar</button>
          </div>
        </div>
      )}
    </div>
  )
}
