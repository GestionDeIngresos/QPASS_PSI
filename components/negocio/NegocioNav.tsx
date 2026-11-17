'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type ItemMenu = { href: string; etiqueta: string; icono: 'tienda' | 'caja' }

const MENU: ItemMenu[] = [
  { href: '/negocio/negocios', etiqueta: 'Mis Negocios', icono: 'tienda' },
  { href: '/negocio/productos', etiqueta: 'Productos', icono: 'caja' },
]

function Icono({ tipo }: { tipo: ItemMenu['icono'] }) {
  const comun = {
    'aria-hidden': true,
    viewBox: '0 0 24 24',
    className: 'h-4 w-4 shrink-0',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  return tipo === 'tienda' ? (
    <svg {...comun}>
      <path d="M3 9l1-5h16l1 5" />
      <path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z" />
      <path d="M9 21V12h6v9" />
    </svg>
  ) : (
    <svg {...comun}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

/** Menú lateral (vertical) o barra de pestañas (horizontal, en móvil y tableta) */
export function NegocioNav({ horizontal = false }: { horizontal?: boolean }) {
  const ruta = usePathname()

  return (
    <nav className={horizontal ? 'flex gap-2 overflow-x-auto px-4 py-3' : 'flex flex-col gap-2 px-4 py-4'}>
      {MENU.map((item) => {
        const actual = ruta === item.href || ruta.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={actual ? 'page' : undefined}
            className={`flex items-center gap-3 whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
              horizontal ? '' : 'w-full'
            } ${
              actual
                ? 'border-pink bg-pink/10 text-white'
                : 'border-transparent text-muted hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className={actual ? 'text-pink' : ''}>
              <Icono tipo={item.icono} />
            </span>
            {item.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
