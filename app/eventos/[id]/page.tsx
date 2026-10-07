import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EventImage } from '@/components/eventos/EventImage'
import { TicketList } from '@/components/eventos/TicketList'
import { Button } from '@/components/ui/Button'
import { etiquetaAcceso, esUrlHttp, eventoFinalizado, formatearFecha } from '@/lib/eventos/format'
import { obtenerEvento } from '@/lib/eventos/queries'

// ─── ZONA EDITABLE: flujo de compra ──────────────────────────────
// La compra NO es parte de esta historia. Mientras el flujo no exista, los
// botones salen deshabilitados. Cuando esté listo: pon esto en true y cambia
// cada <button> por un <Link href={...}> hacia la ruta de compra.
const COMPRA_HABILITADA = true
// ─────────────────────────────────────────────────────────────────

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const evento = await obtenerEvento(id)
  if (!evento) return { title: 'Evento no encontrado · QPass' }
  return {
    title: `${evento.titulo} · QPass`,
    description: evento.descripcion?.slice(0, 160) ?? undefined,
  }
}

// ════════════════════════════════════════════════════════════════
// /eventos/[id]  →  detalle de evento (Historia 2)
// ════════════════════════════════════════════════════════════════
export default async function EventoDetallePage({ params }: Props) {
  const { id } = await params
  const evento = await obtenerEvento(id)
  if (!evento) notFound() // no existe, o no está publicado (RLS tampoco lo deja pasar)

  const finalizado = eventoFinalizado(evento.fecha_evento)
  const hayCupo = evento.tickets.some((t) => t.cantidad_disponible > 0)
  const compraDeshabilitada = !COMPRA_HABILITADA || !hayCupo

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 md:py-14">
      <Link
        href="/eventos"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-white"
      >
        ← Volver a eventos
      </Link>

      <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_0_40px_rgba(255,0,122,0.12)]">
        <EventImage
          id={evento.id}
          titulo={evento.titulo}
          fotoUrl={evento.foto_url}
          className="h-56 w-full sm:h-72"
        />

        <div className="space-y-6 p-6 sm:p-8">
          {/* ── Título + insignia ── */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{evento.titulo}</h1>
            {finalizado ? (
              <Insignia className="bg-white/10 text-muted">Finalizado</Insignia>
            ) : (
              evento.destacado_carrusel && <Insignia className="bg-pink text-white">Recomendado</Insignia>
            )}
          </div>

          {evento.categoria && (
            <p className="-mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {evento.categoria.nombre}
            </p>
          )}

          {/* ── Fecha y ubicación ── */}
          <ul className="space-y-3 text-sm text-white">
            <li className="flex items-center gap-3">
              <IconoCalendario />
              <span>{formatearFecha(evento.fecha_evento, { conAnio: true, conHora: true })}</span>
            </li>
            <li className="flex items-start gap-3">
              <IconoUbicacion />
              <span>
                {evento.ubicacion ?? 'Ubicación por confirmar'}
                <span className="text-muted"> · Tipo: {etiquetaAcceso(evento.tipo_acceso)}</span>
                {esUrlHttp(evento.mapa_url) && (
                  <>
                    {' · '}
                    <a
                      href={evento.mapa_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-cyan underline-offset-4 hover:underline"
                    >
                      Ver mapa
                    </a>
                  </>
                )}
              </span>
            </li>
          </ul>

          {/* ── Descripción ── */}
          <section className="border-t border-border pt-6">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-white">
              Sobre el evento
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
              {evento.descripcion ?? 'El organizador aún no agregó una descripción.'}
            </p>
          </section>

          {/* ── Tickets (se ocultan si el evento ya pasó, como en el mockup) ── */}
          {!finalizado && (
            <>
              <section className="border-t border-border pt-6">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-white">
                  Pases · {etiquetaAcceso(evento.tipo_acceso)}
                </h2>
                <TicketList tickets={evento.tickets} />
              </section>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/eventos/${evento.id}/comprar?para=otros`}
                  aria-disabled={compraDeshabilitada}
                  tabIndex={compraDeshabilitada ? -1 : undefined}
                  className={`w-full rounded-lg border border-border bg-bg py-3 text-center text-sm font-bold uppercase tracking-wide text-muted transition hover:text-white sm:w-2/5 ${
                    compraDeshabilitada ? 'pointer-events-none opacity-50' : ''
                  }`}
                >
                  Comprar para otros
                  </Link>
                  <Link
                    href={`/eventos/${evento.id}/comprar`}
                    aria-disabled={compraDeshabilitada}
                    tabIndex={compraDeshabilitada ? -1 : undefined}
                    className={`w-full rounded-lg bg-pink py-3 text-center font-bold uppercase tracking-wide text-white shadow-[0_0_25px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover sm:w-3/5 ${
                      compraDeshabilitada ? 'pointer-events-none opacity-50' : ''
                    }`}
                  >
                    Comprar entrada
                  </Link>
                </div>
            </>
          )}
        </div>
      </article>
    </div>
  )
}

// ─── Piezas pequeñas ─────────────────────────────────────────────
function Insignia({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  )
}

function IconoCalendario() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-cyan" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  )
}

function IconoUbicacion() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-cyan" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  )
}
