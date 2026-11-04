import type { Metadata } from 'next'
import Link from 'next/link'
import { EncabezadoPagina } from '@/components/organizador/EncabezadoPagina'
import { SolicitudItem } from '@/components/organizador/SolicitudItem'
import { exigirSesion } from '@/lib/organizador/auth'
import { listarMisSolicitudes } from '@/lib/organizador/queries'

export const metadata: Metadata = { title: 'Mis Solicitudes · QPass' }

// /organizador/solicitudes → HU 19: estado de mis solicitudes de evento
export default async function MisSolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { supabase, user } = await exigirSesion('/organizador/solicitudes')
  const params = await searchParams
  const enviada = params.ok === 'enviada'

  const solicitudes = await listarMisSolicitudes(supabase, user.id)

  return (
    <div className="mx-auto w-full max-w-5xl">
      <EncabezadoPagina titulo="Mis Solicitudes" />

      {enviada && (
        <p role="status" className="mb-4 rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          Solicitud enviada. Un administrador la revisará.
        </p>
      )}

      <h2 className="mb-4 text-lg font-bold text-white">Estado de las solicitudes:</h2>

      {solicitudes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-semibold text-white">Aún no has enviado ninguna solicitud</p>
          <p className="mt-2 text-sm text-muted">Pide crear tu primer evento y un administrador lo revisará.</p>
          <Link
            href="/organizador/solicitudes/nueva"
            className="mt-6 inline-block rounded-lg bg-pink px-6 py-3 text-sm font-bold text-white transition hover:bg-pink-hover"
          >
            Solicitar crear evento
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {solicitudes.map((s) => (
            <SolicitudItem key={s.id} s={s} />
          ))}
        </ul>
      )}
    </div>
  )
}
