import type { AlcanceVentas, FiltrosVentas, VentaAutorizada, ResumenVentas } from './ventas-types';

export const ZONA_VENTAS = 'America/La_Paz';
export const idVentaValido = (id: string) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
const texto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000;
const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function decimal(v: unknown) {
  if (typeof v !== 'string' || v.length > 64 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(v)) return null;
  const [entero, fraccion = ''] = v.split('.');
  return { unidades: BigInt(entero + fraccion), decimales: fraccion.length };
}
function suma(importes: string[]): string {
  const valores = importes.map(v => decimal(v)!);
  const escala = Math.max(0, ...valores.map(v => v.decimales));
  const total = valores.reduce((s, v) => s + v.unidades * BigInt(10) ** BigInt(escala - v.decimales), BigInt(0));
  const t = total.toString().padStart(escala + 1, '0');
  return escala ? (t.slice(0, -escala) + '.' + t.slice(-escala)).replace(/0+$/, '').replace(/\.$/, '') : t;
}
function iguales(a: string, b: string) { return suma([a]) === suma([b]); }
function multiplicar(valor: string, cantidad: number) {
  const v = decimal(valor)!;
  const n = (v.unidades * BigInt(cantidad)).toString().padStart(v.decimales + 1, '0');
  return v.decimales ? n.slice(0, -v.decimales) + '.' + n.slice(-v.decimales) : n;
}
/** Exigir un instante con zona explícita; no interpretar hora del host como Bolivia. */
function instanteValido(fecha: unknown): fecha is string {
  return typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(fecha) && diaValido(fecha.slice(0, 10)) && Number.isFinite(Date.parse(fecha));
}
export function fechaDiaBolivia(fecha: string | Date) {
  const partes = new Intl.DateTimeFormat('en', { timeZone: ZONA_VENTAS, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(fecha));
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find(p => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}
export function formatearFechaVenta(fecha: string) {
  return new Intl.DateTimeFormat('es-BO', { timeZone: ZONA_VENTAS, dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(fecha));
}
function diaValido(dia: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const fecha = new Date(dia + 'T00:00:00Z');
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === dia;
}
export function leerFiltrosVentas(params: Record<string, string | string[] | undefined>): { filtros: FiltrosVentas; error?: string } {
  const filtros: FiltrosVentas = { desde: '', hasta: '', negocio: '', referencia: '' };
  for (const campo of ['desde', 'hasta', 'negocio', 'referencia'] as const) {
    const valor = params[campo];
    if (valor !== undefined && typeof valor !== 'string') return { filtros, error: 'Revisa los filtros indicados.' };
    filtros[campo] = (valor ?? '').trim();
  }
  if ((filtros.desde && !diaValido(filtros.desde)) || (filtros.hasta && !diaValido(filtros.hasta)) || (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta)) return { filtros, error: 'Indica un intervalo de fechas válido.' };
  if ((filtros.negocio && !idVentaValido(filtros.negocio)) || filtros.referencia.length > 80) return { filtros, error: 'Revisa el negocio y la referencia.' };
  return { filtros };
}

/** Validación de registros persistidos y alcance ya autorizado por el servidor.
 * Rechaza DTO incompleto/no confirmado/ajeno; no hace fallback al catálogo actual.
 */
export function validarVentaConfirmada(valor: unknown, alcance: AlcanceVentas, idEsperado?: string): VentaAutorizada | null {
  if (!texto(alcance.ayudanteId) || !Number.isSafeInteger(alcance.eventoId) || alcance.eventoId <= 0) return null;
  if (!objeto(valor) || valor.estado !== 'confirmada' || !texto(valor.id) || !idVentaValido(valor.id) || (idEsperado !== undefined && valor.id !== idEsperado)) return null;
  if (valor.ayudanteId !== alcance.ayudanteId || valor.eventoId !== alcance.eventoId || !texto(valor.negocioId) || !alcance.negociosAutorizados.includes(valor.negocioId)) return null;
  if (!texto(valor.referencia) || !texto(valor.negocioNombreHistorico) || !instanteValido(valor.fecha) || !decimal(valor.total) || !Array.isArray(valor.items) || valor.items.length === 0) return null;
  const items = [];
  for (const item of valor.items) {
    if (!objeto(item) || !texto(item.productoId) || !texto(item.nombreHistorico) || typeof item.cantidad !== 'number' || !Number.isSafeInteger(item.cantidad) || item.cantidad <= 0 || !decimal(item.precioUnitarioHistorico) || !decimal(item.subtotal)) return null;
    if (!iguales(multiplicar(item.precioUnitarioHistorico as string, item.cantidad), item.subtotal as string)) return null;
    items.push({ productoId: item.productoId, nombreHistorico: item.nombreHistorico, cantidad: item.cantidad, precioUnitarioHistorico: item.precioUnitarioHistorico as string, subtotal: item.subtotal as string });
  }
  if (!iguales(suma(items.map(i => i.subtotal)), valor.total as string)) return null;
  return {
    id: valor.id, referencia: valor.referencia, estado: 'confirmada', fecha: valor.fecha,
    ayudanteId: alcance.ayudanteId, eventoId: alcance.eventoId, negocioId: valor.negocioId,
    negocioNombreHistorico: valor.negocioNombreHistorico, total: valor.total as string, items,
  } as VentaAutorizada;
}
/** Solo sobre el conjunto COMPLETO de ventas confirmadas previamente autorizadas. */
export function resumirVentas(ventas: VentaAutorizada[], ahora: Date): ResumenVentas {
  if (new Set(ventas.map(v => v.id)).size !== ventas.length) throw new Error('Conjunto de ventas duplicado.');
  const hoy = fechaDiaBolivia(ahora), mes = hoy.slice(0, 7);
  return {
    ventasDia: ventas.filter(v => fechaDiaBolivia(v.fecha) === hoy).length,
    ventasMes: ventas.filter(v => fechaDiaBolivia(v.fecha).slice(0, 7) === mes).length,
    puntosCobrados: suma(ventas.map(v => v.total)), cantidadConfirmadas: ventas.length,
  };
}
export function filtrarVentas(ventas: VentaAutorizada[], filtros: FiltrosVentas) {
  return ventas.filter(v => {
    const dia = fechaDiaBolivia(v.fecha);
    return (!filtros.desde || dia >= filtros.desde) && (!filtros.hasta || dia <= filtros.hasta)
      && (!filtros.negocio || v.negocioId === filtros.negocio) && (!filtros.referencia || v.referencia.toLocaleLowerCase('es').includes(filtros.referencia.toLocaleLowerCase('es')));
  }).sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha) || b.id.localeCompare(a.id));
}
