import Link from 'next/link'
import { EventImage } from '@/components/eventos/EventImage'
import { formatearFecha } from '@/lib/eventos/format'
import type { EventoResumen } from '@/lib/eventos/types'

/** Tarjeta de evento del listado (toda la tarjeta es un enlace al detalle) */
export function EventCard({ evento }: { evento: EventoResumen }) {
  return (
    <Link
      href={`/eventos/${evento.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-1 hover:border-pink/60 hover:shadow-[0_0_30px_rgba(255,0,122,0.18)]"
    >
      <EventImage
        id={evento.id}
        titulo={evento.titulo}
        fotoUrl={evento.foto_url}
        className="h-40 w-full"
      />

      <div className="flex flex-1 flex-col p-5">
        <p className="mb-1 text-[11px] font-bold text-cyan">
          {formatearFecha(evento.fecha_evento, { conHora: true })}
        </p>
        <h3 className="text-lg font-bold text-white">{evento.titulo}</h3>
        <p className="mt-1 text-sm text-muted">{evento.ubicacion ?? 'Ubicación por confirmar'}</p>

        {evento.categoria && (
          <span className="mt-3 w-fit rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {evento.categoria.nombre}
          </span>
        )}

        <div className="mt-auto pt-4">
          <div className="flex items-center justify-between border-t border-border pt-3 text-xs font-bold text-pink">
          <span>Click → Detalles del evento</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 transition group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          </div>
        </div>
      </div>
    </Link>
  )
}
