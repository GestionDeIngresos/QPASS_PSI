import type { Metadata } from 'next'
import Form from 'next/form'
import { redirect } from 'next/navigation'
import { obtenerSesionActual } from '@/lib/auth/sesion'
import {
  DevolucionesCliente,
  type EventoDevolucion,
  type SolicitudDevolucion,
} from './DevolucionesCliente'

export const metadata: Metadata = { title: 'Mis Devoluciones · QPass' }

const INPUT_DATE =
  'rounded-lg border border-border bg-bg px-3 py-2 text-xs font-semibold text-white outline-none transition focus:border-pink [color-scheme:dark]'

// /mi-cuenta/devoluciones → HU 17: consultar saldo y solicitar devolución virtual
export default async function DevolucionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const sesion = await obtenerSesionActual()
  if (!sesion) redirect('/login?next=/mi-cuenta/devoluciones')

  const q = typeof params.q === 'string' ? params.q.trim() : ''
  const desde =
    typeof params.desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.desde)
      ? params.desde
      : ''
  const hasta =
    typeof params.hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.hasta)
      ? params.hasta
      : ''

  const [eventosResult, solicitudesResult] = await Promise.all([
    sesion.supabase.rpc('devc_eventos_devolucion_cliente'),
    sesion.supabase.rpc('devc_mis_solicitudes_devolucion'),
  ])

  let eventos = (eventosResult.data ?? []) as EventoDevolucion[]
  const solicitudesRaw = (solicitudesResult.data ?? []) as SolicitudDevolucion[]

  // Filtros aplicados en el servidor sobre el resultado de la RPC
  if (q) {
    const ql = q.toLowerCase()
    eventos = eventos.filter((e) => e.titulo.toLowerCase().includes(ql))
  }
  if (desde) {
    const fi = new Date(desde)
    eventos = eventos.filter((e) => !e.fechaFin || new Date(e.fechaFin) >= fi)
  }
  if (hasta) {
    const ff = new Date(hasta + 'T23:59:59')
    eventos = eventos.filter((e) => e.fechaFin != null && new Date(e.fechaFin) <= ff)
  }

  // Generar URLs firmadas de 300 s para los QR de solicitudes (patrón de Dev A)
  const rutas = solicitudesRaw.map((s) => s.qrRuta).filter(Boolean)
  const firmadas = rutas.length
    ? await sesion.supabase.storage.from('devoluciones').createSignedUrls(rutas, 300)
    : null
  const urlsMap = new Map(firmadas?.data?.map((v) => [v.path, v.signedUrl]) ?? [])

  const solicitudes: SolicitudDevolucion[] = solicitudesRaw.map((s) => ({
    ...s,
    urlFirmada: s.qrRuta ? (urlsMap.get(s.qrRuta) ?? undefined) : undefined,
  }))

  return (
    <div className="min-h-screen bg-[#05050A] px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-extrabold text-white">Mis Devoluciones</h1>
        <p className="mt-2 text-sm text-muted">
          Consulta tus puntos por evento y solicita la devolución de tu saldo restante.
        </p>

        {/* Aviso de modo de prueba */}
        <div className="mt-5 rounded-lg border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-sm font-medium text-yellow-300">
          Modo de prueba: no se realizan transferencias de dinero reales.
        </div>

        {/* Filtros con next/form */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <Form
            action="/mi-cuenta/devoluciones"
            className="flex flex-wrap items-center gap-3"
          >
            <input
              name="q"
              type="search"
              defaultValue={q}
              maxLength={120}
              placeholder="Buscar por nombre de evento…"
              aria-label="Buscar evento"
              className="min-w-0 flex-1 basis-48 rounded-lg border border-border bg-bg px-4 py-2 text-sm text-white outline-none placeholder:text-muted/60 focus:border-pink"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Fecha fin:</span>
              <input
                name="desde"
                type="date"
                defaultValue={desde}
                aria-label="Desde"
                className={INPUT_DATE}
              />
              <span className="text-xs text-muted">—</span>
              <input
                name="hasta"
                type="date"
                defaultValue={hasta}
                aria-label="Hasta"
                className={INPUT_DATE}
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-cyan px-5 py-2 text-xs font-bold text-cyan transition hover:bg-cyan/10"
            >
              Filtrar
            </button>
            {(q || desde || hasta) && (
              <a
                href="/mi-cuenta/devoluciones"
                className="text-xs text-muted transition hover:text-white"
              >
                Limpiar
              </a>
            )}
          </Form>
        </div>

        <div className="mt-6">
          <DevolucionesCliente eventos={eventos} solicitudes={solicitudes} />
        </div>
      </div>
    </div>
  )
}
