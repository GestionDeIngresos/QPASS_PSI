// ════════════════════════════════════════════════════════════════
// Guardado compartido de eventos (Sprint 2 · Dev A). SOLO servidor.
// Lo usan: Admin (HU 31), Organizador (HU 20) y Solicitud (HU 18).
// Escribe evento + tickets en UNA transacción (función SQL guardar_evento_completo).
// La seguridad real la da RLS: cada pantalla pasa SU cliente de Supabase.
// ════════════════════════════════════════════════════════════════
import type { createClient } from '@/lib/supabase/server'
import type { TipoAcceso } from '@/lib/eventos/types'
import {
  aIsoBolivia,
  partesBolivia,
  validarTodo,
  type EventoBorrador,
  type ResultadoGuardado,
} from '@/lib/eventos/wizard-types'

type SupabaseServidor = Awaited<ReturnType<typeof createClient>>
export type EstadoEvento = 'borrador' | 'pendiente_aprobacion' | 'aprobado' | 'publicado'

type Opciones = {
  /** Si se omite al EDITAR, el estado no cambia. Al CREAR es obligatorio. */
  estado?: EstadoEvento
  /** Solo al crear: dueño del evento */
  organizadorId?: string
}

export async function guardarEventoCompleto(
  supabase: SupabaseServidor,
  datos: EventoBorrador,
  opciones: Opciones = {}
): Promise<ResultadoGuardado> {
  const invalido = validarTodo(datos)
  if (invalido) return { ok: false, error: invalido.error }

  const categoria = Number(datos.categoriaId)
  const { data, error } = await supabase.rpc('guardar_evento_completo', {
    p_evento_id: datos.id ? Number(datos.id) : null,
    p_organizador_id: opciones.organizadorId ?? null,
    p_estado: opciones.estado ?? null,
    p_datos: {
      titulo: datos.titulo.trim(),
      descripcion: datos.descripcion.trim(),
      foto_url: datos.fotoUrl,
      ubicacion: datos.ubicacion.trim(),
      mapa_url: datos.mapaUrl,
      fecha_evento: aIsoBolivia(datos.fechaInicio, datos.horaInicio),
      fecha_fin: aIsoBolivia(datos.fechaFin, datos.horaFin),
      tipo_acceso: datos.tipoAcceso,
      categoria_id: datos.categoriaId && Number.isInteger(categoria) ? categoria : null,
    },
    p_tickets: datos.tickets.map((t) => ({
      id: t.id ? Number(t.id) : null,
      nombre: t.nombre.trim(),
      descripcion: t.descripcion.trim(),
      precio: Number(t.precio),
      cantidad_disponible: Number(t.cantidad),
      limite_por_usuario: Number(t.limite),
    })),
  })

  if (error) {
    if (error.code === '23503')
      return {
        ok: false,
        error: 'No se puede quitar un ticket que ya tiene entradas vendidas. Déjalo y pon su cantidad en 0.',
      }
    if (error.code === '42501') return { ok: false, error: 'No tienes permisos para guardar este evento.' }
    if (error.code === 'P0001') return { ok: false, error: error.message }
    return { ok: false, error: `No se pudo guardar el evento (${error.message}).` }
  }
  return { ok: true, eventoId: String(data) }
}

/** HU 18: crea el evento en "pendiente_aprobacion" + su fila en solicitudes_organizador ("en_revision") */
export async function crearSolicitudDeEvento(
  supabase: SupabaseServidor,
  datos: EventoBorrador,
  usuarioId: string
): Promise<ResultadoGuardado> {
  const resultado = await guardarEventoCompleto(
    supabase,
    { ...datos, id: undefined },
    { estado: 'pendiente_aprobacion', organizadorId: usuarioId }
  )
  if (!resultado.ok || !resultado.eventoId) return resultado

  const { error } = await supabase
    .from('solicitudes_organizador')
    .insert({ usuario_id: usuarioId, evento_id: Number(resultado.eventoId), estado: 'en_revision' })
  if (error) {
    await supabase.from('eventos').delete().eq('id', Number(resultado.eventoId)) // no dejar un evento huérfano
    return { ok: false, error: 'No se pudo registrar la solicitud. Intenta de nuevo.' }
  }
  return { ok: true, eventoId: resultado.eventoId, mensaje: 'Solicitud enviada. Un administrador la revisará.' }
}

// ─── Cargar un evento existente como borrador (para editar) ──────
type FilaTicket = {
  id: string | number
  nombre: string
  descripcion: string | null
  precio: number | string
  cantidad_disponible: number | null
  limite_por_usuario: number | null
}
type FilaEvento = {
  id: string | number
  titulo: string
  descripcion: string | null
  foto_url: string | null
  ubicacion: string | null
  mapa_url: string | null
  fecha_evento: string
  fecha_fin: string | null
  tipo_acceso: TipoAcceso
  categoria_id: string | number | null
  tipos_ticket: FilaTicket[] | null
}

export async function cargarBorrador(
  supabase: SupabaseServidor,
  eventoId: string
): Promise<EventoBorrador | null> {
  if (!/^\d+$/.test(eventoId)) return null
  const { data, error } = await supabase
    .from('eventos')
    .select(
      'id, titulo, descripcion, foto_url, ubicacion, mapa_url, fecha_evento, fecha_fin, tipo_acceso, categoria_id, tipos_ticket ( id, nombre, descripcion, precio, cantidad_disponible, limite_por_usuario )'
    )
    .eq('id', eventoId)
    .maybeSingle()
  if (error || !data) return null

  const f = data as unknown as FilaEvento
  const inicio = partesBolivia(f.fecha_evento)
  const fin = partesBolivia(f.fecha_fin ?? f.fecha_evento)
  const tickets = [...(f.tipos_ticket ?? [])].sort((a, b) => Number(a.id) - Number(b.id))

  return {
    id: String(f.id),
    titulo: f.titulo,
    descripcion: f.descripcion ?? '',
    categoriaId: f.categoria_id == null ? '' : String(f.categoria_id),
    fotoUrl: f.foto_url ?? '',
    ubicacion: f.ubicacion ?? '',
    mapaUrl: f.mapa_url ?? '',
    tipoAcceso: f.tipo_acceso,
    tickets: tickets.map((t) => ({
      id: String(t.id),
      nombre: t.nombre,
      descripcion: t.descripcion ?? '',
      precio: String(Number(t.precio)),
      cantidad: String(t.cantidad_disponible ?? 0),
      limite: String(t.limite_por_usuario ?? 1),
    })),
    fechaInicio: inicio.fecha,
    horaInicio: inicio.hora,
    fechaFin: fin.fecha,
    horaFin: fin.hora,
  }
}
