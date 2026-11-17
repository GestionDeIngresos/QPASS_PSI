import type { LineaCarrito } from './carrito';

const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,8}$/.test(v);
export type SolicitudCobro = { eventoId: number; negocioId: string; codigo: string; lineas: LineaCarrito[]; solicitudId: string; totalEsperado: string };
export function validarSolicitudCobro(valor: unknown): SolicitudCobro | null {
  if (!valor || typeof valor !== 'object') return null;
  const v = valor as Record<string, unknown>;
  if (!Number.isSafeInteger(v.eventoId) || (v.eventoId as number) <= 0 || (v.eventoId as number) > 2147483647
    || !id(v.negocioId) || typeof v.codigo !== 'string' || !v.codigo.trim() || v.codigo.length > 255
    || typeof v.solicitudId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.solicitudId)
    || typeof v.totalEsperado !== 'string' || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(v.totalEsperado)
    || !Array.isArray(v.lineas) || v.lineas.length < 1 || v.lineas.length > 50) return null;
  const lineas: LineaCarrito[] = [];
  for (const l of v.lineas) {
    if (!l || typeof l !== 'object' || !id(l.productoId) || !Number.isSafeInteger(l.cantidad) || l.cantidad < 1 || l.cantidad > 999) return null;
    lineas.push({ productoId: l.productoId, cantidad: l.cantidad });
  }
  if (new Set(lineas.map(l => l.productoId)).size !== lineas.length) return null;
  return { eventoId: v.eventoId as number, negocioId: v.negocioId, codigo: v.codigo.trim(),
    solicitudId: v.solicitudId, totalEsperado: v.totalEsperado, lineas };
}
export const errorCobro = (mensaje: string) => {
  const mensajes: Record<string, string> = {
    PRECIO_CAMBIO: 'Cambió un precio. Actualiza el catálogo antes de volver a cobrar.',
    SALDO_INSUFICIENTE: 'El saldo gastable no alcanza. Los puntos reservados no se pueden gastar.',
    SALDO_NO_DISPONIBLE: 'El asistente no tiene un saldo disponible para este evento.',
    PRODUCTO_NO_DISPONIBLE: 'Un producto no está disponible en este negocio.',
    SOLICITUD_REUTILIZADA: 'La solicitud ya corresponde a otra selección. Revisa el historial.',
    QR_NO_VALIDO_PARA_VENTA: 'El QR no permite realizar una venta.',
    NEGOCIO_NO_AUTORIZADO: 'El negocio ya no está autorizado para este evento.',
    SIN_PERMISOS: 'No tienes permisos para cobrar en este negocio y evento.',
  };
  return Object.entries(mensajes).find(([codigo]) => mensaje.includes(codigo))?.[1] ?? 'No se pudo confirmar el cobro. Revisa la selección y tus permisos.';
};
