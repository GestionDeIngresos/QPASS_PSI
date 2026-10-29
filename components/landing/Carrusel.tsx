'use client'

import { useRef } from 'react'

/** Fila horizontal con flechas (en móvil también se desliza con el dedo) */
export function Carrusel({ children, etiqueta }: { children: React.ReactNode; etiqueta: string }) {
  const pista = useRef<HTMLDivElement>(null)
  const mover = (dir: 1 | -1) => {
    const el = pista.current
    if (el) el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.8), behavior: 'smooth' })
  }
  const flecha =
    'absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-cyan shadow-lg transition hover:border-cyan sm:flex'

  return (
    <div className="relative" role="region" aria-label={etiqueta}>
      <button type="button" aria-label="Anterior" onClick={() => mover(-1)} className={`${flecha} -left-4`}>
        ‹
      </button>
      <div
        ref={pista}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <button type="button" aria-label="Siguiente" onClick={() => mover(1)} className={`${flecha} -right-4`}>
        ›
      </button>
    </div>
  )
}
