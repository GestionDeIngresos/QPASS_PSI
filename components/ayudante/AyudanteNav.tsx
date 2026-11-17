'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const ENLACES_AYUDANTE = [
  { href: '/ayudante', etiqueta: 'Dashboard' },
  { href: '/ayudante/ventas/nueva', etiqueta: 'Nueva venta' },
  { href: '/ayudante/historial', etiqueta: 'Historial' },
] as const;

export function AyudanteNav() {
  const pathname = usePathname();
  return <nav aria-label="Navegación del ayudante" className="border-b border-border bg-card px-4 sm:px-6">
    <div className="mx-auto flex max-w-6xl flex-wrap gap-2 py-3">
      {ENLACES_AYUDANTE.map(enlace => <Link key={enlace.href} href={enlace.href}
        aria-current={pathname === enlace.href ? 'page' : undefined}
        className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${pathname === enlace.href ? 'bg-pink/15 text-pink ring-1 ring-pink/40' : 'text-muted hover:bg-white/5 hover:text-white'}`}>
        {enlace.etiqueta}
      </Link>)}
    </div>
  </nav>;
}
