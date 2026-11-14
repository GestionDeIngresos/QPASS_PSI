'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthCard } from '@/components/AuthCard'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

type Estado = 'verificando' | 'invalido' | 'listo' | 'actualizado' | 'completado'
const RECUPERACION = 'qpass:recuperacion'
const ENLACE_INVALIDO = 'El enlace no es válido, venció o ya fue utilizado. Solicita uno nuevo y ábrelo en el mismo navegador y dispositivo.'

// Contexto de interfaz por pestaña, sin tokens ni contraseñas. La API valida la sesión.
function borrarRecuperacion() {
  try { sessionStorage.removeItem(RECUPERACION) } catch { /* Almacenamiento deshabilitado. */ }
}

export default function ResetPasswordPage() {
  const supabase = createClient()
  const [estado, setEstado] = useState<Estado>('verificando')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const usuarioRecuperacion = useRef<string | null>(null)
  const enviando = useRef(false)

  useEffect(() => {
    let activo = true
    const url = new URL(window.location.href)
    const hash = new URLSearchParams(url.hash.slice(1))
    const errorUrl = url.searchParams.has('error') || url.searchParams.has('error_code') || hash.has('error') || hash.has('error_code')
    const invalidar = () => {
      usuarioRecuperacion.current = null
      borrarRecuperacion()
      if (activo) setEstado('invalido')
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (!activo) return
      if (evento === 'PASSWORD_RECOVERY' && sesion && !errorUrl) {
        usuarioRecuperacion.current = sesion.user.id
        try {
          sessionStorage.setItem(RECUPERACION, JSON.stringify({
            usuario: sesion.user.id,
            vence: Math.min((sesion.expires_at ?? 0) * 1000, Date.now() + 15 * 60 * 1000),
          }))
        } catch { /* El flujo puede continuar sin persistencia. */ }
        setEstado('listo')
      } else if (evento === 'SIGNED_OUT') {
        invalidar()
      }
    })

    void (async () => {
      try {
        // El SDK ya intercambia el código PKCE. No consumir el enlace dos veces.
        const { error: errorInicial } = await supabase.auth.initialize()
        if (!activo) return
        if (errorUrl || errorInicial) { invalidar(); return }
        const { data: { user }, error: errorUsuario } = await supabase.auth.getUser()
        if (!activo) return
        if (errorUsuario || !user) { invalidar(); return }
        if (usuarioRecuperacion.current === user.id) return
        let contexto: { usuario?: string; vence?: number } | null = null
        try { contexto = JSON.parse(sessionStorage.getItem(RECUPERACION) ?? 'null') } catch { /* Sin contexto. */ }
        // Solo reanudar una recuperación iniciada en esta pestaña y aún vigente.
        if (!url.searchParams.has('code') && !url.hash && contexto?.usuario === user.id && typeof contexto.vence === 'number' && contexto.vence > Date.now()) {
          usuarioRecuperacion.current = user.id
          setEstado('listo')
        } else {
          invalidar()
        }
      } catch {
        invalidar()
      }
    })()
    return () => { activo = false; subscription.unsubscribe() }
  }, [supabase])

  async function finalizar() {
    // No navegar a login mientras las cookies aún autentican la recuperación.
    const { error: errorSalida } = await supabase.auth.signOut({ scope: 'local' })
    if (errorSalida) {
      setError('Tu contraseña ya se actualizó. No pudimos cerrar la sesión temporal; vuelve a intentarlo.')
      return
    }
    setError(null)
    setEstado('completado')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (enviando.current || estado !== 'listo') return
    setError(null)
    if (password.length < 8 || !password.trim()) return setError('La contraseña debe tener al menos 8 caracteres y no puede contener solo espacios.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    enviando.current = true
    setLoading(true)
    try {
      const { data: { user }, error: errorUsuario } = await supabase.auth.getUser()
      if (errorUsuario || !user || user.id !== usuarioRecuperacion.current) {
        borrarRecuperacion()
        setEstado('invalido')
        return
      }
      const { error: errorCambio } = await supabase.auth.updateUser({ password })
      if (errorCambio) {
        if (errorCambio.code === 'weak_password' || errorCambio.code === 'same_password') {
          setError('Elige una contraseña diferente que cumpla la política de seguridad de la cuenta.')
        } else if (errorCambio.status === 401 || errorCambio.status === 403 || errorCambio.code === 'session_not_found' || errorCambio.code === 'session_expired') {
          borrarRecuperacion()
          setEstado('invalido')
        } else {
          setError('No pudimos actualizar tu contraseña. Inténtalo de nuevo; si el enlace venció, solicita otro.')
        }
        return
      }
      borrarRecuperacion()
      usuarioRecuperacion.current = null
      setPassword('')
      setConfirm('')
      setEstado('actualizado')
      await finalizar()
    } catch {
      setError('No pudimos completar la operación. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      enviando.current = false
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Nueva contraseña" subtitle="Ingresa tu nueva contraseña para continuar.">
      {estado === 'verificando' && <p role="status" className="text-center text-sm text-muted">Verificando enlace de recuperación…</p>}
      {estado === 'invalido' && <p role="alert" className="text-center text-sm text-pink">{ENLACE_INVALIDO}</p>}
      {estado === 'listo' && <form onSubmit={handleSubmit}>
        <Input label="Nueva contraseña" aria-label="Nueva contraseña" type="password" autoComplete="new-password" minLength={8} disabled={loading} placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Input label="Confirmar contraseña" aria-label="Confirmar contraseña" type="password" autoComplete="new-password" minLength={8} disabled={loading} placeholder="Repite tu contraseña" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Guardar contraseña'}</Button>
      </form>}
      {estado === 'actualizado' && <div className="space-y-4">
        <p role="status" className="text-center text-sm text-cyan">Tu contraseña se actualizó.</p>
        <Button type="button" disabled={loading} onClick={async () => {
          setLoading(true)
          try { await finalizar() } catch { setError('No pudimos cerrar la sesión temporal. Revisa tu conexión e inténtalo de nuevo.') } finally { setLoading(false) }
        }}>{loading ? 'Cerrando sesión…' : 'Cerrar sesión temporal'}</Button>
      </div>}
      {estado === 'completado' && <div role="status" className="space-y-4 text-center text-sm">
        <p className="text-cyan">Contraseña actualizada. La sesión temporal se cerró.</p>
        <a href="/login" className="font-semibold text-pink hover:underline">Iniciar sesión con la nueva contraseña</a>
      </div>}
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      {(estado === 'invalido' || estado === 'listo') && <p className="mt-6 text-center text-sm">
        <Link href="/forgot-password" className="font-semibold text-pink hover:underline">Solicitar otro enlace</Link>
      </p>}
    </AuthCard>
  )
}
