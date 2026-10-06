import { POCOS_TICKETS, formatearPrecio } from '@/lib/eventos/format'
import type { TipoTicket } from '@/lib/eventos/types'

/** Texto + color del cupo restante de un tipo de ticket */
function estadoCupo(cantidad: number): { texto: string; clase: string } {
  if (cantidad <= 0) return { texto: 'Agotado', clase: 'text-red-400' }
  if (cantidad <= POCOS_TICKETS) return { texto: `¡Quedan ${cantidad}!`, clase: 'text-amber-400' }
  return { texto: `${cantidad} disponibles`, clase: 'text-muted' }
}

/** Lista de tipos de ticket de un evento: nombre, descripción, precio y cupo restante */
export function TicketList({ tickets }: { tickets: TipoTicket[] }) {
  if (tickets.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-bg/60 px-4 py-4 text-sm text-muted">
        Aún no hay tickets disponibles para este evento.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {tickets.map((ticket) => {
        const cupo = estadoCupo(ticket.cantidad_disponible)
        const agotado = ticket.cantidad_disponible <= 0

        return (
          <li
            key={ticket.id}
            className={`flex items-center justify-between gap-4 rounded-xl border border-border bg-bg/60 px-4 py-3 ${
              agotado ? 'opacity-60' : ''
            }`}
          >
            <div className="min-w-0">
              <p className="font-semibold text-white">{ticket.nombre}</p>
              {ticket.descripcion && <p className="mt-0.5 text-xs text-muted">{ticket.descripcion}</p>}
              <p className="mt-1 text-xs">
                <span className={`font-semibold ${cupo.clase}`}>{cupo.texto}</span>
                {ticket.limite_por_usuario != null && (
                  <span className="text-muted"> · Máx. {ticket.limite_por_usuario} por persona</span>
                )}
              </p>
            </div>
            <p className="shrink-0 text-lg font-bold text-cyan">{formatearPrecio(ticket.precio)}</p>
          </li>
        )
      })}
    </ul>
  )
}
