'use client' // los error boundaries deben ser Client Components

import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'

// Next 16 entrega `retry` (re-consulta y re-renderiza el segmento)
export default function ErrorEventos({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error) // ← aquí aparece el mensaje real (ej. error de RLS o de columna)
  }, [error])

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 py-24 text-center">
      <h1 className="mb-3 text-2xl font-extrabold text-white">No pudimos cargar los eventos</h1>
      <p className="mb-8 text-sm text-muted">Ocurrió un problema inesperado. Inténtalo otra vez.</p>
      <Button type="button" onClick={() => retry()} className="w-auto px-8">
        Reintentar
      </Button>
    </div>
  )
}
