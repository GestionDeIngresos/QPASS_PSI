// ════════════════════════════════════════════════════════════════
// Tipos del módulo de compras (Dev C)
// ════════════════════════════════════════════════════════════════

/** Una línea de la compra: un tipo de ticket y cuántas entradas de ese tipo */
export type LineaCompra = {
  tipoTicketId: string
  cantidad: number
}

/** Lo que el navegador le manda a la Server Action */
export type CompraInput = {
  eventoId: string
  lineas: LineaCompra[]
  /** null = compra para sí mismo; correo = compra para otra persona */
  correoDestino: string | null
}

export type ResumenCostos = {
  cantidadTotal: number
  subtotal: number
  cargos: number
  total: number
}

export type ResultadoCompra =
  | {
      ok: true
      compraId: string
      entradas: number
      subtotal: number
      cargos: number
      total: number
      /** nombre del destinatario; null si compró para sí mismo */
      destinatario: string | null
    }
  | {
      ok: false
      error: string
      /** a qué campo pertenece el error (para mostrarlo junto al input) */
      campo?: 'correo'
    }