import 'server-only';
import { exigirEventoAyudante } from './auth';
import { idVentaValido, leerFiltrosVentas } from './ventas-model';
import type { FiltrosVentas, LecturaDetalle, LecturaHistorial, LecturaResumen } from './ventas-types';

// Las lecturas HU 59/62/63 usan sesión aunque los cobros estén desactivados.
export async function obtenerResumenVentas(eventoId: number): Promise<LecturaResumen> {
  const { sesion } = await exigirEventoAyudante(eventoId);
  const { resumenReal } = await import('./comercio-server');
  return { estado: 'disponible', resumen: await resumenReal(sesion.supabase, eventoId) };
}
export async function obtenerHistorialVentas(eventoId: number, filtros: FiltrosVentas, antes?: string): Promise<LecturaHistorial> {
  const { sesion } = await exigirEventoAyudante(eventoId);
  if (leerFiltrosVentas(filtros).error) throw new Error('Filtros inválidos.');
  const { historialReal } = await import('./comercio-server');
  return historialReal(sesion.supabase, sesion.user.id, eventoId, filtros, antes);
}
export async function obtenerDetalleVenta(eventoId: number, ventaId: string): Promise<LecturaDetalle> {
  const { sesion } = await exigirEventoAyudante(eventoId);
  if (!idVentaValido(ventaId)) return { estado: 'no_encontrada' };
  const { detalleReal } = await import('./comercio-server');
  return detalleReal(sesion.supabase, sesion.user.id, eventoId, ventaId);
}
