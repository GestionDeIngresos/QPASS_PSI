'use server';

import { exigirEventoAyudante } from '@/lib/ayudante/auth';
import { validarSolicitudCobro, errorCobro } from '@/lib/ayudante/cobro';
import { revalidatePath } from 'next/cache';
import type { VentaConfirmadaVista } from '@/lib/ayudante/contracts';

type Resultado = { estado: 'confirmada'; venta: Pick<VentaConfirmadaVista, 'id' | 'referencia' | 'total'> }
  | { estado: 'rechazada' | 'incierto'; mensaje: string };

export async function confirmarCobro(input: unknown): Promise<Resultado> {
  const datos = validarSolicitudCobro(input);
  if (!datos) return { estado: 'rechazada', mensaje: 'Revisa el QR y los productos seleccionados.' };
  const { sesion } = await exigirEventoAyudante(datos.eventoId);
  if (process.env.QPASS_COMERCIO_REAL !== 'true') return { estado: 'rechazada', mensaje: 'El cobro aún no está habilitado.' };
  try {
    const { data, error } = await sesion.supabase.rpc('cobrar_venta', {
      p_evento: datos.eventoId, p_negocio: Number(datos.negocioId), p_codigo: datos.codigo,
      p_lineas: datos.lineas.map(l => ({ producto_id: Number(l.productoId), cantidad: l.cantidad })),
      p_solicitud: datos.solicitudId, p_total_esperado: datos.totalEsperado,
    });
    if (error) {
      // Solo un error emitido por PostgreSQL acredita rollback. Red/timeout
      // pueden esconder una transacción confirmada: conservar solicitud y payload.
      const rechazo = ['P0001', '42501', '22023', '23514', '40001', '40P01', '55P03', '57014'].includes(error.code);
      return { estado: rechazo ? 'rechazada' : 'incierto', mensaje: rechazo ? errorCobro(error.message) : 'No se conoce el resultado. Reintenta la misma solicitud o consulta el historial.' };
    }
    if (!data || typeof data.id !== 'string' || !/^[1-9]\d*$/.test(data.id)
      || typeof data.total !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(data.total)
      || typeof data.referencia !== 'string') return { estado: 'incierto', mensaje: 'No se pudo verificar la respuesta. Conserva esta solicitud y revisa el historial.' };
    revalidatePath('/ayudante'); revalidatePath('/ayudante/historial');
    return { estado: 'confirmada', venta: { id: data.id, referencia: data.referencia, total: data.total } };
  } catch {
    return { estado: 'incierto', mensaje: 'Se perdió la conexión. Reintenta sin cambiar la selección ni la solicitud.' };
  }
}

export async function consultarAsistenteVenta(eventoId: number, negocioId: string, codigo: string) {
  if (!Number.isSafeInteger(eventoId) || eventoId <= 0 || eventoId > 2147483647
    || typeof negocioId !== 'string' || !/^[1-9]\d{0,8}$/.test(negocioId)
    || typeof codigo !== 'string' || !codigo.trim() || codigo.length > 255) return { ok: false as const, mensaje: 'Revisa el negocio y el QR.' };
  const { sesion } = await exigirEventoAyudante(eventoId);
  if (process.env.QPASS_COMERCIO_REAL !== 'true') return { ok: false as const, mensaje: 'El cobro aún no está habilitado.' };
  try {
    const { data, error } = await sesion.supabase.rpc('consultar_saldo_venta', { p_evento: eventoId, p_negocio: Number(negocioId), p_codigo: codigo.trim() });
    if (error || !data || typeof data.nombre !== 'string' || !['saldo', 'reservado', 'gastable'].every(k => typeof data[k] === 'string' && /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(data[k]))) {
      return { ok: false as const, mensaje: 'No se pudo verificar el QR y el saldo para esta venta.' };
    }
    return { ok: true as const, nombre: data.nombre as string, saldo: data.saldo as string, reservado: data.reservado as string, gastable: data.gastable as string };
  } catch { return { ok: false as const, mensaje: 'No se pudo consultar el saldo. Inténtalo de nuevo.' }; }
}
