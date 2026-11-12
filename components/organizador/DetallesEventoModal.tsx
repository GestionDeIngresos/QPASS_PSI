'use client'

import { useRef } from 'react'
import { EventImage } from '@/components/eventos/EventImage'
import { formatearPrecio } from '@/lib/eventos/format'
import type { EstadisticasEvento } from '@/lib/organizador/types'

type Props = {
  id: string
  titulo: string
  fotoUrl: string | null
  fechaTexto: string // ya formateada: "Viernes, 24 Abr – Lunes, 03 May · 22:00 a 06:00"
  lugarTexto: string // "Phono Club · Tipo: QR Físico (Manilla)"
  estadisticas: EstadisticasEvento
}

/** Botón "Ver detalles" + ventana con las estadísticas del evento (HU 21). Usa <dialog> nativo. */
export function DetallesEventoModal({ id, titulo, fotoUrl, fechaTexto, lugarTexto, estadisticas: e }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  const filas: [string, string][] = [
    ['Usuarios en el evento', String(e.usuarios)],
    ['Entradas vendidas', String(e.entradasVendidas)],
    ['Ingreso de entradas', formatearPrecio(e.ingresoEntradas)],
    ['Ingreso de servicios', formatearPrecio(e.ingresoServicios)],
  ]

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="rounded-lg border border-border bg-bg px-4 py-2.5 text-sm font-bold text-white transition hover:border-pink"
      >
        Ver detalles
      </button>

      <dialog
        ref={ref}
        aria-label={`Detalles de ${titulo}`}
        // clic en el fondo oscuro (fuera de la tarjeta) cierra la ventana
        onClick={(ev) => {
          if (ev.target === ref.current) ref.current?.close()
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl border border-border bg-bg p-0 text-white shadow-[0_0_60px_rgba(255,0,122,0.2)] backdrop:bg-black/70"
      >
        <div className="relative">
          <EventImage id={id} titulo={titulo} fotoUrl={fotoUrl} className="h-40 w-full" />
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Cerrar"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-pink"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          <h3 className="text-2xl font-extrabold">{titulo}</h3>
          <p className="mt-4 flex items-start gap-3 text-sm">
            <span aria-hidden="true" className="text-cyan">▦</span>
            {fechaTexto}
          </p>
          <p className="mt-2 flex items-start gap-3 text-sm">
            <span aria-hidden="true" className="text-cyan">◉</span>
            {lugarTexto}
          </p>

          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2 grid grid-cols-[1.4fr_1fr] text-[11px] font-semibold text-muted">
              <span>Dato</span>
              <span>Monto</span>
            </div>
            <dl className="space-y-3 text-sm">
              {filas.map(([nombre, valor]) => (
                <div key={nombre} className="grid grid-cols-[1.4fr_1fr]">
                  <dt className="font-bold">{nombre}</dt>
                  <dd>{valor}</dd>
                </div>
              ))}
              <div className="grid grid-cols-[1.4fr_1fr] text-pink">
                <dt className="font-bold">Ingresos totales actuales</dt>
                <dd>{formatearPrecio(e.ingresoTotal)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </dialog>
    </>
  )
}
