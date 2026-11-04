import Link from 'next/link'

/** Título de la página + botón "Solicitar crear evento" (como en el mockup) */
export function EncabezadoPagina({ titulo, mostrarSolicitar = true }: { titulo: string; mostrarSolicitar?: boolean }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <h1 className="text-3xl font-extrabold text-white">{titulo}</h1>
      {mostrarSolicitar && (
        <div className="flex flex-col items-center">
          <span className="mb-1 text-[10px] text-muted">(Sujeto a aprobación del admin)</span>
          <Link
            href="/organizador/solicitudes/nueva"
            className="rounded-lg bg-pink px-6 py-3 text-sm font-bold text-white shadow-[0_0_25px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
          >
            Solicitar crear evento
          </Link>
        </div>
      )}
    </div>
  )
}
