import type { EntradaConEvento } from "../../types/compras";
import { formatFechaEvento } from "../../lib/compras/format";
import { etiquetaAcceso } from "../../lib/eventos/format";
import { EventImage } from "../eventos/EventImage";
import { EstadoBadge, etiquetaEstado } from "./EstadoBadge";

interface Props {
  entrada: EntradaConEvento;
  proximo: boolean;
  onVerQr: () => void;
}

export function TicketCard({ entrada, proximo, onVerQr }: Props) {
  const estado = etiquetaEstado(entrada, proximo);
  const { evento } = entrada;
  const esDigital = evento.tipo_acceso === "qr_digital";
  // El QR digital se muestra en la app; el físico (manilla) se entrega en el evento.
  const puedeVerQr = esDigital && (entrada.estado === "activa" || entrada.estado === "usada");

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-[#231B45] bg-[#16112E] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-center gap-4">
        <EventImage
          id={evento.id}
          titulo={evento.titulo}
          fotoUrl={evento.foto_url}
          className="hidden h-14 w-14 shrink-0 rounded-lg sm:block"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <EstadoBadge tipo={estado} />
            <span className="text-[11px] text-[#6B648A]">{formatFechaEvento(evento.fecha_evento)}</span>
          </div>
          <h3 className="mt-1 truncate text-base font-extrabold text-white">{evento.titulo}</h3>
          {evento.ubicacion && <p className="text-xs text-[#A29DB8]">{evento.ubicacion}</p>}
          <p className={`mt-1 text-[11px] font-semibold ${esDigital ? "text-[#00F0FF]" : "text-[#FF007A]"}`}>
            {entrada.tipo_ticket.nombre} · Tipo {etiquetaAcceso(evento.tipo_acceso)}
          </p>
        </div>
      </div>

      {puedeVerQr && (
        <button
          type="button"
          onClick={onVerQr}
          className="w-full rounded-lg border border-[#FF007A]/50 bg-[#FF007A]/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[#FF007A] transition hover:bg-[#FF007A] hover:text-white sm:w-auto"
        >
          Ver QR
        </button>
      )}
    </li>
  );
}
