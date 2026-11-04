import Link from 'next/link'
import { EventImage } from '@/components/eventos/EventImage'
import type { EventoResumen } from '@/lib/eventos/types'

export function Hero({ destacado }: { destacado: EventoResumen | null }) {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:px-10 md:py-24">
      <div>
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
          Eventos confiables y fáciles de manejar
        </p>
        <h1 className="text-4xl font-extrabold leading-tight text-white md:text-5xl">
          Tu diversión <span className="text-pink">empieza</span> aquí
        </h1>
        <p className="mt-4 max-w-md text-sm text-muted">
          QPass es el pase definitivo a los mejores eventos. Consigue entradas seguras y gestiona tus eventos sin
          complicaciones.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/eventos"
            className="rounded-lg bg-pink px-6 py-3 text-sm font-bold text-white shadow-[0_0_25px_rgba(255,0,122,0.35)] transition hover:bg-pink-hover"
          >
            Explorar eventos
          </Link>
          <a href="#quienes-somos" className="rounded-lg border border-border bg-card px-6 py-3 text-sm font-bold text-white transition hover:border-pink">
            Saber más
          </a>
        </div>
      </div>

      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-card shadow-[0_0_60px_rgba(157,0,255,0.15)]">
        {destacado ? (
          <Link href={`/eventos/${destacado.id}`} aria-label={destacado.titulo}>
            <EventImage id={destacado.id} titulo={destacado.titulo} fotoUrl={destacado.foto_url} className="h-full w-full" />
          </Link>
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#2B0B57] via-card to-[#003A44]" />
        )}
      </div>
    </section>
  )
}
