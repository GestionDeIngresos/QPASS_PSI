'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthCard } from '@/components/AuthCard'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    const correo = email.trim()
    if (correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError('Ingresa un correo electrónico válido.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(correo, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        // Los errores de cuenta tampoco deben permitir enumerar correos.
        if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
          setError('Espera unos minutos antes de solicitar otro enlace.')
        } else if (error.status === 0 || (error.status !== undefined && error.status >= 500) || error.name === 'AuthRetryableFetchError') {
          setError('No pudimos enviar la solicitud. Inténtalo de nuevo en unos minutos.')
        } else {
          setSent(true)
        }
        return
      }
      setSent(true)
    } catch {
      setError('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Recuperar clave" subtitle="Te enviaremos un enlace para restablecer tu contraseña.">
      {sent ? (
        <div role="status" className="space-y-3 text-center text-sm text-muted">
          <p>Si el correo está registrado, te llegará un enlace en unos minutos. Revisa también la carpeta de spam.</p>
          <p>Abre el enlace en este mismo navegador y dispositivo.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <Input label="Email registrado" aria-label="Email registrado" type="email" autoComplete="email" maxLength={254} disabled={loading} placeholder="ejemplo@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-pink hover:underline">Volver al inicio de sesión</Link>
      </p>
    </AuthCard>
  )
}
