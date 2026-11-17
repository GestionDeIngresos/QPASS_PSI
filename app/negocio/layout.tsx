import Link from 'next/link'
import { AccionesCuenta } from '@/components/AccionesCuenta'
import { NegocioNav } from '@/components/negocio/NegocioNav'
import { exigirNegocio } from '@/lib/negocio/server'

function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/negocio" className={`flex items-center gap-2 text-xl font-bold text-white ${className}`}>
      <span className="h-2 w-2 rounded-full bg-pink" />
      <span className="underline decoration-pink underline-offset-4">Q</span>Pass
    </Link>
  )
}

// Layout del panel del dueño de negocio: menú lateral + barra superior.
// Sin sesión o rol distinto de 'negocio' → redirige desde exigirNegocio().
export default async function NegocioLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil } = await exigirNegocio()
  const nombre = perfil?.nombre ?? user.email ?? 'Usuario'

  return (
    <div className="flex min-h-screen bg-[#05050A]">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-bg lg:block">
        <Logo className="px-6 py-6" />
        <NegocioNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-bg/70 px-6 py-4 md:px-10">
          <Logo className="lg:invisible" />
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold text-white">{nombre}</p>
              <p className="text-xs font-semibold text-pink">Rol: Dueño de Negocio</p>
            </div>
            <AccionesCuenta perfil={{ nombre, correo: user.email ?? '', rol: 'negocio' }} />
          </div>
        </div>

        <div className="border-b border-border bg-bg lg:hidden">
          <NegocioNav horizontal />
        </div>

        <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
      </div>
    </div>
  )
}
