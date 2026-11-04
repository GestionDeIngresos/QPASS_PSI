import { EventCard } from '@/components/eventos/EventCard'
import { Carrusel } from '@/components/landing/Carrusel'
import type { EventoResumen } from '@/lib/eventos/types'

/** Sección con título + carrusel de EventCard (se usa para Destacados y Pasados) */
export function SeccionEventos({
  id,
  etiqueta,
  colorEtiqueta = 'text-cyan',
  titulo,
  subtitulo,
  vacio,
  eventos,
  atenuados = false,
}: {
  id?: string
  etiqueta: string
  colorEtiqueta?: string
  titulo: string
  subtitulo: string
  vacio: string
  eventos: EventoResumen[]
  atenuados?: boolean
}) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-14 md:px-10">
      <p className={`mb-2 text-[11px] font-bold uppercase tracking-widest ${colorEtiqueta}`}>{etiqueta}</p>
      <h2 className="text-2xl font-extrabold text-white md:text-3xl">{titulo}</h2>
      <p className="mb-6 mt-2 text-sm text-muted">{subtitulo}</p>

      {eventos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted">{vacio}</p>
      ) : (
        <Carrusel etiqueta={titulo}>
          {eventos.map((e) => (
            <div
              key={e.id}
              className={`flex w-[17rem] shrink-0 snap-start flex-col sm:w-[19rem] [&>a]:flex-1 ${
                atenuados ? 'opacity-75 transition hover:opacity-100' : ''
              }`}
            >
              <EventCard evento={e} />
            </div>
          ))}
        </Carrusel>
      )}
    </section>
  )
}
