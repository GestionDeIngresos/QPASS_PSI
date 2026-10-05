'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthCard } from '@/components/AuthCard'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) return setError('No pudimos actualizar tu contraseña. El enlace pudo haber expirado.')
    router.push('/login')
  }

  return (
    <AuthCard title="Nueva contraseña" subtitle="Ingresa tu nueva contraseña para continuar.">
      <form onSubmit={handleSubmit}>
        <Input label="Nueva contraseña" type="password" placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Input label="Confirmar contraseña" type="password" placeholder="Repite tu contraseña" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
        <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Guardar contraseña'}</Button>
      </form>
    </AuthCard>
  )
}