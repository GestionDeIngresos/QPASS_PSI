// ════════════════════════════════════════════════════════════════
// Consultas del panel del organizador (Sprint 2 · Dev B). SOLO servidor.
// Cada consulta filtra por el usuario actual Y además RLS lo exige
// (supabase/sprint2_devB_organizador.sql): son dos barreras.
// ════════════════════════════════════════════════════════════════
import type { createClient } from '@/lib/supabase/server'
import type { TipoAcceso } from '@/lib/eventos/types'
import type {
  EstadisticasEvento,
  EstadoEventoPropio,
  EstadoSolicitud,
  EventoPropio,
  SolicitudPropia,
} from '@/lib/organizador/types'

type SupabaseServidor = Awaited<ReturnType<typeof createClient>>

// ─── ZONA EDITABLE ───────────────────────────────────────────────
/** Estados de evento que aparecen (y se pueden editar) en "Mis Eventos" */
export const ESTADOS_EDITABLES: EstadoEventoPropio[] = ['aprobado', 'publicado']
/** Máximo de solicitudes "en revisión" a la vez por usuario (evita saturar al admin) */
export const MAX_SOLICITUDES_EN_REVISION = 5
// ─────────────────────────────────────────────────────────────────

type Uno<T> = T | T[] | null
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

// ════════════════════════════════════════════════════════════════
// MIS SOLICITUDES (HU 19)
// ════════════════════════════════════════════════════════════════
type FilaSolicitud = {
  id: string | number
  estado: EstadoSolicitud
  solicitado_en: string
  evento_id: string | number | null
  eventos: Uno<{ titulo: string; fecha_evento: string; fecha_fin: string | null }>
}

export async function listarMisSolicitudes(supabase: SupabaseServidor, userId: string): Promise<SolicitudPropia[]> {
  const { data, error } = await supabase
    .from('solicitudes_organizador')
    .select('id, estado, solicitado_en, evento_id, eventos ( titulo, fecha_evento, fecha_fin )')
    .eq('usuario_id', userId)
    .order('solicitado_en', { ascending: false })
  if (error) throw new Error(`No se pudieron cargar tus solicitudes: ${error.message}`)

  return ((data ?? []) as unknown as FilaSolicitud[]).map((f) => {
    const evento = uno(f.eventos)
    return {
      id: String(f.id),
      estado: f.estado,
      solicitadoEn: f.solicitado_en,
      eventoId: f.evento_id == null ? null : String(f.evento_id),
      titulo: evento?.titulo ?? '(Solicitud sin evento)',
      fechaInicio: evento?.fecha_evento ?? null,
      fechaFin: evento?.fecha_fin ?? null,
    }
  })
}

/** ¿Cuántas solicitudes tiene el usuario esperando respuesta? */
export async function contarSolicitudesEnRevision(supabase: SupabaseServidor, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('solicitudes_organizador')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', userId)
    .eq('estado', 'en_revision')
  if (error) throw new Error(`No se pudieron contar tus solicitudes: ${error.message}`)
  return count ?? 0
}

// ════════════════════════════════════════════════════════════════
// MIS EVENTOS (HU 21)
// ════════════════════════════════════════════════════════════════
type FilaEstadisticas = {
  usuarios: number | string
  entradas_vendidas: number | string
  ingreso_entradas: number | string
  ingreso_servicios: number | string
  ingreso_total: number | string
}

const ESTADISTICAS_VACIAS: EstadisticasEvento = {
  usuarios: 0,
  entradasVendidas: 0,
  ingresoEntradas: 0,
  ingresoServicios: 0,
  ingresoTotal: 0,
}

/** Función SQL estadisticas_evento: solo responde al dueño del evento o a un admin */
export async function obtenerEstadisticas(supabase: SupabaseServidor, eventoId: string): Promise<EstadisticasEvento> {
  const { data, error } = await supabase.rpc('estadisticas_evento', { p_evento_id: Number(eventoId) })
  if (error) throw new Error(`No se pudieron cargar las estadísticas: ${error.message}`)
  const fila = ((data ?? []) as unknown as FilaEstadisticas[])[0]
  if (!fila) return ESTADISTICAS_VACIAS
  return {
    usuarios: Number(fila.usuarios),
    entradasVendidas: Number(fila.entradas_vendidas),
    ingresoEntradas: Number(fila.ingreso_entradas),
    ingresoServicios: Number(fila.ingreso_servicios),
    ingresoTotal: Number(fila.ingreso_total),
  }
}

type FilaEvento = {
  id: string | number
  titulo: string
  foto_url: string | null
  ubicacion: string | null
  fecha_evento: string
  fecha_fin: string | null
  tipo_acceso: TipoAcceso
  estado: EstadoEventoPropio
}

/** Eventos propios aprobados o publicados, con sus estadísticas. Los próximos primero. */
export async function listarMisEventos(supabase: SupabaseServidor, userId: string): Promise<EventoPropio[]> {
  const { data, error } = await supabase
    .from('eventos')
    .select('id, titulo, foto_url, ubicacion, fecha_evento, fecha_fin, tipo_acceso, estado')
    .eq('organizador_id', userId)
    .in('estado', ESTADOS_EDITABLES)
  if (error) throw new Error(`No se pudieron cargar tus eventos: ${error.message}`)

  const filas = (data ?? []) as unknown as FilaEvento[]
  const ahora = Date.now()
  const ordenados = [...filas].sort((a, b) => {
    const pa = new Date(a.fecha_evento).getTime()
    const pb = new Date(b.fecha_evento).getTime()
    const futuroA = pa >= ahora
    const futuroB = pb >= ahora
    if (futuroA !== futuroB) return futuroA ? -1 : 1 // próximos antes que pasados
    return futuroA ? pa - pb : pb - pa //               próximos: el más cercano; pasados: el más reciente
  })

  const estadisticas = await Promise.all(ordenados.map((f) => obtenerEstadisticas(supabase, String(f.id))))
  return ordenados.map((f, i) => ({
    id: String(f.id),
    titulo: f.titulo,
    fotoUrl: f.foto_url,
    ubicacion: f.ubicacion,
    fechaInicio: f.fecha_evento,
    fechaFin: f.fecha_fin,
    tipoAcceso: f.tipo_acceso,
    estado: f.estado,
    estadisticas: estadisticas[i],
  }))
}

/** ¿Este evento es mío y está en un estado editable? (para /editar y la acción de guardar) */
export async function obtenerMiEvento(
  supabase: SupabaseServidor,
  userId: string,
  eventoId: string
): Promise<{ id: string; estado: string } | null> {
  if (!/^\d+$/.test(eventoId)) return null
  const { data, error } = await supabase
    .from('eventos')
    .select('id, estado')
    .eq('id', eventoId)
    .eq('organizador_id', userId)
    .maybeSingle()
  if (error || !data) return null
  const fila = data as unknown as { id: string | number; estado: string }
  return { id: String(fila.id), estado: fila.estado }
}
