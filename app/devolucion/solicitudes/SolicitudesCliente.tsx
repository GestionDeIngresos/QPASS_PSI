'use client'

import { useEffect, useState, useTransition } from 'react'
import { aceptarSolicitud } from './actions'

export type SolicitudEncargado = {
  id: number
  solicitante: string
  correo: string
  monto: string
  creadoEn: string
  eventoId: number
  eventoTitulo: string
  urlFirmada?: string
}

type MensajeAccion = { solicitudId: number; texto: string }

export function SolicitudesCliente({
  solicitudes,
  sinEventos,
}: {
  solicitudes: SolicitudEncargado[]
  sinEventos: boolean
}) {
  const [modal, setModal] = useState<SolicitudEncargado | null>(null)
  const [mensajeAccion, setMensajeAccion] = useState<MensajeAccion | null>(null)
  const [pendiente, startTransition] = useTransition()
  const [aceptandoId, setAceptandoId] = useState<number | null>(null)

  useEffect(() => {
    if (!modal) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [modal])

  function aceptar(s: SolicitudEncargado) {
    setAceptandoId(s.id)
    setMensajeAccion(null)
    startTransition(async () => {
      const r = await aceptarSolicitud(s.id)
      setMensajeAccion({ solicitudId: s.id, texto: r.error })
      setAceptandoId(null)
    })
  }

  if (sinEventos) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
        <p className="font-semibold text-white">No tienes eventos asignados.</p>
        <p className="mt-2 text-sm text-muted">
          Cuando se te asigne un evento como encargado de devoluciones, aparecerá aquí.
        </p>
      </div>
    )
  }

  if (solicitudes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
        <p className="font-semibold text-white">No hay solicitudes pendientes.</p>
        <p className="mt-2 text-sm text-muted">
          Las solicitudes en revisión de tus eventos aparecerán aquí.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {solicitudes.map((s) => {
          const esPendiente = pendiente && aceptandoId === s.id
          return (
            <div
              key={s.id}
              className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_0_30px_rgba(157,0,255,0.06)]"
            >
              <p className="line-clamp-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {s.eventoTitulo}
              </p>
              <p className="mt-2 text-xl font-extrabold text-pink">{s.monto} pts.</p>
              <p className="mt-1 text-sm text-muted">
                Solicitado por:{' '}
                <span className="font-semibold text-white">{s.correo}</span>
              </p>

              {mensajeAccion?.solicitudId === s.id && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-yellow-400/40 bg-yellow-400/10 px-3 py-2 text-xs text-yellow-300"
                >
                  {mensajeAccion.texto}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setModal(s)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-white transition hover:border-pink/50 hover:text-pink"
                >
                  Ver QR Bancario
                </button>
                <button
                  type="button"
                  disabled={esPendiente}
                  aria-busy={esPendiente}
                  onClick={() => aceptar(s)}
                  className="rounded-lg bg-pink px-4 py-2 text-xs font-bold text-white shadow-[0_0_16px_rgba(255,0,122,0.3)] transition hover:bg-pink-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {esPendiente ? 'Procesando…' : 'Aceptar Solicitud'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal QR */}
      {modal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-qr-titulo"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[0_0_60px_rgba(255,0,122,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="modal-qr-titulo"
              className="mb-1 text-lg font-extrabold text-white"
            >
              QR Bancario del Usuario
            </h2>
            <p className="mb-4 text-sm text-muted">
              Escanea este código para procesar la devolución.
            </p>

            <div className="mb-4 rounded-xl border border-border bg-bg/60 px-4 py-3 text-sm">
              <p className="text-muted">
                Solicitado por:{' '}
                <span className="font-semibold text-white">{modal.correo}</span>
              </p>
              <p className="mt-0.5 text-muted">
                Monto:{' '}
                <span className="font-bold text-pink">{modal.monto} pts.</span>
              </p>
            </div>

            <div className="mb-5 overflow-hidden rounded-xl border border-border bg-white p-2">
              {modal.urlFirmada ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={modal.urlFirmada}
                  alt={`QR bancario de ${modal.correo}`}
                  className="mx-auto max-h-64 w-full object-contain"
                />
              ) : (
                <p className="py-10 text-center text-sm text-muted">
                  No se pudo cargar la imagen del QR.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setModal(null)}
              className="w-full rounded-lg border border-border py-2.5 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/5"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
