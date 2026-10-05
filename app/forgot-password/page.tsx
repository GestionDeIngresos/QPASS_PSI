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
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)
    if (error) return setError('No pudimos enviar el enlace. Verifica el correo.')
    setSent(true)
  }

  return (
    <AuthCard title="Recuperar clave" subtitle="Te enviaremos un enlace para restablecer tu contraseña.">
      {sent ? (
        <p className="text-center text-sm text-muted">Si el correo está registrado, te llegará un enlace en unos minutos.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <Input label="Email registrado" type="email" placeholder="ejemplo@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
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