import type { IdentidadQr } from '@/lib/qr/types';

/** DTO propuestos de la aplicación; NO son tablas, columnas o RPC de B/C.
 * Sus adaptadores se acordarán cuando estén disponibles los contratos reales.
 * Puntos se serializa como decimal textual; el catálogo real usa numeric(10,2).
 * La equivalencia precio/puntos de la propuesta v1 requiere revisión B/C.
 */
export type PuntosVista = string;
export type Integracion<T> = { estado: 'pendiente' } | { estado: 'disponible'; datos: T };
export type NegocioAsignadoVista = { id: string; nombre: string; eventoId: number };
export type ProductoDisponibleVista = {
  id: string; negocioId: string; nombre: string; precioEnPuntos: PuntosVista;
  disponibleParaVenta: boolean;
};
export type IdentidadAsistente = IdentidadQr;
export type SaldoGastableVista = {
  eventoId: number; gastable: PuntosVista; reservadoParaDevoluciones: PuntosVista;
};
export type ItemVentaVista = {
  productoId: string; nombreHistorico: string; cantidad: number;
  precioUnitarioHistorico: PuntosVista; subtotal: PuntosVista;
};
export type VentaConfirmadaVista = {
  id: string; referencia: string; fecha: string; eventoId: number;
  negocioId: string; ayudanteId: string; total: PuntosVista; items: ItemVentaVista[];
};
export type HistorialVentasVista = { ventas: VentaConfirmadaVista[]; siguienteCursor: string | null };
export type FiltrosHistorialVista = { desde?: string; hasta?: string; referencia?: string };
export type ContratosAyudanteVista = {
  negocios: Integracion<NegocioAsignadoVista[]>;
  productos: Integracion<ProductoDisponibleVista[]>;
  identidad: Integracion<IdentidadAsistente>;
  saldo: Integracion<SaldoGastableVista>;
  venta: Integracion<VentaConfirmadaVista>;
  historial: Integracion<HistorialVentasVista>;
};
