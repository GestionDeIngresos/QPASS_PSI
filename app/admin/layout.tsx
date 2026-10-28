import Link from 'next/link'
import { AdminNav } from '@/components/admin/AdminNav'
import { CerrarSesionButton } from '@/components/CerrarSesionButton'
import { exigirAdmin } from '@/lib/admin/auth'

function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/admin/solicitudes" className={`flex items-center gap-2 text-xl font-bold text-white ${className}`}>
      <span className="h-2 w-2 rounded-full bg-pink" />
      <span className="underline decoration-pink underline-offset-4">Q</span>Pass
    </Link>
  )
}

// Layout del panel Admin: menú lateral + barra superior. El guard de rol corre aquí, en el servidor.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { perfil } = await exigirAdmin()

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">
        <Logo className="px-6 py-6" />
        <AdminNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-border bg-card/60 px-6 py-4 md:px-10">
          <Logo className="lg:invisible" />
          <div className="flex items-center gap-4">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold text-white">{perfil.nombre}</p>
              <p className="text-xs font-semibold text-pink">Rol: Admin</p>
            </div>
            <CerrarSesionButton />
          </div>
        </div>

        <div className="border-b border-border bg-card lg:hidden">
          <AdminNav horizontal />
        </div>

        <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
      </div>
    </div>
  )
}
