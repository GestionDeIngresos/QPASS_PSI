'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthCard } from '@/components/AuthCard'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    nombres: '', apellidos: '', ci: '', correo: '', password: '', confirmPassword: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (form.password !== form.confirmPassword) return setError('Las contraseñas no coinciden.')

    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: form.correo,
      password: form.password,
      options: {
        data: { nombre: `${form.nombres} ${form.apellidos}`.trim(), carnet_identidad: form.ci },
      },
    })
    setLoading(false)

    if (error) {
      setError(error.message === 'User already registered' ? 'Ya existe una cuenta con ese correo.' : 'No pudimos crear tu cuenta.')
      return
    }
    setSuccess(true)
    setTimeout(() => router.push('/login'), 2500)
  }

  if (success) {
    return (
      <AuthCard title="¡Cuenta creada!" subtitle="Revisa tu correo para confirmar tu cuenta.">
        <p className="text-center text-sm text-muted">Te redirigiremos al inicio de sesión...</p>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Crear cuenta" subtitle="Únete a la mejor red de eventos y accesos directos">
      <form onSubmit={handleSubmit}>
        <Input label="Nombres" placeholder="Ej. Juan Pablo" value={form.nombres} onChange={update('nombres')} required />
        <Input label="Apellidos" placeholder="Ej. Pérez García" value={form.apellidos} onChange={update('apellidos')} required />
        <Input label="Carnet de identidad (C.I.)" placeholder="12345678" value={form.ci} onChange={update('ci')} required />
        <Input label="Correo electrónico" type="email" placeholder="juan@correo.com" value={form.correo} onChange={update('correo')} required />
        <Input label="Contraseña" type="password" placeholder="Mínimo 8 caracteres" value={form.password} onChange={update('password')} required />
        <Input label="Confirmar contraseña" type="password" placeholder="Repite tu contraseña" value={form.confirmPassword} onChange={update('confirmPassword')} required />

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <Button type="submit" disabled={loading}>
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted">O</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <p className="text-center text-sm text-white">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-semibold text-pink hover:underline">Inicia sesión</Link>
      </p>
    </AuthCard>
  )
}