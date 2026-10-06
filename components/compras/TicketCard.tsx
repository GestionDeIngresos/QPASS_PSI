import type { EntradaConEvento } from "../../types/compras";
import { formatRangoEvento } from "../../lib/compras/format";
import { EstadoBadge, etiquetaEstado } from "./EstadoBadge";

interface Props {
  entrada: EntradaConEvento;
  proximo: boolean;
  onVerQr: () => void;
}

export function TicketCard({ entrada, proximo, onVerQr }: Props) {
  const estado = etiquetaEstado(entrada, proximo);
  const puedeVerQr = entrada.estado === "activa" || entrada.estado === "usada";

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-[#231B45] bg-[#16112E] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-center gap-4">
        <div
          aria-hidden
          className="hidden h-14 w-14 shrink-0 rounded-lg bg-gradient-to-br from-[#FF007A]/40 to-[#9D00FF]/40 sm:block"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <EstadoBadge tipo={estado} />
            <span className="text-[11px] text-[#6B648A]">
              {formatRangoEvento(entrada.evento.fecha_inicio, entrada.evento.fecha_fin)}
            </span>
          </div>
          <h3 className="mt-1 truncate text-base font-extrabold text-white">{entrada.evento.nombre}</h3>
          {entrada.evento.ubicacion && <p className="text-xs text-[#A29DB8]">{entrada.evento.ubicacion}</p>}
          <p className="mt-1 text-[11px] font-semibold text-[#00F0FF]">{entrada.tipo_ticket.nombre}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onVerQr}
        disabled={!puedeVerQr}
        className="w-full rounded-lg border border-[#FF007A]/50 bg-[#FF007A]/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[#FF007A] transition hover:bg-[#FF007A] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        Ver QR
      </button>
    </li>
  );
}
