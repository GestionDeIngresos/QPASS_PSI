import Link from 'next/link'

export function QuienesSomos({ sesionIniciada }: { sesionIniciada: boolean }) {
  return (
    <section id="quienes-somos" className="scroll-mt-24 border-t-2 border-[#9D00FF]/40">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1fr_20rem] md:px-10">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[#9D00FF]">Quiénes somos</p>
          <h2 className="text-2xl font-extrabold leading-snug text-white md:text-3xl">
            La plataforma definitiva para organizadores y asistentes de eventos
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            Nacimos con la misión de erradicar la frustración de buscar entradas falsas y la falta de transparencia en
            precios de puerta. En QPass conectamos a los amantes de eventos con las mejores experiencias bajo un sistema
            de tickets seguro, rápido e infalsificable.
          </p>
        </div>

        <aside className="self-start rounded-2xl border border-border bg-card p-6">
          <h3 className="font-bold text-white">¿Eres organizador?</h3>
          <p className="mb-5 mt-2 text-xs text-muted">Crea y gestiona tus eventos con nosotros!</p>
          <Link
            href={sesionIniciada ? '/eventos' : '/register'}
            className="block rounded-lg border border-border bg-bg px-4 py-3 text-center text-xs font-bold text-white transition hover:border-pink"
          >
            Solicitar acceso
          </Link>
        </aside>
      </div>
    </section>
  )
}
