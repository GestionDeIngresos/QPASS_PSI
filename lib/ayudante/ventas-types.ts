import type { VentaConfirmadaVista, PuntosVista } from './contracts';

/** DTO propuestos de lectura. No representan el esquema ni enum real de ventas. */
export type VentaRegistradaVista = VentaConfirmadaVista & {
  estado: 'confirmada'; negocioNombreHistorico: string;
};
export type AlcanceVentas = { ayudanteId: string; eventoId: number; negociosAutorizados: readonly string[] };
declare const autorizada: unique symbol;
/** Se construye mediante validarVentaConfirmada, nunca a partir del carrito. */
export type VentaAutorizada = VentaRegistradaVista & { readonly [autorizada]: true };
export type FiltrosVentas = { desde: string; hasta: string; negocio: string; referencia: string };
export type ResumenVentas = { ventasDia: number; ventasMes: number; puntosCobrados: PuntosVista; cantidadConfirmadas: number };
export type LecturaResumen = { estado: 'pendiente' } | { estado: 'disponible'; resumen: ResumenVentas };
export type LecturaHistorial = { estado: 'pendiente' } | {
  estado: 'disponible'; ventas: VentaAutorizada[]; negocios: { id: string; nombre: string }[];
  siguienteCursor?: string | null;
};
export type LecturaDetalle = { estado: 'pendiente' } | { estado: 'no_encontrada' } | { estado: 'disponible'; venta: VentaAutorizada };

/** Puerto de aplicación futuro, NO firmas RPC definitivas de B/C.
 * Debe leer registros persistidos con permisos comerciales comprobados.
 * El resumen debe usar el conjunto completo autorizado, no una página de historial.
 */
export interface FuenteLecturaVentas {
  resumen(alcance: AlcanceVentas, ahora: Date): Promise<ResumenVentas>;
  historial(alcance: AlcanceVentas, filtros: FiltrosVentas): Promise<unknown[]>;
  detalle(alcance: AlcanceVentas, ventaId: string): Promise<unknown | null>;
}
