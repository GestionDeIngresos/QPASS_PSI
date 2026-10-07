import { EventImage } from '@/components/eventos/EventImage'
import { esUrlHttp, formatearFecha } from '@/lib/eventos/format'
import type { EventoDetalle } from '@/lib/eventos/types'

/** Tarjeta izquierda del mockup: foto, insignia, título, descripción, fecha, lugar y mapa */
export function ResumenEvento({ evento }: { evento: EventoDetalle }) {
  return (
    <aside className="rounded-3xl border border-border bg-card p-5 shadow-[0_0_40px_rgba(255,0,122,0.12)] sm:p-6">
      <EventImage
        id={evento.id}
        titulo={evento.titulo}
        fotoUrl={evento.foto_url}
        className="mb-5 h-44 w-full rounded-2xl sm:h-56"
      />

      {evento.destacado_carrusel && (
        <span className="mb-3 inline-block rounded-full border border-pink px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pink">
          Recomendado
        </span>
      )}

      <h2 className="text-2xl font-extrabold text-white">{evento.titulo}</h2>

      {evento.descripcion && (
        <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-muted">
          {evento.descripcion}
        </p>
      )}

      <ul className="mt-5 space-y-3 border-t border-border pt-5 text-xs text-white">
        <li className="flex items-center gap-3">
          <IconoCalendario />
          <span>{formatearFecha(evento.fecha_evento, { conAnio: true, conHora: true })}</span>
        </li>
        <li className="flex items-center gap-3">
          <IconoUbicacion />
          <span>{evento.ubicacion ?? 'Ubicación por confirmar'}</span>
        </li>
      </ul>

      {esUrlHttp(evento.mapa_url) && (
        <a
          href={evento.mapa_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 block w-full rounded-lg bg-pink py-3 text-center text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_25px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
        >
          Ver mapa
        </a>
      )}
    </aside>
  )
}

// Mismos íconos que app/eventos/[id]/page.tsx (allí son privados al archivo)
function IconoCalendario() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-cyan" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  )
}

function IconoUbicacion() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-cyan" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  )
}