import type { Metadata } from 'next'
import { EventCard } from '@/components/eventos/EventCard'
import { EventFilters } from '@/components/eventos/EventFilters'
import { buscarEventos, leerFiltros, listarCategorias } from '@/lib/eventos/queries'
import type { EventoResumen } from '@/lib/eventos/types'

export const metadata: Metadata = {
  title: 'Explorar eventos · QPass',
  description: 'Busca eventos por nombre, categoría o fecha y reserva tus tickets.',
}

// ════════════════════════════════════════════════════════════════
// /eventos  →  listado + búsqueda (Historia 1)
// Los filtros viajan por la URL: /eventos?q=neon&categoria=<id>&fecha=2026-10-14
// ════════════════════════════════════════════════════════════════
export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // 1) leer filtros de la URL
  const filtros = leerFiltros(await searchParams)

  // 2) pedir datos a Supabase (las categorías primero: validan el filtro de categoría)
  const categorias = await listarCategorias()
  const { proximos, pasados } = await buscarEventos(filtros, categorias)

  const hayFiltros = Boolean(filtros.q || filtros.categoriaId || filtros.fecha)
  const total = proximos.length + pasados.length

  // 3) pintar
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12 md:px-10">
      <header className="mb-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan">Live lineup</p>
        <h1 className="text-3xl font-extrabold text-white md:text-4xl">Explorar eventos</h1>
        <p className="mt-2 text-muted">
          Busca por nombre, categoría o fecha y reserva tus tickets.
        </p>
      </header>

      <EventFilters categorias={categorias} valores={filtros} />

      {hayFiltros && total > 0 && (
        <p className="mt-6 text-sm text-muted">
          {total} {total === 1 ? 'evento encontrado' : 'eventos encontrados'}
        </p>
      )}

      {total === 0 ? (
        <EstadoVacio hayFiltros={hayFiltros} />
      ) : (
        <>
          <SeccionEventos
            etiqueta="Próximamente"
            titulo="Próximos eventos"
            eventos={proximos}
          />
          <SeccionEventos
            etiqueta="Archivo"
            titulo="Eventos pasados"
            eventos={pasados}
          />
        </>
      )}
    </div>
  )
}

// ─── Sección con grilla responsiva (1 → 2 → 3 → 4 columnas) ──────
function SeccionEventos({
  etiqueta,
  titulo,
  eventos,
}: {
  etiqueta: string
  titulo: string
  eventos: EventoResumen[]
}) {
  if (eventos.length === 0) return null

  return (
    <section className="mt-12">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan">{etiqueta}</p>
      <h2 className="mb-6 text-2xl font-bold text-white md:text-3xl">{titulo}</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {eventos.map((evento) => (
          <EventCard key={evento.id} evento={evento} />
        ))}
      </div>
    </section>
  )
}

// ─── Mensaje cuando no hay resultados ────────────────────────────
function EstadoVacio({ hayFiltros }: { hayFiltros: boolean }) {
  return (
    <div className="mt-12 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <p className="text-lg font-semibold text-white">
        {hayFiltros ? 'No encontramos eventos con esos filtros' : 'Aún no hay eventos publicados'}
      </p>
      <p className="mt-2 text-sm text-muted">
        {hayFiltros
          ? 'Prueba con otro nombre, otra categoría u otra fecha.'
          : 'Vuelve pronto: estamos preparando nuevas experiencias.'}
      </p>
    </div>
  )
}
