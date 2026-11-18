import 'server-only';
import { obtenerSesionActual } from '@/lib/auth/sesion';
import type { DatosReportes, EntradaReportable, ReporteEntrada } from './entradas';

export async function obtenerReportesEntrada(): Promise<DatosReportes> {
  try {
    const sesion = await obtenerSesionActual();
    if (!sesion || sesion.perfil?.activo !== true) return { disponible: false, mensaje: 'Inicia sesión con una cuenta activa para consultar reportes.' };
    const { data, error } = await sesion.supabase.rpc('consultar_mis_reportes_entrada');
    if (error || !data || !Array.isArray(data.entradas) || !Array.isArray(data.reportes)) {
      return { disponible: false, mensaje: 'Los reportes no están disponibles en este momento. Puedes seguir consultando tus compras.' };
    }
    // DTO explícito: nunca propagar QR, correos u otros campos añadidos por la BD.
    return {
      disponible: true, usuarioId: sesion.user.id,
      entradas: data.entradas.map((e: EntradaReportable) => ({ id: e.id, evento: e.evento, tipo_entrada: e.tipo_entrada })),
      reportes: data.reportes.map((r: ReporteEntrada) => ({ id: r.id, entrada_id: r.entrada_id, evento: r.evento, descripcion: r.descripcion, estado: r.estado, creado_en: r.creado_en })),
    };
  } catch {
    return { disponible: false, mensaje: 'No se pudieron consultar tus reportes. Inténtalo de nuevo.' };
  }
}
