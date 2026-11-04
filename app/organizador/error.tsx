'use client' // los error boundaries deben ser Client Components

import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'

// Next 16 entrega `retry` (vuelve a consultar y renderizar el segmento)
export default function ErrorOrganizador({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error) // aquí sale el mensaje real (RLS, columna, función SQL que falta...)
  }, [error])

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-24 text-center">
      <h1 className="mb-3 text-2xl font-extrabold text-white">No pudimos cargar tu panel</h1>
      <p className="mb-8 text-sm text-muted">
        Ocurrió un problema inesperado. Si sigue pasando, avisa al equipo: puede faltar ejecutar el SQL del Sprint 2.
      </p>
      <Button type="button" onClick={() => retry()} className="w-auto px-8">
        Reintentar
      </Button>
    </div>
  )
}
