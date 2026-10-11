'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { comprarEntradas } from '@/app/eventos/[id]/comprar/actions'
import { ResumenEvento } from '@/components/compras/ResumenEvento'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MAX_LINEAS, TASA_CARGO_SERVICIO, calcularResumen, maximoPorLinea } from '@/lib/compras/calculo'
import type { ResultadoCompra } from '@/lib/compras/types'
import { formatearPrecio } from '@/lib/eventos/format'
import type { EventoDetalle } from '@/lib/eventos/types'

// ─── ZONA EDITABLE: rutas ────────────────────────────────────────
const RUTA_MIS_COMPRAS = '/mis-compras' // ajusta cuando exista la pantalla "Mis Compras"
// ─────────────────────────────────────────────────────────────────

type Linea = { clave: number; tipoTicketId: string; cantidad: number }
type CompraExitosa = Extract<ResultadoCompra, { ok: true }>

type Props = {
  evento: EventoDetalle
  /** true si el usuario llegó con "Comprar para otros" (?para=otros) */
  paraOtrosInicial: boolean
}

const claseSelect =
  'min-w-0 flex-1 basis-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-white outline-none transition [color-scheme:dark] focus:border-pink sm:basis-auto'
const claseBotonCantidad =
  'flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-bg text-lg text-white transition hover:border-pink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border'

export function CompraEntradas({ evento, paraOtrosInicial }: Props) {
  const tickets = evento.tickets
  const disponibles = tickets.filter((t) => t.cantidad_disponible > 0)

  const claveRef = useRef(1)
  const [lineas, setLineas] = useState<Linea[]>([
    { clave: 1, tipoTicketId: disponibles[0]?.id ?? '', cantidad: 1 },
  ])
  const [paraOtros, setParaOtros] = useState(paraOtrosInicial)
  const [correo, setCorreo] = useState('')
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null)
  const [exito, setExito] = useState<CompraExitosa | null>(null)
  const [pendiente, startTransition] = useTransition()

  const ticketDe = (id: string) => tickets.find((t) => t.id === id)
  const resumen = calcularResumen(lineas, tickets)
  const puedeAgregar = lineas.length < Math.min(MAX_LINEAS, disponibles.length)

  // ─── Edición de líneas ─────────────────────────────────────────
  function cambiarTipo(clave: number, tipoTicketId: string) {
    const ticket = ticketDe(tipoTicketId)
    const max = Math.max(ticket ? maximoPorLinea(ticket) : 1, 1)
    setLineas((ls) =>
      ls.map((l) => (l.clave === clave ? { ...l, tipoTicketId, cantidad: Math.min(l.cantidad, max) } : l))
    )
  }

  function cambiarCantidad(clave: number, delta: number) {
    setLineas((ls) =>
      ls.map((l) => {
        if (l.clave !== clave) return l
        const ticket = ticketDe(l.tipoTicketId)
        const max = Math.max(ticket ? maximoPorLinea(ticket) : 1, 1)
        return { ...l, cantidad: Math.min(Math.max(l.cantidad + delta, 1), max) }
      })
    )
  }

  function agregarLinea() {
    const usados = new Set(lineas.map((l) => l.tipoTicketId))
    const libre = disponibles.find((t) => !usados.has(t.id))
    if (!libre) return
    claveRef.current += 1
    const clave = claveRef.current
    setLineas((ls) => [...ls, { clave, tipoTicketId: libre.id, cantidad: 1 }])
  }

  function quitarLinea(clave: number) {
    setLineas((ls) => ls.filter((l) => l.clave !== clave))
  }

  // ─── Envío ─────────────────────────────────────────────────────
  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (pendiente) return
    setErrorGeneral(null)
    setErrorCorreo(null)

    startTransition(async () => {
      try {
        const r = await comprarEntradas({
          eventoId: evento.id,
          lineas: lineas.map(({ tipoTicketId, cantidad }) => ({ tipoTicketId, cantidad })),
          correoDestino: paraOtros ? correo : null,
        })
        if (r.ok) setExito(r)
        else if (r.campo === 'correo') setErrorCorreo(r.error)
        else setErrorGeneral(r.error)
      } catch {
        setErrorGeneral('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.')
      }
    })
  }

  // ─── Textos según el tipo de acceso y el modo ──────────────────
  const esFisico = evento.tipo_acceso === 'qr_fisico'
  const titulo = paraOtros ? 'Compra para otra persona' : 'Compra de entrada'
  const subtitulo = esFisico
    ? 'Selecciona el tipo de entrada y la cantidad. El QR físico se asignará y vinculará al momento de la recogida de la manilla.'
    : paraOtros
      ? 'Selecciona el tipo de entrada y la cantidad. El QR Digital se asignará al perfil de la persona destinataria.'
      : 'Selecciona el tipo de entrada y la cantidad. El QR Digital se asignará automáticamente a tu perfil después de la compra.'
  const textoBoton = esFisico ? 'Comprar y reservar manilla' : 'Comprar'

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-10 md:py-14">
      <Link
        href={`/eventos/${evento.id}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-white"
      >
        ← Volver al evento
      </Link>

      <h1 className="mb-8 text-3xl font-extrabold text-white md:text-4xl">
        {exito ? 'Compra realizada' : titulo}
      </h1>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <ResumenEvento evento={evento} />

        <section className="rounded-3xl border border-border bg-card p-6 shadow-[0_0_40px_rgba(255,0,122,0.12)] sm:p-10">
          {exito ? (
            <Confirmacion exito={exito} destinatario={paraOtros ? (exito.destinatario ?? correo) : null} />
          ) : (
            <form onSubmit={enviar}>
              <h2 className="text-2xl font-extrabold text-white">
                {paraOtros ? 'Información del destinatario' : 'Configura tu entrada'}
              </h2>
              <p className="mb-8 mt-2 text-sm leading-relaxed text-muted">{subtitulo}</p>

              {/* ── Para mí / para otra persona ── */}
              <div
                role="group"
                aria-label="¿Para quién es la entrada?"
                className="mb-8 grid grid-cols-2 gap-1 rounded-xl border border-border bg-bg p-1"
              >
                {[
                  { valor: false, texto: 'Para mí' },
                  { valor: true, texto: 'Para otra persona' },
                ].map((opcion) => (
                  <button
                    key={opcion.texto}
                    type="button"
                    aria-pressed={paraOtros === opcion.valor}
                    onClick={() => {
                      setParaOtros(opcion.valor)
                      setErrorCorreo(null)
                    }}
                    className={`rounded-lg py-2.5 text-xs font-bold uppercase tracking-wide transition sm:text-sm ${
                      paraOtros === opcion.valor
                        ? 'bg-pink text-white shadow-[0_0_20px_rgba(255,0,122,0.35)]'
                        : 'text-muted hover:text-white'
                    }`}
                  >
                    {opcion.texto}
                  </button>
                ))}
              </div>

              {/* ── Líneas: tipo + cantidad ── */}
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Entradas</p>
              <div className="space-y-4">
                {lineas.map((linea, i) => {
                  const ticket = ticketDe(linea.tipoTicketId)
                  const max = Math.max(ticket ? maximoPorLinea(ticket) : 1, 1)
                  const usadosPorOtras = new Set(
                    lineas.filter((l) => l.clave !== linea.clave).map((l) => l.tipoTicketId)
                  )

                  return (
                    <div key={linea.clave}>
                      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
                        <select
                          aria-label={`Tipo de entrada ${i + 1}`}
                          value={linea.tipoTicketId}
                          onChange={(e) => cambiarTipo(linea.clave, e.target.value)}
                          className={claseSelect}
                        >
                          {tickets.map((t) => (
                            <option
                              key={t.id}
                              value={t.id}
                              disabled={t.cantidad_disponible <= 0 || usadosPorOtras.has(t.id)}
                            >
                              {t.nombre} ({formatearPrecio(t.precio)})
                              {t.cantidad_disponible <= 0 ? ' · Agotado' : ''}
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-2 sm:gap-3">
                          <button
                            type="button"
                            aria-label="Quitar una entrada"
                            disabled={linea.cantidad <= 1}
                            onClick={() => cambiarCantidad(linea.clave, -1)}
                            className={claseBotonCantidad}
                          >
                            −
                          </button>
                          <output
                            aria-live="polite"
                            aria-label="Cantidad"
                            className="flex h-12 w-14 items-center justify-center rounded-xl border border-border bg-bg font-semibold text-white"
                          >
                            {linea.cantidad}
                          </output>
                          <button
                            type="button"
                            aria-label="Agregar una entrada"
                            disabled={linea.cantidad >= max}
                            onClick={() => cambiarCantidad(linea.clave, 1)}
                            className={`${claseBotonCantidad} text-pink`}
                          >
                            +
                          </button>
                          {lineas.length > 1 && (
                            <button
                              type="button"
                              aria-label="Quitar este tipo de entrada"
                              onClick={() => quitarLinea(linea.clave)}
                              className="ml-1 text-xl leading-none text-muted transition hover:text-white"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>

                      {linea.cantidad >= max && (
                        <p className="mt-1.5 text-xs text-amber-400">
                          {ticket?.limite_por_usuario != null && max === ticket.limite_por_usuario
                            ? `Máximo ${max} por persona para este tipo.`
                            : `Máximo disponible para este tipo: ${max}.`}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              {puedeAgregar && (
                <button
                  type="button"
                  onClick={agregarLinea}
                  className="mt-4 text-sm font-semibold text-pink transition hover:underline"
                >
                  + Agregar otro tipo de entrada
                </button>
              )}

              {/* ── Destinatario ── */}
              {paraOtros && (
                <div className="mt-8">
                  <Input
                    label="Correo del destinatario"
                    type="email"
                    name="correo"
                    placeholder="amigo@correo.com"
                    autoComplete="off"
                    value={correo}
                    onChange={(e) => {
                      setCorreo(e.target.value)
                      setErrorCorreo(null)
                    }}
                    required
                  />
                  {errorCorreo && (
                    <p role="alert" className="-mt-3 mb-2 text-sm text-red-400">
                      {errorCorreo}
                    </p>
                  )}
                </div>
              )}

              {/* ── Resumen de costos ── */}
              <dl className="mt-8 space-y-3 border-t border-border pt-6 text-sm">
                <div className="flex items-center justify-between gap-4 text-muted">
                  <dt>
                    Subtotal ({resumen.cantidadTotal} {resumen.cantidadTotal === 1 ? 'entrada' : 'entradas'})
                  </dt>
                  <dd className="text-white">{formatearPrecio(resumen.subtotal)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 text-muted">
                  <dt>Gastos de servicio ({Math.round(TASA_CARGO_SERVICIO * 100)} %)</dt>
                  <dd className="text-white">{formatearPrecio(resumen.cargos)}</dd>
                </div>
                <div className="flex items-end justify-between gap-4 border-t border-border pt-4">
                  <dt className="font-bold text-pink">Total</dt>
                  <dd className="text-3xl font-extrabold text-pink">{formatearPrecio(resumen.total)}</dd>
                </div>
              </dl>

              {errorGeneral && (
                <p role="alert" className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
                  {errorGeneral}
                </p>
              )}

              <Button type="submit" disabled={pendiente || disponibles.length === 0} className="mt-6">
                {pendiente ? 'Procesando pago...' : textoBoton}
              </Button>
              <p className="mt-3 text-center text-xs text-muted">
                Pago simulado: por ahora no se realiza ningún cobro real.
              </p>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}

// ─── Pantalla de éxito (reemplaza al formulario) ──────────────────
function Confirmacion({ exito, destinatario }: { exito: CompraExitosa; destinatario: string | null }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-cyan/10 text-cyan">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5 9-10" />
        </svg>
      </span>
      <h2 className="text-2xl font-extrabold text-white">¡Compra confirmada!</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        {exito.entradas === 1 ? 'Generamos 1 entrada' : `Generamos ${exito.entradas} entradas`}{' '}
        {destinatario ? (
          <>
            para <span className="font-semibold text-white">{destinatario}</span>.
          </>
        ) : (
          'en tu perfil.'
        )}
      </p>

      <dl className="mt-8 w-full max-w-sm space-y-3 border-t border-border pt-6 text-sm">
        <div className="flex justify-between text-muted">
          <dt>Subtotal</dt>
          <dd className="text-white">{formatearPrecio(exito.subtotal)}</dd>
        </div>
        <div className="flex justify-between text-muted">
          <dt>Gastos de servicio</dt>
          <dd className="text-white">{formatearPrecio(exito.cargos)}</dd>
        </div>
        <div className="flex items-end justify-between border-t border-border pt-4">
          <dt className="font-bold text-pink">Total</dt>
          <dd className="text-2xl font-extrabold text-pink">{formatearPrecio(exito.total)}</dd>
        </div>
      </dl>

      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <Link
          href={RUTA_MIS_COMPRAS}
          className="w-full rounded-lg bg-pink py-3 text-center text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_25px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
        >
          Ver mis compras
        </Link>
        <Link
          href="/eventos"
          className="w-full rounded-lg border border-border bg-bg py-3 text-center text-sm font-bold uppercase tracking-wide text-muted transition hover:text-white"
        >
          Volver a eventos
        </Link>
      </div>
    </div>
  )
}