import type { EntradaConEvento } from "../../types/compras";

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

const dia = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "2-digit", month: "short" });
const hora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });
const fechaLarga = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Viernes, 12 may · 22:00" (+ fin si existe) */
export function formatRangoEvento(inicio: string, fin: string | null): string {
  const i = new Date(inicio);
  const base = `${cap(dia.format(i))} · ${hora.format(i)}`;
  if (!fin) return base;
  const f = new Date(fin);
  return `${base} – ${cap(dia.format(f))} · ${hora.format(f)}`;
}

export function formatFechaLarga(iso: string): string {
  return cap(fechaLarga.format(new Date(iso)));
}

/** Un evento es "próximo" mientras no haya terminado (fecha_fin, o inicio si no hay fin). */
export function esProximo(e: EntradaConEvento, ahora = new Date()): boolean {
  const limite = new Date(e.evento.fecha_fin ?? e.evento.fecha_inicio);
  return limite.getTime() >= ahora.getTime();
}

export function numeroCompra(id: string): string {
  return `QP-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
