import Link from 'next/link'

// Se muestra cuando el evento no existe o no está publicado
export default function EventoNoEncontrado() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 py-24 text-center">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan">Error 404</p>
      <h1 className="mb-3 text-2xl font-extrabold text-white">Evento no encontrado</h1>
      <p className="mb-8 text-sm text-muted">
        El evento que buscas no existe o ya no está disponible.
      </p>
      <Link
        href="/eventos"
        className="rounded-lg bg-pink px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_25px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
      >
        Ver todos los eventos
      </Link>
    </div>
  )
}
