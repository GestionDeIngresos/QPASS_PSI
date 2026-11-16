import 'server-only';
import { exigirEventoAyudante } from './auth';
import { idVentaValido, leerFiltrosVentas } from './ventas-model';
import type { FiltrosVentas, LecturaDetalle, LecturaHistorial, LecturaResumen } from './ventas-types';

// Lectura real deliberadamente desconectada: faltan ventas/venta_items, alcance
// comercial y RLS confirmados. No recibe registros ni importes desde el navegador.
export async function obtenerResumenVentas(eventoId: number): Promise<LecturaResumen> {
  await exigirEventoAyudante(eventoId);
  return { estado: 'pendiente' };
}
export async function obtenerHistorialVentas(eventoId: number, filtros: FiltrosVentas): Promise<LecturaHistorial> {
  await exigirEventoAyudante(eventoId);
  // Los filtros están tipados para el futuro adaptador, no se envían a una RPC inventada.
  if (leerFiltrosVentas(filtros).error) throw new Error('Filtros inválidos.');
  return { estado: 'pendiente' };
}
export async function obtenerDetalleVenta(eventoId: number, ventaId: string): Promise<LecturaDetalle> {
  await exigirEventoAyudante(eventoId);
  if (!idVentaValido(ventaId)) return { estado: 'no_encontrada' };
  // No usar el ID de la URL como prueba de existencia/confirmación/autorización.
  return { estado: 'pendiente' };
}
