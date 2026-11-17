'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { solicitarDevolucion } from './actions'

export type EventoDevolucion = {
  eventoId: number
  titulo: string
  fechaFin: string | null
  disponible: string
  venceEn: string | null
  habilitado: boolean
}

export type SolicitudDevolucion = {
  id: number
  eventoId: number
  evento: string
  monto: string
  estado: 'en_revision' | 'aprobada' | 'rechazada'
  creadoEn: string
  urlFirmada?: string
}

const BADGE_SOLICITUD: Record<SolicitudDevolucion['estado'], { texto: string; clase: string }> = {
  en_revision: { texto: 'En revisión', clase: 'border-yellow-400 text-yellow-400' },
  aprobada:    { texto: 'Aprobada',    clase: 'border-green-400 text-green-400' },
  rechazada:   { texto: 'Rechazada',   clase: 'border-pink/70 text-pink' },
}

function estadoEvento(e: EventoDevolucion): { texto: string; clase: string } {
  if (e.habilitado) {
    return { texto: 'Disponible para reclamo', clase: 'border-green-400 text-green-400' }
  }
  const ahora = Date.now()
  if (!e.fechaFin || new Date(e.fechaFin).getTime() > ahora) {
    return { texto: 'Evento en curso', clase: 'border-cyan text-cyan' }
  }
  if (e.venceEn === null) {
    return { texto: 'Plazo no configurado', clase: 'border-yellow-400/70 text-yellow-400' }
  }
  return { texto: 'Plazo vencido', clase: 'border-muted/60 text-muted' }
}

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleString('es-BO', {
    timeZone: 'America/La_Paz',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function IconoSubir() {
  return (
    <svg
      className="mx-auto mb-3 h-10 w-10 text-muted"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
      />
    </svg>
  )
}

function ZonaQR({
  preview,
  onEliminar,
  onSeleccionar,
}: {
  preview: string | null
  onEliminar: () => void
  onSeleccionar: (file: File) => void
}) {
  const [arrastrado, setArrastrado] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  function validar(file: File): boolean {
    return (
      ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size <= 5242880
    )
  }

  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onSeleccionar(f)
          e.target.value = ''
        }}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Zona para subir el QR bancario. Haz clic o arrastra la imagen."
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition focus:outline-none focus:ring-2 focus:ring-pink ${
          arrastrado
            ? 'border-pink bg-pink/10'
            : 'border-border bg-bg/50 hover:border-pink/50'
        }`}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') ref.current?.click() }}
        onDragOver={(e) => { e.preventDefault(); setArrastrado(true) }}
        onDragLeave={() => setArrastrado(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastrado(false)
          const file = e.dataTransfer.files[0]
          if (file && validar(file)) onSeleccionar(file)
        }}
      >
        {preview ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Vista previa del QR bancario seleccionado"
              className="mx-auto max-h-48 rounded-lg object-contain"
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEliminar() }}
              className="text-xs text-muted transition hover:text-white"
            >
              Cambiar imagen
            </button>
          </div>
        ) : (
          <>
            <IconoSubir />
            <p className="text-sm font-semibold text-white">Arrastra tu QR aquí o haz clic</p>
            <p className="mt-1 text-xs text-muted">PNG, JPG o WEBP · máximo 5 MB</p>
          </>
        )}
      </div>
    </div>
  )
}

export function DevolucionesCliente({
  eventos,
  solicitudes,
}: {
  eventos: EventoDevolucion[]
  solicitudes: SolicitudDevolucion[]
}) {
  const [modal, setModal] = useState<EventoDevolucion | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  const eventosPendientes = new Set(
    solicitudes
      .filter((s) => s.estado === 'en_revision' || s.estado === 'aprobada')
      .map((s) => s.eventoId)
  )

  // Revocar blob URL al cambiar la preview
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])

  // Cerrar modal con Escape
  useEffect(() => {
    if (!modal) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal])

  function abrir(ev: EventoDevolucion) {
    setModal(ev)
    setSelectedFile(null)
    setPreview(null)
    setLocalError(null)
  }

  function cerrar() {
    if (pendiente) return
    setModal(null)
    setSelectedFile(null)
    setPreview(null)
    setLocalError(null)
  }

  function seleccionar(file: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5242880) {
      setLocalError('Usa una imagen PNG, JPG o WEBP de hasta 5 MB.')
      return
    }
    setLocalError(null)
    setSelectedFile(file)
    setPreview(URL.createObjectURL(file))
  }

  function eliminarArchivo() {
    setSelectedFile(null)
    setPreview(null)
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedFile) {
      setLocalError('Selecciona una imagen del QR bancario.')
      return
    }
    const fd = new FormData(e.currentTarget) // incluye el input hidden eventoId
    fd.set('archivo', selectedFile, selectedFile.name)
    setLocalError(null)
    startTransition(async () => {
      const r = await solicitarDevolucion(fd)
      if (r?.ok) {
        setModal(null)
        setSelectedFile(null)
        setPreview(null)
        setExito('Solicitud enviada. Puedes revisar el estado en "Mis solicitudes".')
        setTimeout(() => setExito(null), 8000)
      } else if (r?.error) {
        setLocalError(r.error)
      }
    })
  }

  return (
    <>
      {exito && (
        <p role="status" className="mb-5 rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          {exito}
        </p>
      )}

      {/* Lista de eventos */}
      {eventos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-semibold text-white">No tienes saldo registrado en ningún evento.</p>
          <p className="mt-2 text-sm text-muted">
            Cuando participes en un evento con saldo, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {eventos.map((ev) => {
            const badge = estadoEvento(ev)
            const deshabilitado =
              !ev.habilitado ||
              Number(ev.disponible) <= 0 ||
              eventosPendientes.has(ev.eventoId)
            return (
              <div
                key={ev.eventoId}
                className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_0_30px_rgba(157,0,255,0.06)]"
              >
                <p className="line-clamp-2 font-bold text-white">{ev.titulo}</p>
                <p className="mt-2 text-sm text-muted">
                  Saldo:{' '}
                  <span className="font-semibold text-white">{ev.disponible} pts.</span>
                </p>
                <div className="mt-3 flex flex-1 flex-col justify-between gap-4">
                  <span
                    className={`inline-block self-start rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${badge.clase}`}
                  >
                    {badge.texto}
                  </span>
                  <button
                    type="button"
                    disabled={deshabilitado}
                    onClick={() => abrir(ev)}
                    className="rounded-lg bg-pink px-4 py-2 text-xs font-bold text-white shadow-[0_0_16px_rgba(255,0,122,0.3)] transition hover:bg-pink-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Solicitar Reclamo
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Mis solicitudes */}
      {solicitudes.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold text-white">Mis solicitudes</h2>

          {/* Escritorio: tabla */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-[0_0_40px_rgba(157,0,255,0.06)] md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 font-semibold">Evento</th>
                  <th className="px-4 py-3 font-semibold">Monto</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 text-right font-semibold">QR</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((s) => {
                  const badge = BADGE_SOLICITUD[s.estado]
                  return (
                    <tr key={s.id} className="border-b border-border/60 last:border-0">
                      <td className="max-w-48 truncate px-4 py-3 font-semibold text-white">
                        {s.evento}
                      </td>
                      <td className="px-4 py-3 text-white">{s.monto} pts.</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${badge.clase}`}
                        >
                          {badge.texto}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{formatearFecha(s.creadoEn)}</td>
                      <td className="px-4 py-3 text-right">
                        {s.urlFirmada ? (
                          <a
                            href={s.urlFirmada}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md bg-cyan/10 px-3 py-1.5 text-[11px] font-bold text-cyan transition hover:bg-cyan/20"
                          >
                            Ver QR
                          </a>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas */}
          <ul className="space-y-3 md:hidden">
            {solicitudes.map((s) => {
              const badge = BADGE_SOLICITUD[s.estado]
              return (
                <li key={s.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate font-bold text-white">{s.evento}</p>
                    <span
                      className={`shrink-0 inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${badge.clase}`}
                    >
                      {badge.texto}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white">{s.monto} pts.</p>
                  <p className="text-xs text-muted">{formatearFecha(s.creadoEn)}</p>
                  {s.urlFirmada && (
                    <div className="mt-3">
                      <a
                        href={s.urlFirmada}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-cyan/10 px-3 py-1.5 text-[11px] font-bold text-cyan transition hover:bg-cyan/20"
                      >
                        Ver QR
                      </a>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Modal de solicitud */}
      {modal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-titulo-solicitud"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={cerrar}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-[0_0_60px_rgba(255,0,122,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="modal-titulo-solicitud"
              className="mb-1 text-lg font-extrabold text-white"
            >
              Solicitar Reclamo de Puntos
            </h2>
            <p className="mb-5 text-sm text-muted">
              Sube la foto del código QR de tu cuenta para procesar la devolución.
            </p>

            {/* Resumen del evento */}
            <div className="mb-5 rounded-xl border border-border bg-bg/60 px-4 py-3">
              <p className="font-semibold text-white">{modal.titulo}</p>
              <p className="mt-0.5 text-sm text-muted">
                Saldo a reclamar:{' '}
                <span className="font-bold text-white">{modal.disponible} pts.</span>
              </p>
            </div>

            <form onSubmit={enviar} className="space-y-4">
              <input type="hidden" name="eventoId" value={modal.eventoId} />

              <ZonaQR
                preview={preview}
                onEliminar={eliminarArchivo}
                onSeleccionar={seleccionar}
              />

              {localError && (
                <p role="alert" className="text-sm text-pink">
                  {localError}
                </p>
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="submit"
                  disabled={!selectedFile || pendiente}
                  aria-busy={pendiente}
                  className="rounded-lg bg-pink px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pendiente ? 'Enviando…' : 'Enviar Solicitud'}
                </button>
                <button
                  type="button"
                  onClick={cerrar}
                  disabled={pendiente}
                  className="rounded-lg border border-border px-6 py-2.5 text-sm font-semibold text-muted transition hover:border-white/30 hover:text-white disabled:opacity-40"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
