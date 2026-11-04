'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { actualizarPerfil, type DatosPerfil } from '@/app/mi-cuenta/perfil/actions'
import { Avatar } from '@/components/MenuCuenta'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function EditarPerfilForm({ inicial }: { inicial: DatosPerfil }) {
  const router = useRouter()
  const [datos, setDatos] = useState(inicial)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  const campo = (k: keyof DatosPerfil) => ({
    value: datos[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setDatos((d) => ({ ...d, [k]: e.target.value }))
      setError(null)
      setExito(null)
    },
  })

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    iniciar(async () => {
      const r = await actualizarPerfil(datos)
      if (!r.ok) return setError(r.error)
      setExito(r.mensaje)
      router.refresh()
    })
  }

  return (
    <form onSubmit={enviar}>
      <div className="mb-6 flex justify-center">
        <Avatar nombre={`${datos.nombres} ${datos.apellidos}`} grande />
      </div>

      <Input label="Nombres" {...campo('nombres')} required maxLength={60} placeholder="Ej. Juan" />
      <Input label="Apellidos" {...campo('apellidos')} required maxLength={60} placeholder="Ej. Pérez" />
      <Input label="Correo electrónico" type="email" {...campo('correo')} required placeholder="juan@correo.com" />
      <Input label="Carnet de identidad (C.I.)" {...campo('carnet')} required maxLength={20} placeholder="12345678" />

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-400">
          {error}
        </p>
      )}
      {exito && (
        <p role="status" className="mb-4 text-sm text-green-400">
          {exito}
        </p>
      )}

      <Button type="submit" disabled={guardando}>
        {guardando ? 'Guardando...' : 'Guardar cambios'}
      </Button>
      <Link href="/eventos" className="mt-4 block text-center text-sm text-muted hover:text-white">
        Cancelar
      </Link>
    </form>
  )
}
