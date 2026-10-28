// Consultas del panel Admin para las solicitudes de evento (Sprint 2 · Dev A). SOLO servidor.
import { createClient } from '@/lib/supabase/server'
import { ZONA_HORARIA } from '@/lib/eventos/format'

export type EstadoSolicitud = 'en_revision' | 'aprobada' | 'rechazada'

export type SolicitudAdmin = {
  id: string
  estado: EstadoSolicitud
  solicitadoEn: string
  eventoId: string | null
  titulo: string
  fechaInicio: string | null
  fechaFin: string | null
  solicitanteNombre: string | null
  solicitanteCorreo: string | null
}

type Uno<T> = T | T[] | null
type Fila = {
  id: string | number
  estado: EstadoSolicitud
  solicitado_en: string
  evento_id: string | number | null
  eventos: Uno<{ id: string | number; titulo: string; fecha_evento: string; fecha_fin: string | null }>
  usuarios: Uno<{ nombre: string | null; correo: string | null }>
}

const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

// usuarios!usuario_id: la tabla tiene 2 FK hacia usuarios (usuario_id y revisado_por) → hay que indicar cuál
const CAMPOS =
  'id, estado, solicitado_en, evento_id, eventos ( id, titulo, fecha_evento, fecha_fin ), usuarios!usuario_id ( nombre, correo )'

function normalizar(f: Fila): SolicitudAdmin {
  const evento = uno(f.eventos)
  const usuario = uno(f.usuarios)
  return {
    id: String(f.id),
    estado: f.estado,
    solicitadoEn: f.solicitado_en,
    eventoId: f.evento_id == null ? null : String(f.evento_id),
    titulo: evento?.titulo ?? '(Solicitud sin evento)',
    fechaInicio: evento?.fecha_evento ?? null,
    fechaFin: evento?.fecha_fin ?? null,
    solicitanteNombre: usuario?.nombre ?? null,
    solicitanteCorreo: usuario?.correo ?? null,
  }
}

export async function listarSolicitudes(busqueda = ''): Promise<SolicitudAdmin[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('solicitudes_organizador')
    .select(CAMPOS)
    .order('solicitado_en', { ascending: false })
  if (error) throw new Error(`No se pudieron cargar las solicitudes: ${error.message}`)

  const todas = ((data ?? []) as unknown as Fila[]).map(normalizar)
  const q = busqueda.trim().toLowerCase()
  if (!q) return todas
  return todas.filter((s) =>
    [s.titulo, s.solicitanteNombre, s.solicitanteCorreo].some((t) => t?.toLowerCase().includes(q))
  )
}

export async function obtenerSolicitud(id: string): Promise<SolicitudAdmin | null> {
  if (!/^\d+$/.test(id)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.from('solicitudes_organizador').select(CAMPOS).eq('id', id).maybeSingle()
  if (error || !data) return null
  return normalizar(data as unknown as Fila)
}

// "05 Ago – 07 Ago 2026" (hora de Bolivia)
export function formatearRangoCorto(inicio: string | null, fin: string | null): string {
  if (!inicio) return 'Fecha por definir'
  const diaMes = (iso: string) =>
    new Intl.DateTimeFormat('es-BO', { timeZone: ZONA_HORARIA, day: '2-digit', month: 'short' })
      .format(new Date(iso))
      .replace('.', '')
      .replace(/\s*(-| de )\s*/, ' ')
      .replace(/\b([a-záéíóú])/, (m) => m.toUpperCase())
  const anio = new Intl.DateTimeFormat('es-BO', { timeZone: ZONA_HORARIA, year: 'numeric' }).format(new Date(inicio))
  return fin && fin !== inicio ? `${diaMes(inicio)} – ${diaMes(fin)} ${anio}` : `${diaMes(inicio)} ${anio}`
}
