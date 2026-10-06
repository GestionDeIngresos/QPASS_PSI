export type EstadoEntrada = "activa" | "usada" | "reportada" | "anulada";

export interface EventoResumen {
  id: string;
  nombre: string;
  fecha_inicio: string; // ISO
  fecha_fin: string | null; // ISO
  ubicacion: string | null;
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
  evento: EventoResumen;
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
