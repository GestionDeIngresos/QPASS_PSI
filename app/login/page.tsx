'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthCard } from '@/components/AuthCard'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      setError('Correo o contraseña incorrectos.')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <AuthCard title="Iniciar sesión" subtitle="Accede a tus entradas y próximos eventos">
      <form onSubmit={handleSubmit}>
        <Input
          label="Email"
          type="email"
          placeholder="ejemplo@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div className="mb-2">
          <label className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
            Contraseña
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="normal-case text-pink">
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-card px-4 py-3 text-white placeholder:text-muted/60 outline-none transition focus:border-pink"
          />
        </div>

        <div className="mb-6 text-right">
          <Link href="/forgot-password" className="text-sm text-pink hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <Button type="submit" disabled={loading}>
          {loading ? 'Ingresando...' : 'Iniciar sesión'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted">O</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <p className="text-center text-sm text-white">
        ¿No tienes cuenta?{' '}
        <Link href="/register" className="font-semibold text-pink hover:underline">
          Crear una cuenta
        </Link>
      </p>
    </AuthCard>
  )
}