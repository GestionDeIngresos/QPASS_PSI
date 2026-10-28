"use client";

import { useState } from "react";
import type { CompraConEntradas } from "../../types/compras";
import { generarComprobantePdf } from "../../lib/compras/pdf";

const base =
  "inline-flex w-full items-center justify-center rounded-lg border border-[#231B45] bg-[#16112E] px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:border-[#FF007A]/60 sm:w-auto";

export function DescargarComprobante({ compra }: { compra: CompraConEntradas }) {
  const [cargando, setCargando] = useState(false);

  if (compra.comprobante_url) {
    return (
      <a href={compra.comprobante_url} target="_blank" rel="noopener noreferrer" className={base}>
        Descargar comprobante
      </a>
    );
  }
  return (
    <button
      type="button"
      className={base}
      disabled={cargando}
      onClick={async () => {
        setCargando(true);
        try {
          await generarComprobantePdf(compra);
        } finally {
          setCargando(false);
        }
      }}
    >
      {cargando ? "Generando…" : "Descargar comprobante"}
    </button>
  );
}
