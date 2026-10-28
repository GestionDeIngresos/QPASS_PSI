import Link from 'next/link'
import { BotonConfirmar } from '@/components/admin/BotonConfirmar'
import { eliminarSolicitud, resolverSolicitud } from '@/app/admin/solicitudes/actions'
import { formatearRangoCorto, type SolicitudAdmin } from '@/lib/admin/solicitudes'

const ESTILOS = {
  en_revision: { barra: 'bg-amber-400', pill: 'border-amber-400 text-amber-400', texto: 'PENDIENTE' },
  aprobada: { barra: 'bg-green-400', pill: 'border-green-400 text-green-400', texto: 'ACEPTADO' },
  rechazada: { barra: 'bg-pink', pill: 'border-pink text-pink', texto: 'DENEGADO' },
} as const

const BOTON = 'rounded-lg px-4 py-2 text-xs font-bold transition disabled:opacity-50'

export function SolicitudFila({ s }: { s: SolicitudAdmin }) {
  const estilo = ESTILOS[s.estado]

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-bg/60 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <span className={`h-12 w-1 shrink-0 rounded-full ${estilo.barra}`} />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-white">{s.titulo}</p>
          <p className="mt-1 text-xs text-muted">
            Solicitado por: <span className="font-semibold text-white">{s.solicitanteCorreo ?? s.solicitanteNombre ?? '—'}</span>
            <span className="mx-2">·</span>
            Fechas propuestas: {formatearRangoCorto(s.fechaInicio, s.fechaFin)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${estilo.pill}`}>{estilo.texto}</span>

        {s.estado === 'en_revision' && (
          <>
            <form action={resolverSolicitud}>
              <input type="hidden" name="id" value={s.id} />
              <button name="decision" value="aprobar" className={`${BOTON} bg-green-400 text-black hover:bg-green-300`}>
                Aceptar
              </button>
            </form>
            <form action={resolverSolicitud}>
              <input type="hidden" name="id" value={s.id} />
              <BotonConfirmar
                mensaje="¿Denegar esta solicitud?"
                name="decision"
                value="denegar"
                className={`${BOTON} bg-pink text-white hover:bg-pink-hover`}
              >
                Denegar
              </BotonConfirmar>
            </form>
          </>
        )}

        {s.estado === 'aprobada' && s.eventoId && (
          <Link
            href={`/admin/solicitudes/${s.id}/configurar`}
            className={`${BOTON} bg-cyan text-black hover:opacity-90`}
          >
            Editar Evento
          </Link>
        )}

        {s.estado !== 'en_revision' && (
          <form action={eliminarSolicitud}>
            <input type="hidden" name="id" value={s.id} />
            <BotonConfirmar
              mensaje="¿Eliminar esta solicitud y su evento? No se puede deshacer."
              className={`${BOTON} border border-pink text-pink hover:bg-pink hover:text-white`}
            >
              Eliminar
            </BotonConfirmar>
          </form>
        )}
      </div>
    </li>
  )
}
