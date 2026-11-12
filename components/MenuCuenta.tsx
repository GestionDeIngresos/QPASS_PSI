'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CerrarSesionButton } from '@/components/CerrarSesionButton'

export type PerfilMenu = { nombre: string; correo: string; rol: string }

// ─── ZONA EDITABLE: enlaces según el rol (HU 5) ──────────────────
// /admin es de Dev A; /organizador/* es de Dev B.
const ENLACES_POR_ROL: Record<string, { href: string; etiqueta: string }[]> = {
  admin: [{ href: '/admin', etiqueta: 'Panel de administración' }],
  organizador: [
    { href: '/organizador/solicitudes', etiqueta: 'Mis solicitudes de evento' },
    { href: '/organizador/eventos', etiqueta: 'Mis eventos' },
  ],
}
const ENLACES_COMUNES = [
  { href: '/', etiqueta: 'Inicio' },
  { href: '/eventos', etiqueta: 'Explorar eventos' },
  { href: '/mis-compras', etiqueta: 'Mis compras' },
  { href: '/mi-cuenta/perfil', etiqueta: 'Editar perfil' },
]
// ─────────────────────────────────────────────────────────────────

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?'

export function Avatar({ nombre, grande = false }: { nombre: string; grande?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-white font-bold text-bg ${
        grande ? 'h-16 w-16 text-xl' : 'h-6 w-6 text-[10px]'
      }`}
    >
      {iniciales(nombre)}
    </span>
  )
}

// Menú "Mi Cuenta" del Header (HU 5): perfil, enlaces por rol, editar perfil y cerrar sesión
export function MenuCuenta({ perfil }: { perfil: PerfilMenu }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape)
    }
  }, [abierto])

  const enlaces = [...(ENLACES_POR_ROL[perfil.rol] ?? []), ...ENLACES_COMUNES]
  const cerrar = () => setAbierto(false)

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
          abierto ? 'border-[#9D00FF] text-pink' : 'border-transparent bg-white/5 text-white hover:text-pink'
        }`}
      >
        <Avatar nombre={perfil.nombre} />
        Mi Cuenta
      </button>

      {abierto && (
        <div
          className="absolute right-0 z-50 mt-3 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-5 text-center shadow-[0_0_40px_rgba(255,0,122,0.18)]"
        >
          <div className="flex justify-center">
            <Avatar nombre={perfil.nombre} grande />
          </div>
          <p className="mt-3 truncate text-lg font-bold text-white">{perfil.nombre || 'Mi cuenta'}</p>
          <p className="truncate text-xs text-muted">{perfil.correo}</p>

          <nav className="mt-4 flex flex-col gap-2">
            {enlaces.map((e) => (
              <Link
                key={e.href}
                href={e.href}
                onClick={cerrar}
                className={`rounded-lg px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition ${
                  e.href === '/mi-cuenta/perfil'
                    ? 'bg-pink text-white hover:bg-pink-hover'
                    : 'border border-border text-white hover:border-[#9D00FF] hover:bg-[#2B0B57]'
                }`}
              >
                {e.etiqueta}
              </Link>
            ))}
          </nav>

          <CerrarSesionButton className="mt-4 text-xs font-semibold text-pink hover:underline disabled:opacity-50" />
        </div>
      )}
    </div>
  )
}
