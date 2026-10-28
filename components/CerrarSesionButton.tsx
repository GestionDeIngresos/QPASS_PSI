'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function CerrarSesionButton() {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)

  async function cerrarSesion() {
    setCargando(true)
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={cerrarSesion}
      disabled={cargando}
      className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-pink disabled:opacity-50"
    >
      <span className="h-5 w-5 rounded-full bg-white/20" />
      {cargando ? 'Saliendo...' : 'Cerrar sesión'}
    </button>
  )
}
