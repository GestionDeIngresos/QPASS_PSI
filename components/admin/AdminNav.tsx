'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MENU_ADMIN } from '@/components/admin/menu'

export function AdminNav({ horizontal = false }: { horizontal?: boolean }) {
  const ruta = usePathname()

  return (
    <nav className={horizontal ? 'flex gap-2 overflow-x-auto px-4 py-3' : 'flex flex-col gap-1 px-4 py-4'}>
      {MENU_ADMIN.map((item) => {
        const base = `whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
          horizontal ? '' : 'w-full'
        }`
        if (!item.activo) {
          return (
            <span key={item.href} className={`${base} cursor-not-allowed border-transparent text-muted/50`}>
              {item.etiqueta}
            </span>
          )
        }
        const actual = ruta === item.href || ruta.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${base} ${
              actual
                ? 'border-[#9D00FF] bg-[#2B0B57] text-white'
                : 'border-transparent text-muted hover:bg-white/5 hover:text-white'
            }`}
          >
            {item.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
