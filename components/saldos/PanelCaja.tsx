import Link from 'next/link'
import { AccionesCuenta } from '@/components/AccionesCuenta'
import { exigirPersonal } from '@/lib/saldos/server'
import { CajaNav } from './CajaNav'
import type { RolCaja } from '@/lib/saldos/types'
export async function PanelCaja({
  rol,
  children
}: {
  rol: RolCaja
  children: React.ReactNode
}) {
  const { user, perfil } = await exigirPersonal(rol)
  return (
    <div className="min-h-screen bg-bg">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-4">
        <Link href="/" className="text-xl font-extrabold">
          Q<span className="text-pink">Pass</span>
        </Link>
        <span className="text-sm text-muted">
          {rol === 'recargador' ? 'Panel Recargador' : 'Panel Devoluciones'}
        </span>
        <AccionesCuenta
          perfil={{
            nombre: perfil?.nombre ?? '',
            correo: user.email ?? '',
            rol: perfil?.rol ?? rol
          }}
        />
      </header>
      <CajaNav rol={rol} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}
