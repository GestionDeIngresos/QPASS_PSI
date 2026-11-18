import { leerReportes } from '@/lib/saldos/server'
import Link from 'next/link'
import { idValido } from '@/lib/saldos/validacion'
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ antes?: string }>
}) {
  const { antes: raw } = await searchParams
  const antes = Number(raw)
  const reportes = await leerReportes(idValido(antes) ? antes : undefined)
  return (
    <>
      <h1 className="text-3xl font-extrabold">Mis reportes de recarga</h1>
      <p className="text-muted">
        Administración revisa y resuelve tus reportes. Marcar como solucionado
        no modifica ningún saldo.
      </p>
      {!reportes.length && (
        <p>No tienes reportes registrados en tus eventos asignados.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {reportes.map((r) => (
          <article
            className="space-y-2 rounded-xl border border-border bg-card p-5"
            key={r.id}
          >
            <h2 className="font-bold">
              Reporte #{r.id} · Recarga #{r.recargaId}
            </h2>
            <p
              className={r.estado === 'solucionado' ? 'text-cyan' : 'text-pink'}
            >
              {r.estado === 'solucionado'
                ? 'Solucionado'
                : 'Pendiente de revisión'}
            </p>
            <p className="whitespace-pre-wrap break-words">{r.descripcion}</p>
            <p className="text-xs text-muted">
              {new Date(r.fecha).toLocaleString('es-BO', {
                timeZone: 'America/La_Paz'
              })}
            </p>
          </article>
        ))}
      </div>
      <p className="text-xs text-muted">
        Se muestran hasta 100 reportes recientes.
      </p>
      <div className="flex gap-4 text-cyan underline">
        {idValido(antes) && (
          <Link href="/recargador/reportes">Más recientes</Link>
        )}
        {reportes.length === 100 && (
          <Link
            href={`/recargador/reportes?antes=${reportes[reportes.length - 1].id}`}
          >
            Ver anteriores
          </Link>
        )}
      </div>
    </>
  )
}
