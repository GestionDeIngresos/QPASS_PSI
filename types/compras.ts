import type { TipoAcceso } from "../lib/eventos/types";

export type EstadoEntrada = "activa" | "usada" | "reportada" | "anulada";

/** Datos del evento asociados a una entrada (columnas reales de la tabla `eventos`). */
export interface EventoDeEntrada {
  id: string;
  titulo: string;
  foto_url: string | null;
  ubicacion: string | null;
  fecha_evento: string; // ISO (timestamptz)
  tipo_acceso: TipoAcceso; // 'qr_digital' | 'qr_fisico'
}

export interface TipoTicketResumen {
  id: string;
  nombre: string;
  precio: number;
}

export interface EntradaConEvento {
  id: string;
  compra_id: string;
  codigo_qr: string;
  estado: EstadoEntrada;
  creado_en: string;
  tipo_ticket: TipoTicketResumen;
  evento: EventoDeEntrada;
}

export interface CompraConEntradas {
  id: string;
  subtotal: number;
  cargos_servicio: number;
  total: number;
  estado_pago: string;
  comprobante_url: string | null;
  creado_en: string;
  entradas: EntradaConEvento[];
}
