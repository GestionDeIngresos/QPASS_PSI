import Link from 'next/link'
import { exigirSupervisor } from '@/lib/supervisor/server'
import { AccionesCuenta } from '@/components/AccionesCuenta'
import { SupervisorNav } from '@/components/supervisor/SupervisorNav'
export default async function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil } = await exigirSupervisor()
  return <div className="min-h-screen bg-bg"><header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-4"><Link href="/" className="text-xl font-bold">Q<span className="text-pink">Pass</span></Link><span className="text-sm text-muted">Panel Supervisor</span><AccionesCuenta perfil={{ nombre: perfil?.nombre ?? '', correo: user.email ?? '', rol: 'supervisor' }}/></header><SupervisorNav/><main className="mx-auto max-w-6xl px-6 py-8">{children}</main></div>
}
