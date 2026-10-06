"use client";

import { useEffect } from "react";
import type { EntradaConEvento } from "../../types/compras";
import { formatRangoEvento } from "../../lib/compras/format";
import { QrCode } from "./QrCode";
import { DescargarTicketPdf } from "./DescargarTicketPdf";

export function QrModal({ entrada, onClose }: { entrada: EntradaConEvento; onClose: () => void }) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#05050A]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Código QR de ${entrada.evento.nombre}`}
        className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-[#231B45] bg-[#0F0B1E] p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-[#231B45] text-[#A29DB8] hover:text-white"
        >
          ×
        </button>

        <h2 className="mt-2 text-lg font-extrabold text-white">{entrada.evento.nombre}</h2>
        <p className="mt-1 text-xs text-[#A29DB8]">{formatRangoEvento(entrada.evento.fecha_inicio, entrada.evento.fecha_fin)}</p>
        <p className="mt-1 text-xs font-semibold text-[#00F0FF]">{entrada.tipo_ticket.nombre}</p>

        <div className="my-5 flex justify-center">
          <QrCode value={entrada.codigo_qr} size={220} />
        </div>

        <p className="mb-5 break-all font-mono text-xs text-[#6B648A]">{entrada.codigo_qr}</p>
        <DescargarTicketPdf entrada={entrada} />
      </div>
    </div>
  );
}
