'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { RolCaja } from '@/lib/saldos/types'
export function CajaNav({ rol }: { rol: RolCaja }) {
  const ruta = usePathname()
  const enlaces = [
    {
      href: `/${rol}`,
      texto: rol === 'recargador' ? 'Nueva recarga' : 'Devolución presencial'
    },
    { href: `/${rol}/historial`, texto: 'Historial' },
    ...(rol === 'recargador'
      ? [{ href: '/recargador/reportes', texto: 'Mis reportes' }]
      : [{ href: '/devolucion/solicitudes', texto: 'Solicitudes virtuales' }]),
    { href: '/mi-cuenta/ticket-extraviado', texto: 'Ticket extraviado' }
  ]
  return (
    <nav
      aria-label={`Navegación ${rol}`}
      className="flex flex-wrap gap-3 border-b border-border px-6 py-4"
    >
      {enlaces.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          aria-current={ruta === e.href ? 'page' : undefined}
          className={`rounded-lg px-3 py-2 text-sm font-bold ${ruta === e.href ? 'bg-pink text-white' : 'text-muted hover:text-cyan'}`}
        >
          {e.texto}
        </Link>
      ))}
    </nav>
  )
}
