"use client";

import { useState } from "react";
import type { EntradaConEvento } from "../../types/compras";
import { generarTicketPdf } from "../../lib/compras/pdf";

export function DescargarTicketPdf({ entrada, className = "" }: { entrada: EntradaConEvento; className?: string }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setCargando(true);
    setError(null);
    try {
      await generarTicketPdf(entrada);
    } catch {
      setError("No se pudo generar el PDF. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onClick}
        disabled={cargando}
        className={`w-full rounded-lg bg-[#FF007A] px-4 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_24px_-6px_#FF007A] transition hover:brightness-110 disabled:opacity-60 ${className}`}
      >
        {cargando ? "Generando PDF…" : "Descargar ticket PDF"}
      </button>
      {error && <p role="alert" className="mt-2 text-center text-xs text-[#FF3B30]">{error}</p>}
    </div>
  );
}
