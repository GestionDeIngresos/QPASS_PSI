import type { EntradaConEvento } from "../../types/compras";

const estilos = {
  activo: "border-[#00F0FF]/60 text-[#00F0FF] bg-[#00F0FF]/10",
  caducado: "border-[#FF007A]/60 text-[#FF007A] bg-[#FF007A]/10",
  usado: "border-[#A29DB8]/50 text-[#A29DB8] bg-[#A29DB8]/10",
  reportado: "border-[#FFB800]/60 text-[#FFB800] bg-[#FFB800]/10",
  anulado: "border-[#FF3B30]/60 text-[#FF3B30] bg-[#FF3B30]/10",
} as const;

export function etiquetaEstado(e: EntradaConEvento, proximo: boolean): keyof typeof estilos {
  if (e.estado === "usada") return "usado";
  if (e.estado === "reportada") return "reportado";
  if (e.estado === "anulada") return "anulado";
  return proximo ? "activo" : "caducado";
}

export function EstadoBadge({ tipo }: { tipo: keyof typeof estilos }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${estilos[tipo]}`}>
      {tipo}
    </span>
  );
}
