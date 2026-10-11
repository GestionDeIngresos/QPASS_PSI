// Formatos de "Mis Compras" y confirmación. Reutiliza los helpers de Dev B
// (lib/eventos/format.ts) para que fechas y precios se vean igual en toda la app
// (hora de Bolivia y moneda "Bs").
import type { EntradaConEvento } from "../../types/compras";
import { eventoFinalizado, formatearFecha, formatearPrecio } from "../eventos/format";

export const formatMoney = formatearPrecio;

/** "Miércoles, 14 Oct · 22:00" */
export const formatFechaEvento = (iso: string) => formatearFecha(iso, { conHora: true });

/** "Miércoles, 14 Oct 2026 · 22:00" */
export const formatFechaCompra = (iso: string) => formatearFecha(iso, { conAnio: true, conHora: true });

/** "Próximo" mientras el evento no haya ocurrido; si ya ocurrió va al Historial. */
export const esProximo = (e: EntradaConEvento): boolean => !eventoFinalizado(e.evento.fecha_evento);

export function numeroCompra(id: string): string {
  return `QP-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
