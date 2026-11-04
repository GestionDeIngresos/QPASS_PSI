import Link from 'next/link'
import { CerrarSesionButton } from '@/components/CerrarSesionButton'
import { OrganizadorNav } from '@/components/organizador/OrganizadorNav'
import { exigirSesion, obtenerPerfil } from '@/lib/organizador/auth'
import { etiquetaRol } from '@/lib/organizador/format'

function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/organizador/eventos" className={`flex items-center gap-2 text-xl font-bold text-white ${className}`}>
      <span className="h-2 w-2 rounded-full bg-pink" />
      <span className="underline decoration-pink underline-offset-4">Q</span>Pass
    </Link>
  )
}

// Layout propio del panel del organizador (menú lateral + barra superior).
// Sin sesión → /login. El Header/Footer públicos se ocultan en OcultarEnPanel.
export default async function OrganizadorLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await exigirSesion()
  const perfil = await obtenerPerfil(supabase, user)

  return (
    <div className="flex min-h-screen bg-[#05050A]">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-bg lg:block">
        <Logo className="px-6 py-6" />
        <OrganizadorNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-border bg-bg/70 px-6 py-4 md:px-10">
          <Logo className="lg:invisible" />
          <div className="flex items-center gap-4">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold text-white">{perfil.nombre}</p>
              <p className="text-xs font-semibold text-pink">Rol: {etiquetaRol(perfil.rol)}</p>
            </div>
            <CerrarSesionButton />
          </div>
        </div>

        <div className="border-b border-border bg-bg lg:hidden">
          <OrganizadorNav horizontal />
        </div>

        <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
      </div>
    </div>
  )
}
