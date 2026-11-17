import Link from 'next/link'
import {
  eventosCaja,
  exigirPersonal,
  leerRecargas,
  leerDevoluciones
} from '@/lib/saldos/server'
import { idValido } from '@/lib/saldos/validacion'
import type { RolCaja } from '@/lib/saldos/types'
import { GestionRecarga } from './GestionRecarga'
export type ConsultaCaja = Promise<{ evento?: string; antes?: string }>
const fecha = (v: string) =>
  new Date(v).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })
export async function HistorialCaja({
  rol,
  searchParams
}: {
  rol: RolCaja
  searchParams: ConsultaCaja
}) {
  const eventos = await eventosCaja(rol),
    { user } = await exigirPersonal(rol)
  const params = await searchParams
  const evento =
    eventos.find((e) => e.id === Number(params.evento)) ?? eventos[0]
  const antes = Number(params.antes)
  if (!evento) return <p>No tienes eventos asignados.</p>
  const recargas =
    rol === 'recargador'
      ? await leerRecargas(evento.id, idValido(antes) ? antes : undefined)
      : []
  const devoluciones =
    rol === 'devolucion'
      ? await leerDevoluciones(evento.id, idValido(antes) ? antes : undefined)
      : []
  const filas = rol === 'recargador' ? recargas : devoluciones
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold">
        Historial de {rol === 'recargador' ? 'recargas' : 'devoluciones'}
      </h1>
      <p className="text-sm text-muted">
        Tus operaciones, conservadas con auditoría. Hora de Bolivia. Todos los
        importes son simulados.
      </p>
      <form className="flex flex-wrap items-end gap-3">
        <label>
          Evento
          <select
            name="evento"
            defaultValue={evento.id}
            className="ml-2 rounded-lg border border-border bg-card p-2"
          >
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.titulo}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-lg border border-pink px-4 py-2 text-pink">
          Consultar
        </button>
      </form>
      {!filas.length && (
        <p className="rounded-xl border border-border p-6">
          No hay operaciones registradas para esta consulta.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {recargas.map((r) => (
          <article
            className="rounded-xl border border-border bg-card p-5"
            key={r.id}
          >
            <h2 className="font-bold">
              QR-{r.id} · {r.nombre}
            </h2>
            <p className="text-sm text-muted">{fecha(r.fecha)}</p>
            <p>
              {r.monto} Bs ·{' '}
              {r.puntos ?? 'Sin puntos verificados en registro heredado'}{' '}
              {r.puntos ? 'pts' : ''}
            </p>
            {r.ajustes.map((a, i) => (
              <p key={i} className="mt-2 text-sm text-cyan">
                Ajuste {a.delta} pts · {a.motivo} · {fecha(a.fecha)}
              </p>
            ))}
            <GestionRecarga
              id={r.id}
              cuentaId={user.id}
              ajustable={r.puntos !== null}
            />
          </article>
        ))}
        {devoluciones.map((d) => (
          <article
            className="space-y-2 rounded-xl border border-border bg-card p-5"
            key={d.id}
          >
            <h2 className="font-bold">
              QD-{d.id} · {d.nombre}
            </h2>
            <p className="text-sm text-muted">
              {fecha(d.fecha)} · {d.virtual ? 'Virtual' : 'Presencial'}
            </p>
            <p>
              {d.puntos} pts · {d.importe ?? 'Importe histórico no verificado'}{' '}
              {d.importe ? 'Bs simulados' : ''}
            </p>
            {d.comprobanteFirmado && (
              <a
                href={d.comprobanteFirmado}
                target="_blank"
                rel="noreferrer"
                className="mr-4 text-cyan underline"
              >
                Ver comprobante
              </a>
            )}
            {d.fotoFirmada && (
              <a
                href={d.fotoFirmada}
                target="_blank"
                rel="noreferrer"
                className="text-cyan underline"
              >
                Ver foto
              </a>
            )}
            {!d.virtual && (!d.comprobanteFirmado || !d.fotoFirmada) && (
              <p className="text-xs text-muted">
                Alguna evidencia no está disponible. No se publica una URL
                permanente.
              </p>
            )}
          </article>
        ))}
      </div>
      <div className="flex gap-4 text-cyan underline">
        {idValido(antes) && (
          <Link href={`/${rol}/historial?evento=${evento.id}`}>
            Más recientes
          </Link>
        )}
        {filas.length === 25 && (
          <Link
            href={`/${rol}/historial?evento=${evento.id}&antes=${filas[filas.length - 1].id}`}
          >
            Ver anteriores
          </Link>
        )}
      </div>
    </div>
  )
}
