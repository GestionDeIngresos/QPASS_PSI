import Link from 'next/link'
import { leerMisSaldos } from '@/lib/saldos/server'
export const metadata = { title: 'Mis saldos · QPass' }
export const dynamic = 'force-dynamic'
export default async function Page() {
  const saldos = await leerMisSaldos()
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-extrabold">Mis saldos por evento</h1>
      <p className="text-muted">
        Los puntos reservados corresponden a devoluciones virtuales pendientes
        de liquidar.
      </p>
      {!saldos.length && <p>No tienes saldos registrados.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {saldos.map((s) => (
          <article
            className="space-y-2 rounded-xl border border-border bg-card p-6"
            key={s.eventoId}
          >
            <h2 className="text-lg font-bold">{s.evento}</h2>
            <p>
              Total: {s.saldo} pts · Reservado: {s.reservado} pts
            </p>
            <p className="text-xl font-bold text-cyan">
              Disponible: {s.disponible} pts
            </p>
          </article>
        ))}
      </div>
      <Link className="text-pink underline" href="/mi-cuenta/devoluciones">
        Solicitar devolución virtual
      </Link>
    </div>
  )
}
