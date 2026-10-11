// ════════════════════════════════════════════════════════════════
// Tipos del módulo de eventos (vista pública del cliente)
// Reflejan las tablas: eventos, categorias_evento, tipos_ticket
// ════════════════════════════════════════════════════════════════

export type TipoAcceso = 'qr_digital' | 'qr_fisico'

export type Categoria = {
  id: string
  nombre: string
}

export type TipoTicket = {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  cantidad_disponible: number
  limite_por_usuario: number | null
}

/** Lo mínimo que necesita una tarjeta del listado */
export type EventoResumen = {
  id: string
  titulo: string
  foto_url: string | null
  ubicacion: string | null
  fecha_evento: string // ISO (timestamptz)
  tipo_acceso: TipoAcceso
  destacado_carrusel: boolean
  categoria: Categoria | null
}

/** Todo lo que necesita la vista de detalle */
export type EventoDetalle = EventoResumen & {
  descripcion: string | null
  mapa_url: string | null
  tickets: TipoTicket[]
}

/** Filtros que llegan por la URL (?q=...&categoria=...&fecha=YYYY-MM-DD) */
export type FiltrosEventos = {
  q: string
  categoriaId: string
  fecha: string
}
