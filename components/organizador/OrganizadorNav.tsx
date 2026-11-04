'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MENU_ORGANIZADOR, type ItemMenuOrganizador } from '@/components/organizador/menu'

function Icono({ tipo }: { tipo: ItemMenuOrganizador['icono'] }) {
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
  return tipo === 'calendario' ? (
    <svg {...comun}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  ) : (
    <svg {...comun}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

/** Menú lateral (vertical) o barra de pestañas (horizontal, en móvil y tableta) */
export function OrganizadorNav({ horizontal = false }: { horizontal?: boolean }) {
  const ruta = usePathname()

  return (
    <nav className={horizontal ? 'flex gap-2 overflow-x-auto px-4 py-3' : 'flex flex-col gap-2 px-4 py-4'}>
      {MENU_ORGANIZADOR.map((item) => {
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
