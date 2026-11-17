export const MIN_DESCRIPCION = 5;
export const MAX_DESCRIPCION = 2000;
export type EntradaReportable = { id: number; evento: string; tipo_entrada: string };
export type ReporteEntrada = {
  id: number; entrada_id: number; evento: string; descripcion: string;
  estado: 'pendiente' | 'solucionado'; creado_en: string;
};
export type DatosReportes =
  | { disponible: true; usuarioId: string; entradas: EntradaReportable[]; reportes: ReporteEntrada[] }
  | { disponible: false; mensaje: string };
export type ReporteInput = { entradaId: string; descripcion: string; solicitudId: string };
export type ResultadoReporte = { ok: true; reporteId: number } | { ok: false; error: string };

export function validarReporte(input: ReporteInput): { entradaId: number; descripcion: string } | null {
  if (typeof input?.entradaId !== 'string' || !/^[1-9]\d{0,9}$/.test(input.entradaId) || Number(input.entradaId) > 2147483647) return null;
  if (typeof input?.descripcion !== 'string' || typeof input?.solicitudId !== 'string') return null;
  const descripcion = input.descripcion.trim();
  if (descripcion.length < MIN_DESCRIPCION || descripcion.length > MAX_DESCRIPCION) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.solicitudId)) return null;
  return { entradaId: Number(input.entradaId), descripcion };
}

/** Persistir antes del envío: un reintento tras recargar conserva el mismo UUID. */
export async function obtenerSolicitudReporte(usuarioId: string, entradaId: string, descripcion: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([entradaId, descripcion.trim()])));
  const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  const clave = `qpass:reporte-entrada:${usuarioId}:${hash}`;
  const anterior = sessionStorage.getItem(clave);
  const id = anterior ?? crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Solicitud inválida');
  sessionStorage.setItem(clave, id);
  return { id, clave };
}
