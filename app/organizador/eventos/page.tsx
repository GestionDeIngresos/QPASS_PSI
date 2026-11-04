import type { Metadata } from 'next'
import Link from 'next/link'
import { EncabezadoPagina } from '@/components/organizador/EncabezadoPagina'
import { EventoCard } from '@/components/organizador/EventoCard'
import { exigirSesion } from '@/lib/organizador/auth'
import { listarMisEventos } from '@/lib/organizador/queries'

export const metadata: Metadata = { title: 'Mis Eventos · QPass' }

// ─── ZONA EDITABLE: mensajes que llegan por la URL (?ok=... / ?error=...) ───
const AVISOS: Record<string, string> = {
  eliminado: 'Evento eliminado.',
}
const ERRORES: Record<string, string> = {
  con_ventas: 'No se puede eliminar: el evento ya tiene entradas vendidas.',
  no_encontrado: 'No encontramos ese evento (quizá ya fue eliminado o no es tuyo).',
  no_editable: 'Ese evento no se puede editar en este momento.',
  fallo: 'No se pudo completar la acción. Inténtalo de nuevo.',
}
// ─────────────────────────────────────────────────────────────────

// /organizador/eventos → HU 21: Mis Eventos (lista · ver detalles · editar · eliminar)
export default async function MisEventosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { supabase, user } = await exigirSesion('/organizador/eventos')
  const params = await searchParams
  const aviso = typeof params.ok === 'string' ? AVISOS[params.ok] : undefined
  const error = typeof params.error === 'string' ? ERRORES[params.error] : undefined

  const eventos = await listarMisEventos(supabase, user.id)

  return (
    <div className="mx-auto w-full max-w-6xl">
      <EncabezadoPagina titulo="Mis Eventos" />

      {aviso && (
        <p role="status" className="mb-4 rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
          {error}
        </p>
      )}

      <h2 className="mb-4 text-lg font-bold text-white">Eventos activos:</h2>

      {eventos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-semibold text-white">Todavía no tienes eventos activos</p>
          <p className="mt-2 text-sm text-muted">
            Cuando un administrador apruebe una de tus solicitudes, tu evento aparecerá aquí.
          </p>
          <Link
            href="/organizador/solicitudes"
            className="mt-6 inline-block rounded-lg border border-border px-6 py-3 text-sm font-bold text-white transition hover:border-pink"
          >
            Ver mis solicitudes
          </Link>
        </div>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {eventos.map((e) => (
            <EventoCard key={e.id} evento={e} />
          ))}
        </ul>
      )}
    </div>
  )
}
