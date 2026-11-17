'use server';

import { revalidatePath } from 'next/cache';
import { obtenerSesionActual } from '@/lib/auth/sesion';
import { validarReporte, type ReporteInput, type ResultadoReporte } from '@/lib/reportes/entradas';

export async function reportarEntrada(input: ReporteInput): Promise<ResultadoReporte> {
  const datos = validarReporte(input);
  if (!datos) return { ok: false, error: 'Selecciona una entrada y describe el problema con entre 5 y 2000 caracteres.' };
  try {
    const sesion = await obtenerSesionActual();
    if (!sesion || sesion.perfil?.activo !== true) return { ok: false, error: 'Inicia sesión con una cuenta activa para enviar el reporte.' };
    const { data, error } = await sesion.supabase.rpc('reportar_entrada_propia', {
      p_entrada: datos.entradaId, p_descripcion: datos.descripcion, p_solicitud: input.solicitudId,
    });
    if (error) {
      const codigo = error.message.trim();
      if (['NO_AUTH', 'CUENTA_INACTIVA'].includes(codigo)) return { ok: false, error: 'Tu sesión o cuenta ya no permite enviar el reporte.' };
      if (codigo === 'ENTRADA_NO_AUTORIZADA') return { ok: false, error: 'No puedes reportar esta entrada. Debe ser de una compra confirmada que pagaste o estar asignada a tu cuenta.' };
      if (codigo === 'SOLICITUD_REUTILIZADA') return { ok: false, error: 'La solicitud ya se utilizó con otros datos. Actualiza la página antes de volver a intentarlo.' };
      if (['REPORTE_ALTERA_ENTRADA', 'REPORTE_INCONSISTENTE'].includes(codigo)) return { ok: false, error: 'No se pudo registrar el reporte de forma segura. Contacta al administrador.' };
      return { ok: false, error: 'No se pudo enviar el reporte. Inténtalo de nuevo en unos minutos.' };
    }
    if (!Number.isInteger(data) || data < 1 || data > 2147483647) return { ok: false, error: 'No se pudo confirmar el reporte. Reintenta con los mismos datos.' };
    revalidatePath('/mis-compras');
    revalidatePath('/admin/reportes');
    return { ok: true, reporteId: data };
  } catch {
    return { ok: false, error: 'No pudimos conectar. Reintenta con los mismos datos para evitar duplicar el reporte.' };
  }
}
