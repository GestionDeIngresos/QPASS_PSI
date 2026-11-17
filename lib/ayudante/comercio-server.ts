import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogoVenta } from './carrito';
import type { FiltrosVentas, VentaAutorizada, ResumenVentas } from './ventas-types';
import { validarVentaConfirmada } from './ventas-model';

const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,8}$/.test(v);
const decimal = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(v);
export async function catalogoReal(db: SupabaseClient, eventoId: number): Promise<CatalogoVenta> {
  const { data, error } = await db.rpc('consultar_catalogo_ayudante', { p_evento: eventoId });
  if (error || !objeto(data) || data.eventoId !== eventoId || !Array.isArray(data.negocios) || !Array.isArray(data.productos)) throw new Error('No se pudo consultar el catálogo autorizado.');
  const negocios = data.negocios.map(n => {
    if (!objeto(n) || !id(n.id) || typeof n.nombre !== 'string' || n.eventoId !== eventoId) throw new Error('Catálogo inválido.');
    return { id: n.id, nombre: n.nombre, eventoId };
  });
  const productos = data.productos.map(p => {
    if (!objeto(p) || !id(p.id) || !id(p.negocioId) || !negocios.some(n => n.id === p.negocioId)
      || typeof p.nombre !== 'string' || !decimal(p.precioEnPuntos) || typeof p.disponibleParaVenta !== 'boolean') throw new Error('Producto inválido.');
    return { id: p.id, negocioId: p.negocioId, nombre: p.nombre, precioEnPuntos: p.precioEnPuntos, disponibleParaVenta: p.disponibleParaVenta };
  });
  return { eventoId, negocios, productos };
}
function ventaAutorizada(data: unknown, usuarioId: string, catalogo: CatalogoVenta, esperado?: string): VentaAutorizada {
  const venta = validarVentaConfirmada(data, { ayudanteId: usuarioId, eventoId: catalogo.eventoId, negociosAutorizados: catalogo.negocios.map(n => n.id) }, esperado);
  if (!venta) throw new Error('La venta no tiene un registro histórico válido y autorizado.');
  return venta;
}
export async function resumenReal(db: SupabaseClient, eventoId: number): Promise<ResumenVentas> {
  const { data, error } = await db.rpc('consultar_resumen_ventas', { p_evento: eventoId });
  if (error || !objeto(data) || !decimal(data.puntosCobrados) || ![data.ventasDia, data.ventasMes, data.cantidadConfirmadas].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) throw new Error('No se pudo consultar el resumen de ventas.');
  return { puntosCobrados: data.puntosCobrados, ventasDia: data.ventasDia as number, ventasMes: data.ventasMes as number, cantidadConfirmadas: data.cantidadConfirmadas as number };
}
export async function detalleReal(db: SupabaseClient, usuarioId: string, eventoId: number, ventaId: string) {
  if (!id(ventaId)) return { estado: 'no_encontrada' as const };
  const { data, error } = await db.rpc('consultar_detalle_venta', { p_evento: eventoId, p_venta: Number(ventaId) });
  if (error) throw new Error('No se pudo consultar la venta.');
  if (data === null) return { estado: 'no_encontrada' as const };
  const catalogo = await catalogoReal(db, eventoId);
  return { estado: 'disponible' as const, venta: ventaAutorizada(data, usuarioId, catalogo, ventaId) };
}
export async function historialReal(db: SupabaseClient, usuarioId: string, eventoId: number, filtros: FiltrosVentas, antes?: string) {
  if ((filtros.negocio && !id(filtros.negocio)) || (antes && !id(antes))) throw new Error('Filtro inválido.');
  const { data, error } = await db.rpc('consultar_historial_ventas', { p_evento: eventoId, p_desde: filtros.desde || null,
    p_hasta: filtros.hasta || null, p_negocio: filtros.negocio ? Number(filtros.negocio) : null,
    p_referencia: filtros.referencia, p_antes: antes ? Number(antes) : null, p_limite: 25 });
  if (error || !objeto(data) || !Array.isArray(data.ventas) || !Array.isArray(data.negocios)
    || (data.siguienteCursor !== null && !id(data.siguienteCursor))) throw new Error('No se pudo consultar el historial.');
  // No se calcula el resumen a partir de esta página.
  const catalogo = await catalogoReal(db, eventoId);
  return { estado: 'disponible' as const, negocios: catalogo.negocios.map(n => ({ id: n.id, nombre: n.nombre })),
    ventas: data.ventas.map(v => ventaAutorizada(v, usuarioId, catalogo)), siguienteCursor: data.siguienteCursor as string | null };
}
