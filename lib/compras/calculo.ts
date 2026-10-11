// ════════════════════════════════════════════════════════════════
// Cálculo de costos de una compra (lo usa la UI para mostrar el resumen).
// La fuente de verdad es la función SQL comprar_entradas(): ella recalcula
// todo con los precios de la BD. Esto es solo la vista previa.
// ════════════════════════════════════════════════════════════════
import type { TipoTicket } from '@/lib/eventos/types'
import type { LineaCompra, ResumenCostos } from '@/lib/compras/types'

// ─── ZONA EDITABLE: reglas de negocio ────────────────────────────
// Deben coincidir con las constantes de supabase/compras_politicas_y_funcion.sql
export const TASA_CARGO_SERVICIO = 0.07 // 7 % (el mockup: 50,00 → 3,50 · 25,00 → 1,75)
export const MAX_ENTRADAS_POR_LINEA = 10 // entradas por tipo de ticket en una compra
export const MAX_LINEAS = 10 // tipos de ticket distintos por compra
// ─────────────────────────────────────────────────────────────────

export const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Máximo de entradas que se pueden pedir de un tipo en esta compra */
export function maximoPorLinea(ticket: TipoTicket): number {
  return Math.max(
    0,
    Math.min(ticket.limite_por_usuario ?? MAX_ENTRADAS_POR_LINEA, ticket.cantidad_disponible, MAX_ENTRADAS_POR_LINEA)
  )
}

export function calcularResumen(lineas: LineaCompra[], tickets: TipoTicket[]): ResumenCostos {
  let subtotal = 0
  let cantidadTotal = 0

  for (const linea of lineas) {
    const ticket = tickets.find((t) => t.id === linea.tipoTicketId)
    if (!ticket) continue
    subtotal += ticket.precio * linea.cantidad
    cantidadTotal += linea.cantidad
  }

  const cargos = redondear2(subtotal * TASA_CARGO_SERVICIO)
  return {
    cantidadTotal,
    subtotal: redondear2(subtotal),
    cargos,
    total: redondear2(subtotal + cargos),
  }
}