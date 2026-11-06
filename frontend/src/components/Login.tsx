import { ClientResponseError } from 'pocketbase'
import { useState } from 'react'
import { pb } from '../lib/pb'

export function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError(''); setBusy(true)
    try {
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres')
        await pb.collection('users').create({ email, password, passwordConfirm: password })
      }
      await pb.collection('users').authWithPassword(email, password)
    } catch (e) {
      if (e instanceof ClientResponseError) {
        setError(e.status === 0 ? 'No se pudo conectar con el servidor.'
          : mode === 'login' ? 'Correo o contraseña incorrectos.'
            : e.response?.data?.email ? 'Ese correo ya está registrado o no es válido.' : e.message)
      } else setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-5">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[720px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, color-mix(in oklab, var(--brand) 35%, transparent), transparent)' }} />
      <form className="card relative w-full max-w-sm space-y-5 p-6 md:p-8" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div className="text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-4 h-16 w-16 drop-shadow-lg" />
          <h1 className="text-[26px] font-extrabold tracking-tight">Finanzas</h1>
          <p className="mt-1 text-[15px] text-muted">{mode === 'login' ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}</p>
        </div>
        <div className="space-y-3">
          <input className="field" type="email" aria-label="Correo" autoComplete="email" placeholder="Correo" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="field" type="password" aria-label="Contraseña" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Contraseña" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-center text-[14px] text-neg">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
        <button type="button" className="w-full text-[14px] text-accent" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
          {mode === 'login' ? '¿No tienes cuenta? Créala' : 'Ya tengo cuenta'}
        </button>
      </form>
    </div>
  )
}
