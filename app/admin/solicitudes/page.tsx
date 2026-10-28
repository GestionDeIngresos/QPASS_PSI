import type { Metadata } from 'next'
import { SolicitudFila } from '@/components/admin/SolicitudFila'
import { listarSolicitudes } from '@/lib/admin/solicitudes'

export const metadata: Metadata = { title: 'Solicitudes de eventos · Admin · QPass' }

const ERRORES: Record<string, string> = {
  no_pendiente: 'Esa solicitud ya fue resuelta.',
  fallo: 'No se pudo completar la acción. Intenta de nuevo.',
  con_ventas: 'No se puede eliminar: el evento ya tiene ventas asociadas.',
  no_aprobada: 'Primero debes aceptar la solicitud para poder configurar el evento.',
}

// /admin/solicitudes → HU 30: revisar solicitudes de creación de evento
export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const q = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 80)
  const codigoError = typeof params.error === 'string' ? params.error : ''
  const solicitudes = await listarSolicitudes(q)

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="mb-6 text-3xl font-extrabold text-white">Solicitudes de Creación de Evento</h1>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_0_40px_rgba(255,0,122,0.08)] md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Solicitudes entrantes</h2>
          <form action="/admin/solicitudes" method="get">
            <input
              name="q"
              type="search"
              defaultValue={q}
              maxLength={80}
              placeholder="Buscar solicitudes..."
              className="w-64 rounded-full border border-border bg-bg px-4 py-2 text-sm text-white outline-none placeholder:text-muted/60 focus:border-pink"
            />
          </form>
        </div>

        {ERRORES[codigoError] && (
          <p role="alert" className="mb-4 rounded-lg border border-pink/50 bg-pink/10 px-4 py-3 text-sm text-pink">
            {ERRORES[codigoError]}
          </p>
        )}

        {solicitudes.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {q ? 'No hay solicitudes que coincidan con tu búsqueda.' : 'Todavía no hay solicitudes.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {solicitudes.map((s) => (
              <SolicitudFila key={s.id} s={s} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
