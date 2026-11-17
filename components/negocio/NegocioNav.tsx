'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const MENU = [{ href: '/negocio/negocios', etiqueta: 'Mis Negocios' }]

function IconoTienda() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l1-5h16l1 5" />
      <path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z" />
      <path d="M9 21V12h6v9" />
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
              <IconoTienda />
            </span>
            {item.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
