'use client'

import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function CerrarSesionButton({ className }: { className?: string }) {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const modal = useRef<HTMLDialogElement>(null)
  const tituloId = useId()
  const descripcionId = useId()

  async function cerrarSesion() {
    if (cargando) return
    setCargando(true)
    setError('')
    try {
      const { error } = await createClient().auth.signOut()
      if (error) throw error
      modal.current?.close()
      router.replace('/login')
      router.refresh()
    } catch {
      setError('No se pudo cerrar sesión. Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => { setError(''); modal.current?.showModal() }}
        disabled={cargando}
        className={className ?? 'flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-pink disabled:opacity-50'}
      >
        Cerrar sesión
      </button>
      <dialog
        ref={modal}
        aria-labelledby={tituloId}
        aria-describedby={descripcionId}
        onCancel={(e) => { if (cargando) e.preventDefault() }}
        onKeyDown={(e) => { if (e.key === 'Escape') e.stopPropagation() }}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-card p-6 text-left text-white shadow-[0_0_40px_rgba(157,0,255,0.25)] backdrop:bg-black/75 backdrop:backdrop-blur-sm"
      >
        <h2 id={tituloId} className="text-xl font-bold">¿Cerrar sesión?</h2>
        <p id={descripcionId} className="mt-3 text-sm text-muted">Tendrás que iniciar sesión de nuevo para acceder a tu cuenta.</p>
        {error && <p role="alert" className="mt-4 rounded-lg border border-pink/50 bg-pink/10 p-3 text-sm text-pink">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" autoFocus disabled={cargando} onClick={() => modal.current?.close()} className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-muted transition hover:border-white hover:text-white disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" disabled={cargando} onClick={cerrarSesion} className="rounded-lg bg-pink px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(255,0,122,0.3)] transition hover:bg-pink-hover disabled:opacity-50">
            {cargando ? 'Saliendo…' : 'Sí, cerrar sesión'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
